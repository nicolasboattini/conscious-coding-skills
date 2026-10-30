# live-development-roadmap

Un tablero en vivo por proyecto, inspirado en el [Progress Tracker de Star Citizen](https://robertsspaceindustries.com/roadmap/progress-tracker/teams), que Claude mantiene al día mientras trabaja.

- **Seguimiento:**
  - encabezado con métricas (fase, tareas, verificaciones, decisiones, líneas, último commit);
  - **ahora mismo en curso**, con lo que lleva contra lo previsto;
  - **avance** con fecha estimada de cierre según el ritmo real;
  - **últimos cambios**, con los `+/−` de cada commit;
  - **Gantt** por fases o por disciplinas, con zoom de 6 h a 3 meses. Lo pendiente se proyecta después de "ahora".
- **Detalle** de cada entregable:
  - capturas de la verificación;
  - qué incluye y "hecho cuando";
  - verificación;
  - fechas y dependencias;
  - líneas cambiadas por disciplina;
  - commits.
- **Versiones:** tablero por fases, con categorías y tarjetas, y filtros por estado.
- **Notas:** decisiones, pendientes, riesgos y resúmenes, más una guía de cómo leer el tablero.
- **Pausas:** los cortes por límite de uso o esperas largas se ven en el Gantt como franjas rayadas y no cuentan en la duración de las tareas ni en el ritmo.

Estados: Hecho, En curso, Comprometido (aprobado en el plan), Provisional (puede moverse), Bloqueado y Descartado.

## Instalación

```text
/plugin marketplace add nicolasboattini/conscious-coding-skills
/plugin install live-development-roadmap@conscious-coding-skills
```

O solo la skill, sin hooks: `npx skills add nicolasboattini/conscious-coding-skills --skill live-development-roadmap`.

## Cómo funciona

La página (`skills/live-development-roadmap/assets/roadmap.html`) se publica una vez como artifact de claude.ai, privado, con base de datos propia. Claude escribe en esa base al aprobar un plan, al empezar o terminar cada entregable, en cada commit, PR o deploy, con cada decisión y con cada pausa. El trabajo suelto (un arreglo o un ajuste pedido en la charla, sin plan) también se registra: va a la fase "Ajustes y correcciones" de la versión en desarrollo. La página se redibuja sola. El dueño la puede compartir desde claude.ai; quien la ve por link solo lee.

La configuración de cada proyecto (link del tablero, disciplinas, color, idioma, redacción `simple`/`tech`) vive en `~/.claude/live-development-roadmap/proyectos/`, fuera del repo del proyecto.

## Requisitos

- Claude Code con acceso a artifacts de claude.ai (servidor MCP `claude-artifacts` o la herramienta Artifact).
- Python 3 para `scripts/ldr.py` y los hooks (solo biblioteca estándar).
- git.

## Hooks (solo instalando como plugin)

- `UserPromptSubmit`: al empezar cada pedido recuerda que todo cambio va al tablero, con o sin plan, y pasa las pausas pendientes de registrar.
- `PostToolUse` en Edit/Write: anota los archivos tocados en la sesión.
- `PostToolUse` en Bash/PowerShell: después de un `git commit`, pide registrarlo en el momento.
- `Stop`: si quedaron commits, archivos editados o cambios sin commitear (incluso los hechos por consola) sin registrar, frena el cierre del turno una vez y pide actualizar el tablero. Anota la hora del cierre.
- `StopFailure`: si el turno se corta por el límite de uso u otro error de la API, abre una pausa con esa hora.
- `SessionStart` al retomar: si pasó más de media hora, avisa para registrar la pausa.

En repos sin roadmap no hacen nada. En Windows corren con Git Bash (`python3 … || python …`).

## Uso

Pedile a Claude "creá el roadmap de este proyecto" en el repo. Después trabajá normal: cuando apruebes un plan, se carga en el tablero, y se actualiza solo mientras avanza.
