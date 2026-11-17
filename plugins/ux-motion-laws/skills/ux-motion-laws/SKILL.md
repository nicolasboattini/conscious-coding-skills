---
name: ux-motion-laws
description: This skill should be used when adding, tuning or reviewing animations, transitions and micro-interactions in a web interface (CSS, Tailwind, Motion / Framer Motion, Radix or shadcn) or a React Native app (Reanimated, Gesture Handler) - press and hover feedback, modals, drawers, bottom sheets, popovers, tooltips, toasts, list entrances and reordering, page transitions, drag gestures and loading states - and when deciding whether something should animate at all. Sets a priority order for conflicting rules (reduced motion, frequency of use, response time, performance), duration, easing and spring tokens per interaction type, the 12 animation principles adapted to UI, and the UX laws that affect motion and touch targets. Not for static visual design, color or typography (use the branding or design skills).
---

# UX Motion

El movimiento tiene que hacer la interfaz más clara y más rápida de sentir, no más decorada. Primero se decide **si** algo se anima y después **cómo**.

## Flujo

1. Identificar el stack y leer la referencia que corresponda:
   - CSS puro o Tailwind (incluye Radix y shadcn): `references/css-tailwind.md`
   - Motion (`motion/react`, antes `framer-motion`): `references/motion-react.md`
   - React Native con Reanimated (incluye totems y kioscos): `references/react-native.md`
2. Si el proyecto ya tiene tokens de motion (variables CSS, theme de Tailwind, constantes), usarlos. Si no, crear los de la sección 3 en un solo lugar.
3. Clasificar cada interacción por frecuencia de uso (sección 2) y decidir si anima.
4. Asignar duración, curva o spring desde los tokens. No inventar valores sueltos.
5. Aplicar las reglas de la sección 4 y los principios de la sección 5 solo donde el orden de prioridad (sección 1) lo permite.
6. Antes de dar por terminado, pasar el checklist (sección 8).

## 1. Orden de prioridad

Cuando dos reglas chocan, gana la de número más bajo:

1. **Accesibilidad.** `prefers-reduced-motion` y WCAG (sección 7).
2. **Frecuencia de uso.** Cuanto más se usa algo, menos se anima.
3. **Respuesta inmediata (umbral de Doherty).** Feedback visual en menos de 100 ms. Nada se interpone entre el input y la respuesta.
4. **Rendimiento.** Solo propiedades baratas (sección 6).
5. **Claridad.** El movimiento explica de dónde viene algo, a dónde va o qué cambió.
6. **Expresividad.** Rebote, deformación, anticipación, exageración, arcos.

Ejemplo: la anticipación (6) agrega una pausa antes de responder, así que pierde contra 3 en cualquier botón. Solo vale en animaciones que no responden a un input directo, como una celebración o un onboarding.

## 2. ¿Animar o no? Frecuencia de uso

| Frecuencia | Ejemplos | Qué hacer |
|---|---|---|
| Muy alta, o disparado por teclado | Escribir, atajos, checkboxes, toggles, navegar listas con flechas, abrir el command palette, cambiar de tab con teclado | Sin animación, o solo color/opacidad en 80 ms o menos. Nunca demorar. |
| Alta | Hover, press de botón, dropdown, tooltip, cambiar de tab con mouse, seleccionar una fila | 80–150 ms, ease-out, una o dos propiedades. Sin rebote. |
| Media | Modal, drawer, bottom sheet, toast, expandir un panel, transición de página | 180–260 ms de entrada, salida más corta. |
| Baja: momentos | Onboarding, primer uso, éxito de una tarea larga, estado vacío, error de formulario | Hasta 300–500 ms. Acá sí caben rebote, exageración, stagger y acciones secundarias. |

Las herramientas internas de uso diario (ABM, dashboards, back-office) viven casi enteras en las dos primeras filas: animar poco. Las landings y los flujos de primera vez admiten más.

## 3. Tokens

### Duraciones

| Token | Valor | Uso |
|---|---|---|
| `instant` | 80 ms | Color y opacidad de estados (hover, focus), inicio del press |
| `fast` | 140 ms | Press, tooltip, dropdown chico |
| `base` | 200 ms | Popover, toast, acordeón chico, salida de modal |
| `slow` | 260 ms | Entrada de modal, drawer, bottom sheet |
| `emphasis` | 400 ms | Momentos de baja frecuencia (celebración, onboarding) |

La salida dura alrededor del 70 % de la entrada y nunca rebota.

### Curvas

| Token | Valor | Uso |
|---|---|---|
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entradas y casi toda la UI: arranca rápido, frena suave |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Mover algo que ya está en pantalla (reordenar, slider, indicador de tab) |
| `ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | Solo salidas de algo que deja la pantalla y no vuelve, en 150 ms o menos |
| `linear` | `linear` | Solo loops continuos: spinners, barras de progreso indeterminadas, marquees |

Nunca usar ease-in en algo que aparece o que responde a un input: se siente lento al arrancar.

### Springs (Motion y Reanimated)

| Token | Motion | Reanimated | Uso |
|---|---|---|---|
| `snappy` | `{ type: "spring", visualDuration: 0.2, bounce: 0 }` | `{ duration: 250, dampingRatio: 1 }` | UI general, press, popovers |
| `smooth` | `{ type: "spring", visualDuration: 0.3, bounce: 0 }` | `{ duration: 350, dampingRatio: 1 }` | Drawers, sheets, cambios de layout |
| `bouncy` | `{ type: "spring", visualDuration: 0.35, bounce: 0.25 }` | `{ duration: 450, dampingRatio: 0.7 }` | Solo frecuencia baja |

Un spring no tiene duración fija: con rebote tarda más en asentarse que su `visualDuration`. Por eso en la UI común va sin rebote. Los springs son la mejor opción al soltar un gesto, porque heredan la velocidad del dedo y se pueden interrumpir.

## 4. Reglas concretas

### Entradas y salidas

- Nunca escalar desde 0. Modal: `scale(0.95)` + `opacity: 0`. Popover y dropdown: `scale(0.97)` o `translateY(4px)` + opacidad. Toast: `translateY(8px)` + opacidad.
- Lo que se despliega desde un disparador (dropdown, popover, menú contextual, tooltip, select) crece desde ese disparador: `transform-origin` en el trigger, no en el centro. Modales y dialogs, desde el centro.
- Desplazamientos cortos: 4–16 px alcanzan. Drawers y sheets entran desde su borde.
- No animar en cada re-render ni en cada refetch: solo en la primera aparición o cuando algo realmente se agrega, se quita o se mueve.

### Feedback

- Press: `scale(0.97)` uniforme en 80–140 ms. No escalar X e Y por separado sobre algo con texto, porque lo deforma y lo desenfoca.
- Hover solo en dispositivos con hover real (`@media (hover: hover) and (pointer: fine)`). En pantallas táctiles el hover queda "pegado" después del toque.
- Tooltips: la primera aparición con demora (400–600 ms) para no dispararlos al pasar. Mientras el puntero se mueve entre triggers vecinos, los siguientes aparecen sin demora y sin animación.
- Error de formulario: shake horizontal corto (±6 px, unas 3 oscilaciones, 300 ms) y además el mensaje en texto. El movimiento nunca es el único aviso.

### Teclado e interrupción

- Lo que se dispara con el teclado (atajos, flechas, Enter en un command palette) cambia al instante, sin animación.
- Si un estado puede revertirse antes de terminar (abrir y cerrar rápido, hover que entra y sale), usar transiciones o springs, que retoman desde el punto actual. Los `@keyframes` reinician y saltan.
- Nunca bloquear el input mientras algo anima: el usuario puede tocar lo siguiente sin esperar.

### Listas

- Stagger de 30–50 ms entre ítems, con tope: escalonar solo los primeros 6–8 visibles; el resto entra junto. Una lista no tarda más de unos 300 ms en terminar de aparecer.
- Al reordenar, insertar o quitar, animar la posición (FLIP, `layout` de Motion, `LinearTransition` de Reanimated) para que se vea a dónde fue cada cosa.

### Carga (umbral de Doherty)

- En menos de 100 ms tiene que haber feedback: estado pressed, spinner en el botón o el ítem agregado de forma optimista.
- Si la operación suele tardar menos de 300 ms, no mostrar spinner: parpadea. Mostrarlo recién a los ~300 ms y, una vez visible, dejarlo al menos ~500 ms.
- Si la carga pasa los ~400 ms, usar skeleton con la forma del contenido o UI optimista, no una pantalla en blanco.

### Input tolerante (ley de Postel: aceptar input imperfecto, devolverlo limpio)

- Formularios: aceptar el dato en cualquier formato razonable y mostrarlo normalizado. Fechas (`15/1/26`, `15 ene 2026`), teléfonos con o sin espacios y guiones, importes con coma o punto decimal (`1.500,50` y `1500.50`). Validar al salir del campo, no en cada tecla.
- Gestos: cerrar o confirmar un swipe por distancia **o** por velocidad (por ejemplo, cerrar el sheet si se arrastró más del 40 % de su alto o a más de 500 px/s).
- Al pasarse del límite, resistencia elástica (rubber-banding), no un tope seco.
- Al soltar, animar con spring partiendo de la velocidad del gesto.
- Ángulo generoso para decidir el eje: no exigir un swipe perfectamente horizontal.

### Tamaño de los targets (ley de Fitts)

- Mínimos: 44×44 pt en iOS, 48×48 dp en Android, 24×24 px por WCAG 2.5.8 (nivel AA). En totems y kioscos, apuntar a 60 px o más: se usan de pie, con apuro y con el brazo extendido.
- Agrandar el área táctil sin cambiar lo visual: `::after` con `inset: -8px` en web, `hitSlop` en React Native.
- Acción principal cerca del pulgar o del cursor; acciones destructivas lejos de la principal.

### Convenciones de plataforma (ley de Jakob)

- Bottom sheet sube desde abajo. Drawer lateral entra desde su borde. Navegación hacia adelante y hacia atrás en mobile, horizontal. Modal centrado con escala y fade. Popover desde su trigger. Toast desde el borde donde vive.
- Las cosas van donde la gente las busca: logo arriba a la izquierda que lleva al inicio; carrito y cuenta arriba a la derecha.
- En Android, el ripple nativo (`android_ripple`) es el feedback esperado de un toque.

### Decisiones y agrupación (leyes de Hick y de Miller)

- Mostrar opciones secundarias cuando se vuelven relevantes (divulgación progresiva), animando su aparición como la fila "media". No esconder detrás de un click extra lo que se usa todos los días.
- Agrupar en bloques con encabezado y espacio. No hay un número mágico de ítems por grupo: el 7±2 de Miller habla de memoria de trabajo, no del largo de un menú.
- Donde Miller sí aplica directo: formatear los números largos en grupos. Tarjeta `4532 0151 1283 0366`, teléfono `11 5555-0132`, CUIT `20-12345678-9`.

## 5. Los 12 principios de animación en UI

| # | Principio | Dónde sí | Dónde no, o con cuidado |
|---|---|---|---|
| 1 | Squash & stretch | Press con `scale(0.97)` uniforme. Deformación real solo en elementos sin texto (íconos, toggles) y en momentos de baja frecuencia | Botones o tarjetas con texto |
| 2 | Anticipación | Animaciones que no responden a un input (celebración, onboarding, ilustraciones). En un ícono, solo si el "recogerse" arranca en el acto y dura 100 ms o menos (el avión de "enviar" que retrocede antes de salir) | Si demora el resultado: navegar, enviar, mostrar el dato |
| 3 | Staging (una cosa a la vez) | Overlay oscuro detrás del modal con fade de opacidad | Backdrop blur en hardware modesto (totems, Android de gama baja). Nunca animar el radio del blur |
| 4 | Pose a pose | Definir estados (inicial, abierto, salida) y dejar que el motor interpole. En CSS, transiciones entre `data-state` o clases | Animar pasos intermedios a mano |
| 5 | Follow through | Springs; el contenido se asienta 20–40 ms después del contenedor en notificaciones y paneles de baja frecuencia (el toast de "pago recibido") | Menús y controles frecuentes |
| 6 | Slow in & slow out | Tokens de curvas de la sección 3 | `linear` fuera de loops continuos |
| 7 | Arcos | Producto que vuela al carrito al agregarlo (300 ms o menos, sin bloquear el siguiente toque); elementos flotantes grandes (botón flotante que se transforma, transición de elemento compartido) | Casi todo lo demás: por defecto, línea recta |
| 8 | Acción secundaria | Un detalle que acompaña: el check que se dibuja, la flecha de un link que se corre 2 px | Que compita con la acción principal |
| 9 | Timing | Tokens de duración de la sección 3 | Valores sueltos por componente |
| 10 | Exageración | Éxito de una tarea larga, shake de error | Cualquier interacción frecuente |
| 11 | Volumen y profundidad | Sombras de elevación por capas; para animar la elevación, animar la opacidad de una capa con la sombra final | Animar `box-shadow`; tilt 3D con `perspective` en apps de trabajo (solo como efecto puntual en marketing) |
| 12 | Appeal | Los mismos tokens en todo el producto | Cada pantalla con su propio ritmo |

## 6. Rendimiento

- Animar solo `transform` y `opacity`: son las únicas propiedades que el navegador garantiza componer en la GPU sin redibujar.
- `filter`, `backdrop-filter` y `clip-path` pueden obligar a redibujar: usarlos en elementos chicos y probar en el dispositivo más lento al que apunta el proyecto.
- No animar `width`, `height`, `top`, `left`, `margin`, `padding` ni `box-shadow`. Excepción aceptada: el alto de un acordeón chico (ver la referencia de CSS).
- `will-change: transform` solo en elementos que animan seguido o durante la animación, nunca global.
- Probar con la CPU limitada 4–6× en DevTools (Performance) y, si es un totem o una app móvil, en el dispositivo real.

## 7. Accesibilidad

- Con `prefers-reduced-motion: reduce`, reemplazar desplazamientos, entradas con escala y parallax por un fade corto (150 ms o menos) o un cambio instantáneo. Se quita el movimiento, no el feedback: el estado nuevo tiene que verse igual. El press con `scale(0.97)` puede quedar, porque no desplaza nada.
- React Native: `useReducedMotion()` de Reanimated o `AccessibilityInfo.isReduceMotionEnabled()`.
- Todo movimiento automático que dure más de 5 s (carruseles, marquees, fondos animados) necesita un control de pausa (WCAG 2.2.2).
- Nada destella más de 3 veces por segundo (WCAG 2.3.1).
- El movimiento nunca es el único canal: errores con texto y color, éxito con texto o ícono.

## 8. Checklist de revisión

- [ ] Cada animación tiene una razón: orientar, dar feedback o conectar dos estados. Si es solo decoración en algo frecuente, se saca.
- [ ] Todo input tiene feedback visual en menos de 100 ms.
- [ ] Duraciones, curvas y springs salen de los tokens. Las salidas son más cortas que las entradas.
- [ ] Ningún `scale(0)`. Los popovers crecen desde su trigger.
- [ ] Solo se animan `transform` y `opacity`. Probado con la CPU limitada o en el dispositivo real.
- [ ] Lo que se dispara con el teclado no anima.
- [ ] El hover está limitado a dispositivos con hover.
- [ ] Los targets cumplen los mínimos de tamaño.
- [ ] `prefers-reduced-motion` probado (DevTools > Rendering > Emulate CSS media feature).
- [ ] Abrir y cerrar rápido no produce saltos.
