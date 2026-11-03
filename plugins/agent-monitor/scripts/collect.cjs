// Collects a snapshot of every live Claude Code session on this machine:
// its subagents and background tasks. Prints one JSON object to stdout.
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = path.join(os.homedir(), '.claude')
const PROJECTS = path.join(HOME, 'projects')
const TEMP = path.join(os.tmpdir(), 'claude')
const RECENT_MS = 60 * 60 * 1000 // finished items stay listed for an hour
const STALE_MS = 10 * 60 * 1000 // no writes for this long = not running
const now = Date.now()
const SELF = process.argv[2] // the session that asked, so the pane never offers to stop itself
const HISTORY_MS = 7 * 24 * 60 * 60 * 1000
const HISTORY_MAX = 40

const readJson = file => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return undefined }
}
const stat = file => { try { return fs.statSync(file) } catch { return undefined } }

function readSlice(file, start, length) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const n = fs.readSync(fd, buf, 0, length, start)
    return buf.subarray(0, n).toString('utf8')
  } finally { fs.closeSync(fd) }
}
const tail = (file, bytes) => {
  const s = stat(file)
  if (!s) return ''
  const start = Math.max(0, s.size - bytes)
  return readSlice(file, start, s.size - start)
}
const head = (file, bytes) => (stat(file) ? readSlice(file, 0, bytes) : '')

// Whole JSON lines from a tail read (the first one may be cut, so it is dropped).
function lines(text, isCut) {
  const all = text.split('\n')
  if (isCut) all.shift()
  const out = []
  for (const l of all) { if (l.trim()) try { out.push(JSON.parse(l)) } catch {} }
  return out
}

const isAlive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

const contextTokens = u =>
  u ? (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) : 0

function lastAssistant(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.type === 'assistant' && r.message && r.message.usage) return r
  }
}
function lastTimestamp(rows) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].timestamp) return Date.parse(rows[i].timestamp)
}

function findProjectDir(sessionId) {
  let dirs = []
  try { dirs = fs.readdirSync(PROJECTS) } catch { return }
  for (const d of dirs) if (stat(path.join(PROJECTS, d, sessionId + '.jsonl'))) return d
}

function collectSubagents(projDir, sessionId) {
  const dir = path.join(PROJECTS, projDir, sessionId, 'subagents')
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  const out = []
  for (const n of names) {
    if (!n.endsWith('.meta.json')) continue
    const id = n.slice('agent-'.length, -'.meta.json'.length)
    const file = path.join(dir, `agent-${id}.jsonl`)
    const s = stat(file)
    if (!s || now - s.mtimeMs > RECENT_MS * 24) continue
    const meta = readJson(path.join(dir, n)) || {}
    const rows = lines(tail(file, 4 * 1024 * 1024), s.size > 4 * 1024 * 1024)
    const first = lines(head(file, 64 * 1024), false)[0]
    const last = lastAssistant(rows)
    const isDone = !!last && last.message.stop_reason === 'end_turn'
    const startedAt = first && first.timestamp ? Date.parse(first.timestamp) : s.birthtimeMs
    const endedAt = lastTimestamp(rows) || s.mtimeMs
    const state = isDone ? 'done' : now - s.mtimeMs > STALE_MS ? 'stalled' : 'running'
    if (state !== 'running' && now - endedAt > RECENT_MS) continue
    out.push({
      id,
      name: meta.description || meta.agentType || id,
      agentType: meta.agentType,
      model: last && last.message.model,
      state,
      startedAt,
      endedAt: state === 'running' ? undefined : endedAt,
      tokens: contextTokens(last && last.message.usage),
      rows,
    })
  }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

function collectTasks(projDir, sessionId, mainTail, subagentIds, extraRows) {
  const dir = path.join(TEMP, projDir, sessionId, 'tasks')
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }

  // What the transcript tail says about background work.
  const describe = {} // tool_use id -> label
  const taskTool = {} // task id -> tool_use id
  const status = {} // task id -> final status
  for (const r of mainTail.rows.concat(...extraRows)) {
    const content = r.message && Array.isArray(r.message.content) ? r.message.content : []
    for (const b of content) {
      if (b.type === 'tool_use' && b.input && (b.input.run_in_background || b.name === 'Monitor'))
        describe[b.id] = { label: b.input.description || b.input.command || b.name, kind: b.name === 'Monitor' ? 'monitor' : 'shell', command: b.input.command }
      if (b.type === 'tool_result') {
        const text = typeof b.content === 'string' ? b.content
          : Array.isArray(b.content) ? b.content.map(c => c.text || '').join('') : ''
        const m = /background with ID: (\w+)|Monitor started \(task (\w+)/.exec(text)
        if (m) taskTool[m[1] || m[2]] = b.tool_use_id
      }
    }
  }
  const re = /<task-id>(\w+)<\/task-id>[\s\S]{0,200}?<status>(\w+)<\/status>/g
  for (let m; (m = re.exec(mainTail.text)); ) status[m[1]] = m[2]

  const out = []
  for (const n of names) {
    if (!n.endsWith('.output')) continue
    const id = n.slice(0, -'.output'.length)
    if (subagentIds.has(id)) continue
    const s = stat(path.join(dir, n))
    if (!s) continue
    const final = status[id]
    const isKnown = id in taskTool
    // Only tasks this transcript tail knows about, or files still being written.
    if (!isKnown && !final && now - s.mtimeMs > STALE_MS) continue
    if (final && now - s.mtimeMs > RECENT_MS) continue
    const lastLine = tail(path.join(dir, n), 4096)
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop()
    const exited = lastLine && /^\[exited with code (-?\d+)\]$/.exec(lastLine)
    const state = final ? (final === 'completed' ? 'done' : final)
      : exited ? (exited[1] === '0' ? 'done' : 'failed') : 'running'
    if (state !== 'running' && now - s.mtimeMs > RECENT_MS) continue
    out.push({
      id,
      name: (describe[taskTool[id]] || {}).label || id,
      kind: (describe[taskTool[id]] || {}).kind || 'shell',
      command: (describe[taskTool[id]] || {}).command,
      state,
      startedAt: s.birthtimeMs,
      endedAt: state === 'running' ? undefined : s.mtimeMs,
      lastLine: lastLine ? lastLine.slice(0, 200) : undefined,
    })
  }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

function collectSession(reg) {
  const projDir = findProjectDir(reg.sessionId)
  const base = {
    sessionId: reg.sessionId,
    pid: reg.pid,
    isSelf: reg.sessionId === SELF,
    name: reg.name || path.basename(reg.cwd || ''),
    cwd: reg.cwd,
    status: reg.status,
    entrypoint: reg.entrypoint,
    startedAt: reg.startedAt,
    subagents: [],
    tasks: [],
  }
  if (!projDir) return base
  const main = path.join(PROJECTS, projDir, reg.sessionId + '.jsonl')
  const size = (stat(main) || {}).size || 0
  const TAIL = 6 * 1024 * 1024
  const text = tail(main, TAIL)
  const rows = lines(text, size > TAIL)
  const last = lastAssistant(rows)
  const subagents = collectSubagents(projDir, reg.sessionId)
  return {
    ...base,
    model: last && last.message.model,
    tokens: contextTokens(last && last.message.usage),
    subagents: subagents.map(({ rows, ...a }) => a),
    tasks: collectTasks(projDir, reg.sessionId, { text, rows }, new Set(subagents.map(a => a.id)),
      subagents.map(a => a.rows)),
  }
}

const sessions = []
let files = []
try { files = fs.readdirSync(path.join(HOME, 'sessions')) } catch {}
for (const f of files) {
  if (!f.endsWith('.json')) continue
  const reg = readJson(path.join(HOME, 'sessions', f))
  if (!reg || !reg.sessionId || !isAlive(reg.pid)) continue
  try { sessions.push(collectSession(reg)) } catch (e) {
    sessions.push({ sessionId: reg.sessionId, name: reg.name, status: reg.status, error: String(e), subagents: [], tasks: [] })
  }
}
sessions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))

// The opening of the first thing the person typed, for a session never titled.
function firstPrompt(file) {
  for (const r of lines(head(file, 64 * 1024), false)) {
    if (r.type !== 'user' || !r.message) continue
    const c = r.message.content
    const text = typeof c === 'string' ? c : Array.isArray(c) ? (c.find(b => b.type === 'text') || {}).text : undefined
    if (text && !text.trimStart().startsWith('<')) return text.trim().replace(/\s+/g, ' ').slice(0, 80)
  }
}

// Sessions not running now whose transcript was written in the last week.
function collectHistory(liveIds) {
  const found = []
  let dirs = []
  try { dirs = fs.readdirSync(PROJECTS) } catch {}
  for (const d of dirs) {
    let names = []
    try { names = fs.readdirSync(path.join(PROJECTS, d)) } catch { continue }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue
      const sessionId = n.slice(0, -'.jsonl'.length)
      if (liveIds.has(sessionId)) continue
      const file = path.join(PROJECTS, d, n)
      const s = stat(file)
      if (!s || !s.isFile() || now - s.mtimeMs > HISTORY_MS) continue
      found.push({ sessionId, projDir: d, file, size: s.size, lastActivityAt: s.mtimeMs })
    }
  }
  found.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  return found.slice(0, HISTORY_MAX).map(h => {
    const rows = lines(tail(h.file, 128 * 1024), h.size > 128 * 1024)
    let title, cwd, entrypoint
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (!title && r.type === 'custom-title') title = r.customTitle
      if (!cwd && r.cwd) cwd = r.cwd
      if (!entrypoint && r.entrypoint) entrypoint = r.entrypoint
    }
    if (!title) for (let i = rows.length - 1; i >= 0 && !title; i--) if (rows[i].type === 'ai-title') title = rows[i].aiTitle
    if (!title) title = firstPrompt(h.file)
    return {
      sessionId: h.sessionId,
      title: title || h.sessionId.slice(0, 8),
      cwd,
      entrypoint,
      lastActivityAt: h.lastActivityAt,
      size: h.size,
    }
  })
}

const history = collectHistory(new Set(sessions.map(s => s.sessionId)))
process.stdout.write(JSON.stringify({ at: now, sessions, history }))
