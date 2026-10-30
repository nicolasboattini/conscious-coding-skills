---
name: live-development-roadmap
description: "Tablero en vivo del desarrollo de un proyecto (hoja de ruta tipo Star Citizen): un artifact de claude.ai con Gantt, tarea en curso, avance, últimos commits, tablero por fases y notas, que Claude mantiene al día mientras trabaja. Usar cuando el usuario pide crear o actualizar el roadmap, tablero, hoja de ruta o seguimiento de un proyecto, cuando se aprueba un plan en un repo que tiene roadmap, y en cada inicio o fin de entregable, commit, PR, deploy o decisión dentro de ese repo. No hace nada en repos sin roadmap."
---

# Live development roadmap

Un tablero por proyecto, publicado como artifact de claude.ai con base de datos propia. La página (`assets/roadmap.html`) dibuja todo leyendo la base y se refresca sola; Claude escribe en la base mientras trabaja. Así el usuario (y quien él comparta) ve en vivo qué se está haciendo, cuánto lleva, qué falta y cuándo termina.

Rutas de este documento relativas a la carpeta de la skill:
- Página: `assets/roadmap.html`
- Ayudante: `scripts/ldr.py` (Python 3, solo biblioteca estándar; `python3` o `python`)
- Modelo de datos completo: `references/modelo-de-datos.md`: leelo antes de la primera escritura de la sesión.

Hace falta poder publicar artifacts y escribir en su base: el servidor MCP `claude-artifacts` (`publish_files`, `declare_capabilities`, `db_write`, `db_get`, `db_query`, `upload_asset`) o la herramienta Artifact integrada (`publish` con `capabilities`, acciones `write_db` / `read_db`). Si no hay ninguna, decilo y no simules el tablero.

## ¿Este repo tiene roadmap?

`python scripts/ldr.py config` en la raíz del repo. Sin configuración, la skill no hace nada salvo que el usuario pida crear el tablero. La configuración vive fuera del repo (`~/.claude/live-development-roadmap/proyectos/`): el roadmap nunca agrega archivos al código del proyecto.

## Crear el tablero (una vez por proyecto)

1. **Datos del proyecto.** Proponé valores mirando el repo y pedí confirmación en una sola tanda:
   - nombre y sigla;
   - color de acento;
   - idioma (`es` o `en`);
   - **redacción** (`simple`: para gerencia o áreas no técnicas; `tech`: detalle técnico);
   - prefijo de códigos (por defecto `T`);
   - **disciplinas**, cada una con las carpetas o patrones que cuenta, en orden de prioridad. Ej. web: Pantallas `src/app/**,src/components/**`, Servidor `src/server/**`, Base de datos `prisma/**`, Pruebas `tests/**`, Documentación `docs/**,*.md`. Ej. juego: Gameplay, Arte, Audio, Herramientas, Pruebas.
   - Si es un juego u otro dominio, ofrecé renombrar los niveles con `etiquetas` (ej. Fase → Hito).
2. **Publicar la página.** Publicá `assets/roadmap.html` como artifact nuevo (privado), con título `<Proyecto> · Roadmap` e ícono `chart`. Si la herramienta de publicación rechaza la ruta porque la skill está fuera de las carpetas permitidas (pasa con la caché de plugins), copiá el archivo a tu carpeta temporal de la sesión y publicá desde ahí. Usá la ruta exacta a la que resuelve: en Windows importa la mayúscula o minúscula de la unidad.
3. **Declarar capacidades:** `{"db": {"rules": [{"path": "", "read": "view", "write": "admin"}]}, "assets": {}}`. Así solo el dueño y los editores escriben; quien lo vea por link solo lee.
4. **Escribir `meta/proyecto`** con nombre, sigla, acento, idioma, redacción, disciplinas (`id` y `nombre`), etiquetas si hay, `versionActual` y `actualizadoEn`.
5. **Guardar la configuración local:** `python scripts/ldr.py init --nombre "…" --slug <slug> --url <link> --acento "#…" --idioma es --redaccion simple --disciplina "pantallas:Pantallas:src/app/**,src/components/**" …`
6. **Historia (opcional, recomendado).** Para versiones ya publicadas, `python scripts/ldr.py commits --desde <tag-o-commit>` da cada commit con sus líneas por disciplina. Armá versión, fases y entregables a partir de los commits y PRs: un entregable por commit o grupo de commits que cierran una cosa. Como tiempos usá el commit anterior como inicio aproximado, y aclaralo en `verificacion` ("tiempos aproximados, cargado desde git"). Sin capturas.
7. `python scripts/ldr.py sincronizado` y pasale el link al usuario.

## Cargar un plan

Cuando el usuario aprueba un plan (o una tanda de cambios), antes de programar:

- **Versión** (`versiones/<id>`, estado `en_desarrollo`) y `meta/proyecto.versionActual`.
- **Fases:** una por ítem o bloque grande del plan, en orden.
- **Entregables:** cada paso concreto y verificable dentro de una fase, con:
  - `titulo`, `disciplinas`, `previstoMin` (tu estimación honesta);
  - `incluye`;
  - `hechoCuando`: un criterio que se pueda observar, ej. "tests pasan", "se ve X en pantalla";
  - `dependeDe`, si corresponde.
- **Estados iniciales:** lo aprobado es `comprometido`; lo que agregues después sin aprobación es `provisional`.
- **Notas:** cada decisión del relevamiento como `decision`; los riesgos conocidos como `riesgo`.
- **Un cambio** de tipo `plan` ("Plan aprobado: N entregables en M fases").

## Mientras se trabaja

| Momento | Qué escribir |
|---|---|
| Empezás un entregable | `estado: "en_curso"`, `inicio`. Solo uno en curso a la vez, salvo trabajo en paralelo real |
| Hacés un commit | `python scripts/ldr.py commit` → un documento en `cambios` (tipo `commit`) y, en el entregable, el commit en `commits` y la suma en `lineas` |
| Corrés tests o verificás en vivo | `verificacion` con qué se probó y el resultado; `meta/proyecto.metricas.verificaciones` con la cantidad de tests |
| Tomás capturas de una verificación | Subilas como assets del artifact y agregalas a `capturas` (la mejor primero). **Solo con datos de prueba**, nunca datos reales de clientes ni de personas |
| Terminás un entregable | `estado: "hecho"`, `fin` |
| Algo espera al usuario o a un tercero | `estado: "bloqueado"` con `motivoBloqueo`. Al destrabarse vuelve a `comprometido` o `en_curso` |
| Algo sale del plan | `estado: "descartado"` (no se borra) y una nota `decision` con el porqué |
| El usuario decide algo en la charla | Nota `decision`, breve |
| Reestimás o cambia el alcance | Ajustá `previstoMin` o los entregables, y un cambio de tipo `plan`. Si cambia lo aprobado, preguntá antes |
| PR, merge, deploy | Un cambio del tipo correspondiente. Con el PR, `versiones/<id>.pr`; con el deploy, `estado: "publicada"` y `publicadaEn` |
| Terminás la tarea que te pidieron | Una nota `resumen`: qué se hizo, qué quedó y qué sigue. No esperes a que el usuario diga "cerramos" |

Después de cada actualización: `meta/proyecto.actualizadoEn` y `python scripts/ldr.py sincronizado`. Si el plugin está instalado con su hook, al cerrar un turno con commits o archivos editados sin registrar, el hook te frena una vez: actualizá el tablero o explicá en una línea por qué no corresponde (una consulta, un cambio que no es del plan).

## Redacción

Respetá el flag del proyecto (`ldr.py config` → `redaccion`) en títulos, `incluye`, `hechoCuando`, `verificacion`, notas y resúmenes.

- **simple**: para alguien que no programa (gerencia, áreas usuarias).
  - Qué cambia para quien usa el sistema, sin nombres de archivos, funciones ni librerías.
  - Ej.: "La hoja impresa entra el doble de reservas por página".
- **tech**: detalle para quien programa.
  - Archivos, procedimientos, decisiones técnicas, comandos de verificación.
  - Ej.: "`CalendarioLista`: `print:leading-tight` y separadores de 1 px; tests 206/206".

En los dos casos, frases cortas y concretas, con números cuando los hay. Los mensajes de commit van tal cual.

## Reglas

- El tablero refleja lo que pasó: nunca marques hecho algo sin verificar, ni inventes tiempos (los aproximados se aclaran).
- No guardes secretos, tokens, contraseñas ni datos personales reales: el tablero se puede compartir.
- No reescribas la página para cambiar datos; solo la base. La página se republica únicamente para mejorarla.
- Un roadmap por proyecto. Si el usuario trabaja en otro repo con roadmap, usá el de ese repo.
- Si una escritura falla por versión (`ifVersion`), leé el documento y reintentá; no fuerces.
