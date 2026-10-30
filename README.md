# conscious-coding-skills

Skills y plugins para Claude Code. Cada uno vive en `plugins/<nombre>/` y se instala por separado.

| Plugin | Qué hace |
|---|---|
| [live-development-roadmap](plugins/live-development-roadmap/) | Tablero en vivo del desarrollo de un proyecto (Gantt, tarea en curso, avance, commits, tablero por fases y notas), publicado como artifact de claude.ai, que Claude mantiene al día mientras trabaja |

## Instalación

### Como plugin de Claude Code (recomendado: incluye los hooks)

```text
/plugin marketplace add <usuario>/conscious-coding-skills
/plugin install live-development-roadmap@conscious-coding-skills
```

### Solo la skill, con `npx skills`

```bash
npx skills add <usuario>/conscious-coding-skills --skill live-development-roadmap
```

Así se instala la skill sin los hooks del plugin. Funciona igual, pero nada te frena al cerrar un turno si el tablero quedó atrás.

## Estructura

```text
.claude-plugin/marketplace.json      lista de plugins del repo
plugins/<nombre>/
  .claude-plugin/plugin.json         manifiesto del plugin
  skills/<nombre>/SKILL.md           la skill (lo que instala npx skills)
  hooks/                             hooks del plugin (solo con /plugin install)
```

## Sumar una skill nueva

1. Crear `plugins/<nombre>/` con `.claude-plugin/plugin.json` y `skills/<nombre>/SKILL.md`.
2. Agregarla a `plugins` en `.claude-plugin/marketplace.json` y a la tabla de arriba.
3. Probarla local: `/plugin marketplace add <ruta-local-del-repo>` y `/plugin install <nombre>@conscious-coding-skills`.

## Licencia

MIT. Ver [LICENSE](LICENSE).
