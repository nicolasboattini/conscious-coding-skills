# CSS y Tailwind

Patrones listos para CSS puro, Tailwind v3 y v4, y componentes de Radix o shadcn. Los valores salen de los tokens de `SKILL.md`, sección 3.

## Tokens

Definir una sola vez, en el CSS global.

```css
:root {
  --dur-instant: 80ms;
  --dur-fast: 140ms;
  --dur-base: 200ms;
  --dur-slow: 260ms;
  --dur-emphasis: 400ms;

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);

  /* Distancias de entrada. Con reduced motion pasan a valores neutros
     y la misma animación queda como un fade. */
  --enter-scale: 0.95;
  --enter-scale-sm: 0.97;
  --enter-y: 8px;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --enter-scale: 1;
    --enter-scale-sm: 1;
    --enter-y: 0px;
    --dur-base: 150ms;
    --dur-slow: 150ms;
    --dur-emphasis: 150ms;
  }
}
```

### Tailwind v4

Las curvas van en `@theme`, así `ease-out`, `ease-in-out` y `ease-in` usan estos valores. Tailwind v4 no tiene namespace de duraciones: las duraciones quedan en `:root` (bloque de arriba, sin las curvas) y se usan con `duration-(--dur-fast)`.

```css
@import "tailwindcss";

@theme {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
}
```

En v4, `hover:` ya se aplica solo dentro de `@media (hover: hover)`.

### Tailwind v3

```js
// tailwind.config.js
module.exports = {
  future: { hoverOnlyWhenSupported: true }, // hover solo en dispositivos con hover
  theme: {
    extend: {
      transitionDuration: {
        instant: "var(--dur-instant)",
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
        emphasis: "var(--dur-emphasis)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
        in: "var(--ease-in)",
      },
    },
  },
};
```

Uso: `duration-fast ease-out`.

## Press de botón

```css
.btn {
  transition: transform var(--dur-fast) var(--ease-out);
}
.btn:active {
  transform: scale(0.97);
  transition-duration: var(--dur-instant); /* al apretar responde más rápido que al soltar */
}
```

Tailwind v4: `transition-transform duration-(--dur-fast) ease-out active:scale-97 active:duration-(--dur-instant)`
Tailwind v3: `transition-transform duration-fast ease-out active:scale-[0.97] active:duration-instant`

## Hover solo con hover real (CSS puro)

```css
@media (hover: hover) and (pointer: fine) {
  .card:hover { background: var(--surface-hover); }
}
```

## Modal con `<dialog>` nativo

Salida (200 ms) más corta que la entrada (260 ms): la transición que se aplica es la del estado de destino. En navegadores sin soporte para `@starting-style` el modal aparece sin animación, que es un fallback correcto.

```css
dialog {
  opacity: 0;
  transform: scale(var(--enter-scale));
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out),
    overlay var(--dur-base) allow-discrete,
    display var(--dur-base) allow-discrete;
}
dialog[open] {
  opacity: 1;
  transform: scale(1);
  transition-duration: var(--dur-slow);
}
@starting-style {
  dialog[open] { opacity: 0; transform: scale(var(--enter-scale)); }
}

dialog::backdrop {
  background: rgb(0 0 0 / 0.4);
  opacity: 0;
  transition:
    opacity var(--dur-base) var(--ease-out),
    overlay var(--dur-base) allow-discrete,
    display var(--dur-base) allow-discrete;
}
dialog[open]::backdrop { opacity: 1; }
@starting-style {
  dialog[open]::backdrop { opacity: 0; }
}
```

No usar `backdrop-filter: blur()` en el fondo si el proyecto corre en hardware modesto.

## Radix y shadcn

- Radix desmonta el contenido cuando termina la animación (`animationend`), así que sus entradas y salidas se hacen con `@keyframes`, no con `transition`. Está bien: un open/close de Radix no se revierte a mitad de camino. Para hover y press seguir usando transiciones.
- shadcn ya trae `animate-in fade-in-0 zoom-in-95` y `animate-out fade-out-0 zoom-out-95` (paquete `tw-animate-css` en Tailwind v4, `tailwindcss-animate` en v3). Eso ya cumple "escala 0.95 + fade". Ajustar duración y curva con las utilidades `duration-*` y `ease-*`, y revisar en el CSS generado que se apliquen a `animation-duration` y `animation-timing-function`.
- Duraciones distintas para entrar y salir: `data-[state=open]:duration-(--dur-slow) data-[state=closed]:duration-(--dur-base)` (v4) o `data-[state=open]:duration-slow data-[state=closed]:duration-base` (v3).

### Origen desde el trigger

Radix expone el origen calculado en una variable CSS por componente:

| Componente | Variable |
|---|---|
| Popover | `--radix-popover-content-transform-origin` |
| DropdownMenu | `--radix-dropdown-menu-content-transform-origin` |
| ContextMenu | `--radix-context-menu-content-transform-origin` |
| Tooltip | `--radix-tooltip-content-transform-origin` |
| HoverCard | `--radix-hover-card-content-transform-origin` |
| Select (con `position="popper"`) | `--radix-select-content-transform-origin` |

Tailwind v4: `origin-(--radix-popover-content-transform-origin)`. Tailwind v3: `origin-[--radix-popover-content-transform-origin]`. Las versiones recientes de shadcn ya lo traen; en proyectos viejos, agregarlo.

### Tooltips con demora inteligente

```tsx
<TooltipProvider delayDuration={500} skipDelayDuration={300}>
```

Radix marca el contenido con `data-state="delayed-open"` (primera aparición, después de la demora) o `data-state="instant-open"` (pasando de un trigger a otro). Animar solo el primero: `data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0`.

## Toast

```css
.toast { animation: toast-in var(--dur-base) var(--ease-out); }
@keyframes toast-in {
  from { opacity: 0; transform: translateY(var(--enter-y)); }
}
```

Si los toasts se apilan, el que entra empuja a los demás con `transform`, no cambiando `top` o `margin`.

## Acordeón o panel que se expande

Animar alto es animar layout. Es aceptable en paneles chicos; si hay mucho contenido debajo, abrir sin animación o usar FLIP (en Motion, `layout`).

Opción A, grid (funciona en todos los navegadores actuales):

```css
.collapsible {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-base) var(--ease-out);
}
.collapsible[data-state="open"] { grid-template-rows: 1fr; }
.collapsible > .inner { overflow: hidden; min-height: 0; }
```

Opción B, Radix Accordion: animar con `@keyframes` usando `--radix-accordion-content-height` (es lo que hacen `animate-accordion-down` y `animate-accordion-up` de shadcn).

Opción C, mejora progresiva: `:root { interpolate-size: allow-keywords; }` permite transicionar `height: 0` → `height: auto` en Chromium 129 o posterior. En el resto de los navegadores no anima, sin romper nada.

## Elevación sin animar `box-shadow`

```css
.card { position: relative; }
.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-base) var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .card:hover::after { opacity: 1; }
}
```

Tailwind: `relative after:absolute after:inset-0 after:rounded-[inherit] after:shadow-lg after:opacity-0 after:pointer-events-none after:transition-opacity hover:after:opacity-100`.

## Área táctil más grande que lo visible

```css
.icon-btn { position: relative; }
.icon-btn::after { content: ""; position: absolute; inset: -8px; }
```

Tailwind: `relative after:absolute after:-inset-2`. Cuidar que dos áreas ampliadas vecinas no se pisen.

## Shake de error

Con la Web Animations API se puede repetir sin quitar y volver a poner una clase:

```ts
export function shake(el: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  );
}
```

Acompañar siempre con el mensaje de error en texto y el borde en color de error.

## Spinner

```css
.spinner { animation: spin 700ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 1.5s; }
}
```

Es de los pocos casos donde `linear` es correcto. Con reduced motion se mantiene, más lento, porque informa que algo está pasando.

## Sin animación cuando la acción viene del teclado

Un `click` disparado con Enter o Espacio llega con `event.detail === 0`. Usarlo para saltear la transición:

```tsx
<button
  onClick={(e) => {
    document.documentElement.toggleAttribute("data-instant", e.detail === 0);
    select(id);
  }}
/>
```

```css
[data-instant] .tab-indicator { transition: none; }
```
