import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PdfDoc } from '../types'

const PANE = 'visor-pdf'
const TITLE = 'Visor PDF'
const RECENT = 'recent'
// Change the tag when PdfDoc's fields change: it declines what an earlier
// version stored, which outlives a reload.
const doc = atom({ plugin: 'visor-pdf', key: 'doc' } as const, null, {
  shape: 'doc-1',
})

// Renders one page with PyMuPDF and prints it as JPEG strips, each small
// enough that its base64 fits an Svg's 131072 characters.
const RENDER = `
import base64, json, sys
try:
    import pymupdf
except ImportError:
    import fitz as pymupdf

LIMIT = 95000
path, page, width = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
pdf = pymupdf.open(path)
count = pdf.page_count
page = max(0, min(page, count - 1))
pg = pdf[page]
r = pg.rect
zoom = width / r.width
matrix = pymupdf.Matrix(zoom, zoom)

def strips_of(k, quality):
    out = []
    for i in range(k):
        clip = pymupdf.Rect(r.x0, r.y0 + r.height * i / k, r.x1, r.y0 + r.height * (i + 1) / k)
        pix = pg.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        data = pix.tobytes("jpeg", jpg_quality=quality)
        if len(data) > LIMIT:
            return None
        out.append({"w": pix.width, "h": pix.height, "jpeg": base64.b64encode(data).decode()})
    return out

strips = []
for quality in (82, 60):
    for k in range(1, 13):
        strips = strips_of(k, quality)
        if strips:
            break
    if strips:
        break

print(json.dumps({"pages": count, "page": page, "strips": strips or []}))
`

type Strip = { w: number; h: number; jpeg: string }
type Shot = { pages: number; page: number; strips: Strip[] } | { error: string }

// Rendered pages by path, modification time, page and width. A reload starts
// it over, and the pane renders again what it shows.
const shots = new Map<string, Promise<Shot>>()
const pageCounts = new Map<string, number>()

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

const clean = (typed: string) =>
  typed.trim().replace(/^["']|["']$/g, '').replace(/^file:\/\/\/?/i, '')

async function python($: EngineInterface, argv: string[]) {
  for (const exe of ['python', 'py']) {
    try {
      return await $.process.run([exe, '-', ...argv], {
        stdin: RENDER,
        timeoutMs: 60_000,
      })
    } catch {
      // Not on PATH: try the next launcher.
    }
  }

  return null
}

async function rasterize(
  $: EngineInterface,
  path: string,
  mtimeMs: number,
  page: number,
  width: number,
): Promise<Shot> {
  const id = `${path}|${mtimeMs}|${page}|${width}`
  let shot = shots.get(id)

  if (!shot) {
    shot = (async (): Promise<Shot> => {
      const ran = await python($, [path, String(page), String(width)])

      if (!ran) {
        return { error: 'No encontré Python en el PATH (python o py).' }
      }

      if (ran.exitCode !== 0) {
        return /No module named/.test(ran.stderr)
          ? { error: 'Falta PyMuPDF. Instalalo con: python -m pip install pymupdf' }
          : { error: ran.stderr.trim().split('\n').pop() || 'No pude leer el PDF.' }
      }

      const parsed = JSON.parse(ran.stdout) as Shot

      if ('pages' in parsed) {
        pageCounts.set(path, parsed.pages)
      }

      return parsed
    })()
    shots.set(id, shot)
    void shot.then(one => 'error' in one && shots.delete(id))
  }

  return shot
}

async function remember($: EngineInterface, paths: string[]) {
  const before = ((await $.store.get(RECENT)) as string[] | undefined) ?? []
  const after = [...paths, ...before.filter(one => !paths.includes(one))]
  await $.store.set(RECENT, after.slice(0, 12))
}

// Resolves what was typed or sent to an absolute .pdf path, or says why not.
async function resolvePdf($: EngineInterface, typed: string) {
  const path = clean(typed)

  if (!/\.pdf$/i.test(path)) {
    return { error: `No es un .pdf: ${path}` }
  }

  try {
    const stat = await $.fs.stat(path, { resolve: true })

    return stat.kind === 'file'
      ? { path: stat.realPath ?? path }
      : { error: `No es un archivo: ${path}` }
  } catch {
    return { error: `No existe: ${path}` }
  }
}

async function show($: EngineInterface, typed: string) {
  const found = await resolvePdf($, typed)

  if ('error' in found) {
    $.ui.toast(found.error)

    return false
  }

  await remember($, [found.path])
  await update($, doc, () => ({ path: found.path, page: 0 }))
  await $.ui.open({ id: PANE, title: TITLE })

  return true
}

function turn($: EngineInterface, delta: number) {
  return update($, doc, current => {
    if (!current) {
      return current
    }

    const last = (pageCounts.get(current.path) ?? current.page + 1) - 1

    return { ...current, page: Math.max(0, Math.min(last, current.page + delta)) }
  })
}

const svgOf = (strip: Strip) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${strip.w} ${strip.h}" width="${strip.w}" height="${strip.h}">` +
  `<image href="data:image/jpeg;base64,${strip.jpeg}" width="${strip.w}" height="${strip.h}"/></svg>`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'verpdf',
      description: 'Abrir un PDF en el panel Visor PDF',
      argumentHint: '<ruta del .pdf>',
    })

    return next(e)
  })

  on('command.run', { command: 'verpdf' }, async ($, e) => {
    if (!e.args.trim()) {
      await $.ui.open({ id: PANE, title: TITLE, focus: true })

      return { text: 'Visor PDF abierto.' }
    }

    const isShown = await show($, e.args)

    return { text: isShown ? `Mostrando ${baseName(clean(e.args))}.` : 'No pude abrir ese PDF.' }
  })

  // A PDF sent to the chat opens in the pane, the others go to the recent list.
  on('tool.call', { tool: 'SendUserFile' }, async ($, e, next) => {
    const ran = await next(e)
    const pdfs = e.files.filter(file => /\.pdf$/i.test(file))

    if (pdfs.length > 0) {
      const found = await Promise.all(pdfs.map(file => resolvePdf($, file)))
      const paths = found.flatMap(one => ('path' in one ? [one.path] : []))

      if (paths.length > 0) {
        await remember($, paths.reverse())
        await update($, doc, () => ({ path: paths[paths.length - 1], page: 0 }))
        void $.ui.open({ id: PANE, title: TITLE })
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const current = await read($, doc)
    const recent = ((await $.store.get(RECENT)) as string[] | undefined) ?? []

    if (e.surface !== 'desktop' && e.surface !== 'vscode') {
      const { Box, Text, Button } = $.ui.resolve(e)

      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>Este panel dibuja las páginas en la app de escritorio.</Text>
          {current && (
            <Button
              key="external"
              label={`Abrir ${baseName(current.path)} afuera`}
              onPress={() => $.process.run(['explorer.exe', current.path]).catch(() => undefined)}
            />
          )}
        </Box>
      )
    }

    const { Box, Text, Button, Input, Select, Svg } = $.ui.resolve(e)
    const width = Math.min(1800, Math.max(800, Math.round((e.props.bodyColumns * 16) / 200) * 200))

    let body
    let pages = 0
    let page = 0

    if (current) {
      try {
        const stat = await $.fs.stat(current.path)
        const shot = await rasterize($, current.path, stat.mtimeMs, current.page, width)

        if ('error' in shot) {
          body = <Text color="red">{shot.error}</Text>
        } else {
          pages = shot.pages
          page = shot.page
          body = (
            <Box flexDirection="column">
              {shot.strips.map((strip, i) => (
                <Svg
                  source={svgOf(strip)}
                  alt={`${baseName(current.path)}, página ${page + 1}, parte ${i + 1} de ${shot.strips.length}`}
                />
              ))}
            </Box>
          )
        }
      } catch {
        body = <Text color="red">El archivo ya no está: {current.path}</Text>
      }
    } else {
      body = (
        <Text dimColor>
          Escribí la ruta de un PDF arriba, usá /verpdf ruta\al\archivo.pdf, o pedile a Claude que te
          mande uno: se abre acá solo.
        </Text>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Input
          key="path"
          label="PDF"
          placeholder="C:\ruta\al\archivo.pdf"
          value={current?.path ?? ''}
          submitLabel="abrir"
          onSubmit={value => void show($, value)}
        />
        {recent.length > 1 && (
          <Select
            key="recent"
            label="Recientes"
            value={current?.path ?? recent[0]}
            options={recent.map(path => ({ key: path, value: path, label: baseName(path) }))}
            onSelect={value => void show($, value)}
          />
        )}
        {current && pages > 0 && (
          <Box gap={1} alignItems="center" flexWrap="wrap">
            <Button key="prev" label="◀ Anterior" onPress={() => turn($, -1)} />
            <Text tabular>
              Página {page + 1} de {pages}
            </Text>
            <Button key="next" label="Siguiente ▶" onPress={() => turn($, 1)} />
            <Button
              key="external"
              label="Abrir afuera"
              onPress={() => $.process.run(['explorer.exe', current.path]).catch(() => undefined)}
            />
          </Box>
        )}
        {current && (
          <Text weight="semibold" wrap="truncate-middle">
            {baseName(current.path)}
          </Text>
        )}
        {body}
      </Box>
    )
  })
}
