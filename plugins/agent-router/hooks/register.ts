import type { Register } from 'claude-code'

type Tier = 'cheap' | 'default' | 'heavy'

const CHEAP_TYPES = new Set([
  'Explore',
  'statusline-setup',
  'claude-code-guide',
  'codebase-memory-scout',
])
const HEAVY_TYPES = new Set(['Plan', 'codebase-memory-auditor'])

// Tareas mecanicas: buscar, listar, leer, resumir, formatear.
const CHEAP_WORDS =
  /\b(search|find|locate|list|grep|read|summari[sz]e|count|extract|rename|format|lint|buscar|busc[aá]|listar|list[aá]|leer|resumir|resum[ií]|contar|extraer|formatear)\b/i
// Tareas que requieren razonamiento profundo: se quedan en el modelo del padre.
const HEAVY_WORDS =
  /\b(architect|design|refactor|security|vulnerab|root cause|debug|review|migrate|arquitectura|dise[nñ]o|seguridad|causa ra[ií]z|depurar|revisar|migrar)\b/i
// Si el prompt pide cambiar algo, no es solo lectura y no puede ir a Explore.
const WRITE_WORDS =
  /\b(edit|write|create|modify|fix|implement|delete|remove|install|run|execute|commit|push|deploy|escrib[ei]|cre[aá]r?|modific|corrig|implement|elimin|borr|instal|ejecut|deploy)/i

const SHORT_PROMPT = 1200

export function classify(subagentType: string, prompt: string): Tier {
  if (HEAVY_TYPES.has(subagentType)) return 'heavy'
  if (CHEAP_TYPES.has(subagentType)) return 'cheap'
  if (HEAVY_WORDS.test(prompt)) return 'heavy'
  if (prompt.length <= SHORT_PROMPT && CHEAP_WORDS.test(prompt)) return 'cheap'
  return 'default'
}

export function isReadOnly(prompt: string): boolean {
  return !WRITE_WORDS.test(prompt)
}

const POLICY = `# Delegacion y balanceo de agentes
Antes de trabajar, divide la tarea en partes independientes. Delega con la herramienta Agent todo lo mecanico o acotado (buscar en el codigo, listar, leer varios archivos, resumir, cambios repetitivos) en lugar de hacerlo vos: un plugin enruta esos sub-agentes al tipo de agente y al modelo mas economicos. Reserva tu propio contexto para decidir, integrar y razonar. Pasa a cada sub-agente un prompt autocontenido y pedile un resultado corto.
Paralelismo: cuando haya dos o mas partes que no dependen una de otra, lanza todos esos sub-agentes en UN SOLO mensaje, con varias llamadas a Agent juntas, en vez de uno por uno. No pases de 4 sub-agentes simultaneos; si hay mas partes, agrupalas. Si una parte necesita el resultado de otra, lanzalas en pasos separados. Cuando vuelvan, integra los resultados vos.`

let routed = 0

export const register: Register = on => {
  on('agent.spawn', ($, e, next) => {
    // Forks heredan el modelo, los teammates y workflows no admiten cambios de contenido,
    // y si quien llamo ya eligio un modelo se respeta.
    if (e.fork || e.isTeammate || e.workflow || e.model) return next(e)

    const tier = classify(e.subagentType, e.prompt)
    if (tier !== 'cheap') return next(e)

    // Un general-purpose que solo lee y busca rinde igual como Explore (solo lectura, mas barato).
    const subagentType =
      e.subagentType === 'general-purpose' && isReadOnly(e.prompt) ? 'Explore' : e.subagentType

    routed += 1
    $.ui.status(`agent-router: ${routed} sub-agente(s) -> haiku`)
    return next({ ...e, subagentType, model: 'haiku' })
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: fallo el router.` }))

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    return {
      sections: [...out.sections, { id: `${$.plugin.name}:policy`, text: POLICY, scope: 'session' }],
    }
  })
}
