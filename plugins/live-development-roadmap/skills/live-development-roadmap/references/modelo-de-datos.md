# Modelo de datos del tablero

La página (`assets/roadmap.html`) lee todo de la base del artifact y se redibuja sola cuando algo cambia. Claude escribe con la herramienta de base de datos del artifact (`db_write` en el servidor `claude-artifacts`, o la acción `write_db` de la herramienta Artifact). Nunca se reescribe la página para cambiar datos.

Fechas: siempre ISO 8601 con zona (`2026-10-30T14:05:00-03:00`). Textos: en el idioma y la redacción del proyecto (ver SKILL.md).

## `meta/proyecto` (un documento)

| Campo | Tipo | Ejemplo / nota |
|---|---|---|
| `nombre` | texto | `"CRM Grupo Bordin"` |
| `sigla` | texto, opcional | `"CRM"`, va en la barra lateral |
| `acento` | color hex | `"#e0457b"`: color del proyecto (en curso, línea de ahora, sellos) |
| `idioma` | `"es"` \| `"en"` | idioma de la interfaz |
| `redaccion` | `"simple"` \| `"tech"` | cómo están escritos los textos (no lo usa la página; queda como referencia) |
| `versionActual` | texto | `"v1.6.5"`: la versión que muestran Seguimiento y las métricas |
| `etiquetas` | objeto, opcional | renombra los niveles: `{ "version": "Versión", "fase": "Fase", "fasePlural": "Fases", "entregablePlural": "entregables", "disciplina": "Disciplina", "disciplinaPlural": "Disciplinas" }`. Un juego puede usar `"fase": "Hito"` |
| `disciplinas` | lista | `[{ "id": "pantallas", "nombre": "Pantallas" }, …]`, en el orden en que se muestran. Mismos `id` que en la configuración local (`ldr.py init --disciplina`) |
| `metricas` | objeto | `{ "verificaciones": 206, "verificacionesEtiqueta": "tests" }`: se actualiza tras cada corrida de tests o verificación |
| `actualizadoEn` | fecha | se pisa en cada escritura relevante |

Las demás métricas (tareas, decisiones, líneas, último commit) las calcula la página.

## `versiones/<id>`

El id es el código de la versión, ej. `versiones/v1.6.5`.

| Campo | Tipo | Nota |
|---|---|---|
| `nombre` | texto, opcional | ej. `"Batch Circular y precio por pax"` |
| `estado` | `"planificada"` \| `"en_desarrollo"` \| `"publicada"` | |
| `orden` | número | mayor = más nueva |
| `desde` | fecha | cuándo arrancó |
| `publicadaEn` | fecha, opcional | al deployar |
| `pr` | objeto, opcional | `{ "numero": 44, "url": "https://github.com/…/pull/44" }` |
| `resumen` | texto | una o dos frases |

## `fases/<id>`

Id sugerido: `<version>-f<n>`, ej. `fases/v1.6.5-f3`.

| Campo | Tipo | Nota |
|---|---|---|
| `version` | texto | id de la versión |
| `codigo` | texto | lo que se ve grande: `"Fase 3"` o `"#7"` |
| `nombre` | texto | `"Clasificaciones del lead"` |
| `orden` | número | orden dentro de la versión |

## `entregables/<id>`

El id ES el código visible: `T001`, `T002`… (prefijo configurable por proyecto). Los códigos no se reutilizan entre versiones: se siguen numerando.

| Campo | Tipo | Nota |
|---|---|---|
| `version`, `fase` | texto | ids |
| `titulo` | texto | corto, dice qué cambia |
| `disciplinas` | lista de ids | la primera es la categoría en Versiones |
| `estado` | `"hecho"` \| `"en_curso"` \| `"comprometido"` \| `"provisional"` \| `"bloqueado"` \| `"descartado"` | ver SKILL.md |
| `orden` | número | orden dentro de la fase |
| `previstoMin` | número | minutos estimados al planificar |
| `inicio`, `fin` | fecha | `inicio` al pasar a en curso, `fin` al pasar a hecho |
| `incluye` | texto | qué se hace, en concreto |
| `hechoCuando` | texto | criterio observable de terminado |
| `verificacion` | texto | qué se probó y con qué resultado |
| `dependeDe` | lista de ids | otros entregables |
| `lineas` | objeto | `{ "pantallas": 623, "pruebas": 83 }`: suma de `ldr.py commit` de sus commits |
| `commits` | lista | `[{ "hash", "en", "mensaje", "mas", "menos" }]` |
| `capturas` | lista | `[{ "asset": "<id de asset>", "nombre": "circular/dia-sin-fecha.png" }]`: la primera es la portada |
| `motivoBloqueo` | texto | solo si está bloqueado |
| `agente` | texto, opcional | quién lo hizo si fue un sub-agente |

## `cambios/<id>`

Un documento por evento del feed "Últimos cambios". Id: el hash corto para commits (`cambios/c-7922d77`), o `<tipo>-<fecha compacta>` para el resto.

| Campo | Tipo | Nota |
|---|---|---|
| `en` | fecha | |
| `tipo` | `"commit"` \| `"pr"` \| `"merge"` \| `"deploy"` \| `"plan"` | `plan` = cambió el plan (alta, baja o reestimación) |
| `mensaje` | texto | |
| `hash` | texto, solo commits | completo |
| `mas`, `menos` | números, solo commits | |
| `version` | texto | |
| `entregable` | texto, opcional | |

La página lee los últimos 300. La base admite 25.000 documentos por artifact: un proyecto con más de ~20.000 eventos borra los más viejos.

## `notas/<id>`

| Campo | Tipo | Nota |
|---|---|---|
| `en` | fecha | |
| `tipo` | `"decision"` \| `"pendiente"` \| `"riesgo"` \| `"resumen"` | |
| `titulo` | texto, opcional | |
| `texto` | texto | |
| `version` | texto | |

## `pausas/<id>`

Tramos sin trabajo: el Gantt los dibuja como franjas rayadas y su tiempo no cuenta en la duración de los entregables, en el "lleva" de lo que está en curso ni en el ritmo. Id: `p-<fecha compacta>` (ej. `p-20261030-1049`).

| Campo | Tipo | Nota |
|---|---|---|
| `inicio` | fecha | |
| `fin` | fecha, opcional | sin `fin` = pausa abierta (el panel "Ahora mismo" la muestra) |
| `motivo` | `"limite_uso"` \| `"espera_usuario"` \| `"fuera_de_horario"` \| `"otro"` | |
| `detalle` | texto, opcional | ej. "Límite de 5 h; se liberaba 13:40" |
| `version` | texto | |
| `entregable` | texto, opcional | el que estaba en curso |

## Escrituras

- `db_write` admite hasta 50 operaciones por llamada, todas o ninguna. Para un documento que **ya existe**, cada operación lleva `ifVersion` (la versión de la última lectura o escritura). Leé antes con `db_get` o `db_query` si no la tenés.
- Para crear: `set` sin `ifVersion`. Para cambiar campos sueltos de uno existente: `update` con `ifVersion`.
- Una llamada por vez; después de una llamada grande, esperá 2 segundos.
- Nada de secretos ni datos reales de clientes: el tablero se puede compartir.
