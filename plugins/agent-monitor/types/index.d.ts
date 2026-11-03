export type ItemState = 'running' | 'done' | 'stalled' | 'failed' | 'stopped' | 'killed' | string

export type Subagent = {
  id: string
  name: string
  agentType?: string
  model?: string
  state: ItemState
  startedAt: number
  endedAt?: number
  tokens: number
}

export type BackgroundTask = {
  id: string
  name: string
  kind?: 'shell' | 'monitor' | string
  command?: string
  state: ItemState
  startedAt: number
  endedAt?: number
  lastLine?: string
}

export type MonitoredSession = {
  sessionId: string
  pid?: number
  isSelf?: boolean
  name?: string
  cwd?: string
  status?: string
  entrypoint?: string
  startedAt?: number
  model?: string
  tokens?: number
  error?: string
  subagents: Subagent[]
  tasks: BackgroundTask[]
}

export type PastSession = {
  sessionId: string
  title: string
  cwd?: string
  entrypoint?: string
  lastActivityAt: number
  size: number
}

export type Snapshot = { at: number; sessions: MonitoredSession[]; history?: PastSession[] }

/** An action waiting for its second press: `<action>:<sessionId>[:<taskId>]`. */
export type PendingConfirm = string

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': {
      snapshot: Snapshot | null
      error: string | null
      confirm: PendingConfirm | null
      busy: string | null
      showHistory: boolean
    }
  }
}
