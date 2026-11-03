# conscious-coding-skills

Skills y plugins para Claude Code. Cada uno vive en `plugins/<nombre>/` y se instala por separado.

| Plugin | Qué hace |
|---|---|
| [live-development-roadmap](plugins/live-development-roadmap/) | Tablero en vivo del desarrollo de un proyecto (Gantt, tarea en curso, avance, commits, tablero por fases y notas), publicado como artifact de claude.ai, que Claude mantiene al día mientras trabaja |
| [agent-monitor](plugins/agent-monitor/) | Panel en vivo (`/agentes`) con los sub-agentes y las tareas en segundo plano de todas las sesiones de Claude Code de la máquina. Necesita Node |
| [agent-router](plugins/agent-router/) | Enruta cada sub-agente al tipo de agente y al modelo más baratos que alcancen para la tarea, e instruye a Claude a delegar lo mecánico |
| [visor-pdf](plugins/visor-pdf/) | Panel para ver PDFs dentro de la app: `/verpdf <ruta>`, y se abre solo cuando Claude te manda un PDF. Necesita Python con PyMuPDF (`python -m pip install pymupdf`) |

## Instalación

### Como plugin de Claude Code (recomendado: incluye los hooks)

```text
/plugin marketplace add nicolasboattini/conscious-coding-skills
/plugin install live-development-roadmap@conscious-coding-skills
```

Los demás se instalan igual, cambiando el nombre. En la app de escritorio, donde `/plugin` no corre, desde una terminal:

```bash
claude plugin marketplace add nicolasboattini/conscious-coding-skills
claude plugin install visor-pdf@conscious-coding-skills
```

Después, `/reload-plugins` en la sesión abierta.

### Solo la skill, con `npx skills`

```bash
npx skills add nicolasboattini/conscious-coding-skills --skill live-development-roadmap
```

Así se instala la skill sin los hooks del plugin. Funciona igual, pero nada te frena al cerrar un turno si el tablero quedó atrás.

## Estructura

```text
.claude-plugin/marketplace.json      lista de plugins del repo
plugins/<nombre>/
  .claude-plugin/plugin.json         manifiesto del plugin
  skills/<nombre>/SKILL.md           la skill (lo que instala npx skills)
  hooks/                             hooks del plugin (solo con /plugin install)
  hooks/register.ts(x)               mods: hooks en TypeScript que dibujan paneles o cambian el comportamiento de Claude
```

## Sumar una skill nueva

1. Crear `plugins/<nombre>/` con `.claude-plugin/plugin.json` y `skills/<nombre>/SKILL.md`.
2. Agregarla a `plugins` en `.claude-plugin/marketplace.json` y a la tabla de arriba.
3. Probarla local: `/plugin marketplace add <ruta-local-del-repo>` y `/plugin install <nombre>@conscious-coding-skills`.

## Licencia

MIT. Ver [LICENSE](LICENSE).
