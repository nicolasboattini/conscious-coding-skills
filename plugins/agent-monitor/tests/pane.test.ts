import { expect, test } from 'claude-code/testing'

const SESSION = '8a311596-10ae-483d-9fd3-bda9d10d51e6'
const SNAPSHOT = {
  at: 1_000_000,
  sessions: [
    {
      sessionId: SESSION,
      pid: 1234,
      isSelf: false,
      name: 'proyecto-demo',
      entrypoint: 'claude-vscode',
      status: 'busy',
      model: 'claude-sonnet-5',
      tokens: 730_000,
      subagents: [
        { id: 'a1', name: 'Actualizar guía', agentType: 'general-purpose', state: 'running', startedAt: 1_000_000 - 470_000, tokens: 152_800 },
      ],
      tasks: [
        {
          id: 't1',
          name: 'Start Next.js dev server',
          kind: 'shell',
          command: 'npm run dev',
          state: 'running',
          startedAt: 1_000_000 - 440_000,
          lastLine: 'GET /ayuda 200',
        },
      ],
    },
  ],
  history: [
    { sessionId: '98015f53-2abb-42b6-81d5-5ce79ee93ace', title: 'Procedimiento IT estructura', entrypoint: 'cli', lastActivityAt: 1_000_000 - 3_600_000, size: 2_700_000 },
  ],
}

type Run = { argv: readonly string[]; init?: { stdin?: string } }

function setUp(on: Parameters<Parameters<typeof test>[1] & ((...a: never[]) => unknown)>[1], acts: Run[]) {
  on('session.start', async (_, e) => e as never)
  on('session.id', async () => ({ value: 'self-id' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('clock.every', async () => ({ value: undefined }) as never)
  on('process.run', async (_, e) => {
    const run = e as unknown as Run
    if (run.argv.some(a => a.endsWith('act.cjs'))) {
      acts.push(run)
      return { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, message: 'Tarea detenida.' }), stderr: '' } } as never
    }
    return { value: { exitCode: 0, stdout: JSON.stringify(SNAPSHOT), stderr: '' } } as never
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: lists sessions, agents, tasks and history`, async ($, on) => {
    setUp(on as never, [])
    await $.session.start({ source: 'startup', cwd: '.' } as never)
    await $.command.run({ command: 'agentes', args: '' } as never)
    const ui = await $.ui.mount({
      plugin: 'agent-monitor',
      surface,
      component: 'Pane',
      requestId: 'agent-monitor',
      props: { title: 'Agent monitor', bodyColumns: 80 },
    } as never)
    expect(await ui.find({ type: 'Text', text: /proyecto-demo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /VS Code/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Actualizar guía/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /152\.8k tokens/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Start Next\.js dev server/ })).toBeDefined()

    await ui.press({ key: 'history-toggle' })
    expect(await ui.find({ type: 'Text', text: /Procedimiento IT estructura/ })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: stopping a task asks first, then runs the action`, async ($, on) => {
    const acts: Run[] = []
    setUp(on as never, acts)
    await $.session.start({ source: 'startup', cwd: '.' } as never)
    await $.command.run({ command: 'agentes', args: '' } as never)
    const ui = await $.ui.mount({
      plugin: 'agent-monitor',
      surface,
      component: 'Pane',
      requestId: 'agent-monitor',
      props: { title: 'Agent monitor', bodyColumns: 80 },
    } as never)

    await ui.press({ key: `stop-task:${SESSION}:t1` })
    expect(acts.length).toBe(0)
    expect(await ui.find({ type: 'Text', text: /¿Seguro\?/ })).toBeDefined()

    await ui.press({ key: `stop-task:${SESSION}:t1:yes` })
    expect(acts.length).toBe(1)
    expect(acts[0]!.argv.slice(-3)).toEqual(['stop-task', SESSION, 'self-id'])
    expect(acts[0]!.init?.stdin).toBe('npm run dev')
    await ui.unmount()
  })
}
