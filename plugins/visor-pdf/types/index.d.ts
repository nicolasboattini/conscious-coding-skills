export type PdfDoc = { path: string; page: number }

declare module 'claude-code' {
  interface PluginState {
    'visor-pdf': { doc: Shaped<PdfDoc | null> }
  }
}
