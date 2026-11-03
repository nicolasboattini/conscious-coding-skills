import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { ItemState, Snapshot } from '../types'

const PANE = 'agent-monitor'
const TITLE = 'Agent monitor'
const POLL_MS = 5000

const snapshot = atom({ plugin: 'agent-monitor', key: 'snapshot' } as const, null)
const failure = atom({ plugin: 'agent-monitor', key: 'error' } as const, null)
const confirm = atom({ plugin: 'agent-monitor', key: 'confirm' } as const, null)
const busy = atom({ plugin: 'agent-monitor', key: 'busy' } as const, null)
const showHistory = atom({ plugin: 'agent-monitor', key: 'showHistory' } as const, false)

type Action = 'stop-session' | 'delete-session' | 'stop-task'

const duration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d`
}

const tokens = (n?: number) =>
  !n ? '' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M tokens` : n >= 1000 ? `${(n / 1000).toFixed(1)}k tokens` : `${n} tokens`

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const surfaceName: Record<string, string> = {
  cli: 'CLI',
  'claude-vscode': 'VS Code',
  'claude-desktop': 'App',
  'sdk-ts': 'SDK',
  'sdk-py': 'SDK',
}
const where = (entrypoint?: string) => (entrypoint ? surfaceName[entrypoint] ?? entrypoint : '')

const dot = (state: ItemState) =>
  state === 'running' ? { glyph: '●', color: 'success' }
  : state === 'done' ? { glyph: '●', color: 'inactive' }
  : state === 'stalled' ? { glyph: '●', color: 'warning' }
  : { glyph: '●', color: 'error' }

const stateLabel: Record<string, string> = {
  running: 'corriendo',
  done: 'terminado',
  stalled: 'sin actividad',
  failed: 'falló',
  stopped: 'detenido',
  killed: 'detenido',
}

const sessionDot = (status?: string) =>
  status === 'busy' ? { glyph: '●', color: 'success' } : { glyph: '○', color: 'inactive' }

const actionLabel: Record<Action, string> = {
  'stop-session': 'Detener',
  'delete-session': 'Borrar',
  'stop-task': 'Detener',
}

export const register: Register = on => {
  // Polling runs only while the pane is drawn somewhere: every session loads
  // this mod, and most of them never open it.
  let isOpen = false
  let poll = async () => {}
  let act = async (_action: Action, _sessionId: string, _command?: string) => {}

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agentes',
      description: 'Abre el monitor de sesiones, subagentes y tareas en segundo plano',
    })

    const root = $.plugin.root
    const selfId = await $.session.id().catch(() => '')
    poll = async () => {
      try {
        const { exitCode, stdout, stderr } = await $.process.run(['node', `${root}/scripts/collect.cjs`, selfId], {
          timeoutMs: 20000,
        })
        if (exitCode !== 0) throw new Error(stderr.trim() || `node salió con código ${exitCode}`)
        const data = JSON.parse(stdout) as Snapshot
        await update($, snapshot, () => data)
        await update($, failure, () => null)
      } catch (err) {
        await update($, failure, () => String(err))
      }
    }
    act = async (action, sessionId, command) => {
      await update($, confirm, () => null)
      await update($, busy, () => `${action}:${sessionId}`)
      try {
        const { stdout } = await $.process.run(['node', `${root}/scripts/act.cjs`, action, sessionId, selfId], {
          stdin: command ?? '',
          timeoutMs: 60000,
        })
        const { message } = JSON.parse(stdout) as { ok: boolean; message: string }
        void $.ui.toast(message)
      } catch (err) {
        void $.ui.toast(`Error: ${String(err)}`)
      } finally {
        await update($, busy, () => null)
        await poll()
      }
    }
    $.clock.every(POLL_MS, () => {
      if (isOpen) void poll()
    })

    return next(e)
  })

  on('command.run', { command: 'agentes' }, async $ => {
    isOpen = true
    await poll()
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Monitor de agentes abierto.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) isOpen = false

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    isOpen = true
    const { Box, Text, Button } = $.ui.resolve(e)
    const data = await read($, snapshot)
    const error = await read($, failure)
    const pending = await read($, confirm)
    const working = await read($, busy)
    const isHistoryOpen = await read($, showHistory)

    if (!data) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{error ? `Error: ${error}` : 'Leyendo sesiones…'}</Text>
        </Box>
      )
    }

    // A destructive button: the first press asks, the second one acts.
    const actionButton = (action: Action, sessionId: string, taskId?: string, command?: string) => {
      const id = [action, sessionId, taskId].filter(Boolean).join(':')
      if (working === `${action}:${sessionId}`) return <Text key={`${id}:busy`} dimColor> {actionLabel[action]}… </Text>
      if (pending === id) {
        return (
          <Box key={`${id}:ask`} flexDirection="row" gap={1}>
            <Text color="warning">¿Seguro?</Text>
            <Button key={`${id}:yes`} variant="primary" onPress={() => act(action, sessionId, command)}>
              Sí, {actionLabel[action].toLowerCase()}
            </Button>
            <Button key={`${id}:no`} onPress={() => update($, confirm, () => null)}>
              No
            </Button>
          </Box>
        )
      }
      return (
        <Button key={id} onPress={() => update($, confirm, () => id)}>
          {actionLabel[action]}
        </Button>
      )
    }

    const now = data.at
    const history = data.history ?? []
    const running = data.sessions.reduce(
      (n, s) => n + s.subagents.filter(a => a.state === 'running').length + s.tasks.filter(t => t.state === 'running').length,
      0,
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {data.sessions.length} {data.sessions.length === 1 ? 'sesión viva' : 'sesiones vivas'} · {running} en curso ·
          actualizado {new Date(data.at).toLocaleTimeString()}
          {error ? ' · error en la última lectura' : ''}
        </Text>

        {data.sessions.map(s => {
          const sd = sessionDot(s.status)
          return (
            <Box key={s.sessionId} flexDirection="column" borderStyle="round" paddingX={1}>
              <Text wrap="truncate-end">
                <Text color={sd.color}>{sd.glyph} </Text>
                <Text bold>{s.name || s.sessionId.slice(0, 8)}</Text>
                <Text dimColor>
                  {'  '}
                  {where(s.entrypoint)}
                  {' · '}
                  {s.status === 'busy' ? 'trabajando' : s.status === 'waiting' ? 'esperando' : s.status ?? ''}
                </Text>
              </Text>
              {s.cwd && <Text dimColor wrap="truncate-middle">{s.cwd}</Text>}
              {s.error && <Text color="error">{s.error}</Text>}
              <Box flexDirection="row" gap={1}>
                {s.isSelf ? (
                  <Text dimColor italic>(esta sesión)</Text>
                ) : (
                  [actionButton('stop-session', s.sessionId), actionButton('delete-session', s.sessionId)]
                )}
              </Box>

              <Box flexDirection="column" marginTop={1}>
                <Text color="claude" bold>
                  ◆ AGENTES ({1 + s.subagents.length})
                </Text>
                <Text wrap="truncate-end">
                  <Text color={sd.color}>  {sd.glyph} </Text>
                  <Text>Agente principal</Text>
                  <Text dimColor>
                    {s.model ? ` · ${s.model.replace(/^claude-/, '')}` : ''}
                    {s.tokens ? ` · ${tokens(s.tokens)} en contexto` : ''}
                  </Text>
                </Text>
                {s.subagents.map((a, i) => {
                  const d = dot(a.state)
                  const isLast = i === s.subagents.length - 1
                  return (
                    <Box key={a.id} flexDirection="column">
                      <Text wrap="truncate-end">
                        <Text dimColor>    {isLast ? '└─' : '├─'} </Text>
                        <Text color={d.color}>{d.glyph} </Text>
                        <Text>{a.name}</Text>
                      </Text>
                      <Text dimColor wrap="truncate-end">
                        {'    '}
                        {isLast ? '  ' : '│ '}   subagente{a.agentType ? ` ${a.agentType}` : ''} ·{' '}
                        {stateLabel[a.state] ?? a.state} · {duration((a.endedAt ?? now) - a.startedAt)}
                        {a.tokens ? ` · ${tokens(a.tokens)}` : ''}
                      </Text>
                    </Box>
                  )
                })}
              </Box>

              <Box flexDirection="column" marginTop={1}>
                <Text color="bashBorder" bold>
                  $ TAREAS EN SEGUNDO PLANO ({s.tasks.length})
                </Text>
                {s.tasks.length === 0 && <Text dimColor>  Ninguna.</Text>}
                {s.tasks.map(t => {
                  const d = dot(t.state)
                  return (
                    <Box key={t.id} flexDirection="column">
                      <Text wrap="truncate-end">
                        <Text color={d.color}>  {d.glyph} </Text>
                        <Text>{t.name}</Text>
                      </Text>
                      <Text dimColor wrap="truncate-end">
                        {'    '}
                        {t.kind ?? 'shell'} · {stateLabel[t.state] ?? t.state} · {duration((t.endedAt ?? now) - t.startedAt)}
                      </Text>
                      {t.lastLine && (
                        <Text dimColor italic wrap="truncate-end">
                          {'    '}› {t.lastLine}
                        </Text>
                      )}
                      {t.state === 'running' && t.command && (
                        <Box flexDirection="row" paddingLeft={4}>
                          {actionButton('stop-task', s.sessionId, t.id, t.command)}
                        </Box>
                      )}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}

        <Box flexDirection="column">
          <Button key="history-toggle" plain onPress={() => update($, showHistory, v => !v)}>
            {isHistoryOpen ? '▾' : '▸'} HISTORIAL · últimos 7 días ({history.length})
          </Button>
          {isHistoryOpen && history.length === 0 && <Text dimColor>  Sin sesiones inactivas.</Text>}
          {isHistoryOpen &&
            history.map(past => (
              <Box key={past.sessionId} flexDirection="column" marginTop={1} paddingLeft={2}>
                <Text wrap="truncate-end">
                  <Text color="inactive">○ </Text>
                  <Text>{past.title}</Text>
                </Text>
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {where(past.entrypoint)}
                  {past.entrypoint ? ' · ' : ''}hace {duration(now - past.lastActivityAt)} · {size(past.size)}
                </Text>
                {past.cwd && (
                  <Text dimColor wrap="truncate-middle">
                    {'  '}
                    {past.cwd}
                  </Text>
                )}
                <Box flexDirection="row" paddingLeft={2}>
                  {actionButton('delete-session', past.sessionId)}
                </Box>
              </Box>
            ))}
        </Box>
      </Box>
    )
  })
}
