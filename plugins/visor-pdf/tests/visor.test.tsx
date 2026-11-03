import { expect, mock, test } from 'claude-code/testing'

const PATH = 'C:\\docs\\cv.pdf'

const PANE = {
  plugin: 'visor-pdf',
  component: 'Pane',
  requestId: 'visor-pdf',
  props: {
    title: 'Visor PDF',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const rendered = (page: number) =>
  JSON.stringify({ pages: 2, page, strips: [{ w: 10, h: 10, jpeg: 'AAAA' }] })

test('/verpdf shows the page and turns to the next one', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'verpdf' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.stat', () => ({
    value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false, realPath: PATH },
  }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stdout: rendered(Number(e.argv[3])),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'verpdf', args: `"${PATH}"` })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Página/ }))?.text).toBe('Página 1 de 2')
  expect(await ui.find({ type: 'Svg' })).toBeDefined()

  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Text', text: /Página/ }))?.text).toBe('Página 2 de 2')

  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Text', text: /Página/ }))?.text).toBe('Página 2 de 2')
  await ui.unmount()
})

test('a missing PyMuPDF says how to install it', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'verpdf' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.stat', () => ({
    value: { kind: 'file', size: 1, mtimeMs: 2, isLink: false, realPath: PATH },
  }))
  on('process.run', () => ({
    value: {
      exitCode: 1,
      stdout: '',
      stderr: "ModuleNotFoundError: No module named 'pymupdf'",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'verpdf', args: PATH })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /PyMuPDF/ }))?.text).toContain('pip install pymupdf')
  await ui.unmount()
})

test('the terminal gets a short note, not pages', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /escritorio/ }))?.text).toBeDefined()
  await ui.unmount()
})
