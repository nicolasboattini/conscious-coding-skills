// Acts on a session or a background task the monitor lists.
//   node act.cjs stop-session   <sessionId> <selfId>
//   node act.cjs delete-session <sessionId> <selfId>
//   node act.cjs stop-task      <sessionId> <selfId>   (stdin: the task's command)
// Prints one JSON line: { ok, message }.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const HOME = path.join(os.homedir(), '.claude')
const PROJECTS = path.join(HOME, 'projects')
const TEMP = path.join(os.tmpdir(), 'claude')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const [action, sessionId, selfId] = process.argv.slice(2)
const done = (ok, message) => {
  process.stdout.write(JSON.stringify({ ok, message }))
  process.exit(0)
}

const isAlive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

function liveEntry(id) {
  let files = []
  try { files = fs.readdirSync(path.join(HOME, 'sessions')) } catch {}
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const reg = JSON.parse(fs.readFileSync(path.join(HOME, 'sessions', f), 'utf8'))
      if (reg.sessionId === id && isAlive(reg.pid)) return { ...reg, file: path.join(HOME, 'sessions', f) }
    } catch {}
  }
}

const killTree = pid => execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'pipe' })

function waitGone(pid, ms) {
  const until = Date.now() + ms
  while (isAlive(pid) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  return !isAlive(pid)
}

function stopSession(id) {
  const reg = liveEntry(id)
  if (!reg) return { ok: true, message: 'La sesión ya no estaba corriendo.' }
  killTree(reg.pid)
  if (!waitGone(reg.pid, 5000)) return { ok: false, message: `No pude detener el proceso ${reg.pid}.` }
  try { fs.rmSync(reg.file, { force: true }) } catch {}
  return { ok: true, message: `Sesión "${reg.name || id.slice(0, 8)}" detenida.` }
}

// Removes a path, retrying while Windows still holds a file the killed process had open.
function remove(p) {
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(p, { recursive: true, force: true }); return true } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
    }
  }
  return false
}

function deleteSession(id) {
  const stopped = stopSession(id)
  if (!stopped.ok) return stopped
  const targets = [path.join(HOME, 'file-history', id), path.join(HOME, 'session-env', id)]
  let dirs = []
  try { dirs = fs.readdirSync(PROJECTS) } catch {}
  for (const d of dirs) {
    targets.push(path.join(PROJECTS, d, id + '.jsonl'), path.join(PROJECTS, d, id))
    targets.push(path.join(TEMP, d, id))
  }
  const existing = targets.filter(t => fs.existsSync(t))
  if (existing.length === 0) return { ok: false, message: 'No encontré el historial de esa sesión.' }
  const failed = existing.filter(t => !remove(t))
  if (failed.length) return { ok: false, message: `No pude borrar: ${failed.join(', ')}` }
  return { ok: true, message: `Sesión borrada (${existing.length} archivos/carpetas).` }
}

function stopTask(id, command) {
  const reg = liveEntry(id)
  if (!reg) return { ok: false, message: 'La sesión de esa tarea ya no está corriendo.' }
  if (!command) return { ok: false, message: 'No conozco el comando de esa tarea, no puedo ubicar su proceso.' }
  const json = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${Number(reg.pid)}" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const children = json ? [].concat(JSON.parse(json)) : []
  // The Bash tool runs `eval '<command>'`, single quotes escaped the shell's way;
  // that exact form first, so a process that merely mentions the command is spared.
  const evalForm = `eval '${command.replace(/'/g, `'\\''`)}'`
  let match = children.filter(c => c.CommandLine && c.CommandLine.includes(evalForm))
  if (match.length === 0) match = children.filter(c => c.CommandLine && c.CommandLine.includes(command))
  if (match.length === 0) return { ok: false, message: 'No encontré el proceso de esa tarea (¿ya terminó?).' }
  for (const c of match) killTree(c.ProcessId)
  return { ok: true, message: `Tarea detenida (${match.map(c => c.ProcessId).join(', ')}).` }
}

try {
  if (!UUID.test(sessionId || '')) done(false, 'Id de sesión inválido.')
  if (sessionId === selfId && action !== 'stop-task') done(false, 'No puedo detener ni borrar la sesión desde la que estás mirando el panel.')
  if (action === 'stop-session') { const r = stopSession(sessionId); done(r.ok, r.message) }
  if (action === 'delete-session') { const r = deleteSession(sessionId); done(r.ok, r.message) }
  if (action === 'stop-task') {
    const command = fs.readFileSync(0, 'utf8')
    const r = stopTask(sessionId, command)
    done(r.ok, r.message)
  }
  done(false, `Acción desconocida: ${action}`)
} catch (e) {
  done(false, String(e && e.message || e))
}
