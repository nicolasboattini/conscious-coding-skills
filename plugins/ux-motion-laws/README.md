# ux-motion-laws

Skill para animaciones y micro-interacciones. Primero decide **si** algo se anima, según cuánto se usa, y después **cómo**, con valores fijos en lugar de curvas y tiempos inventados en cada pantalla.

Se activa cuando Claude agrega, ajusta o revisa animaciones, transiciones, gestos o estados de carga, no con cualquier componente.

## Qué incluye

| Archivo | Contenido |
|---|---|
| `SKILL.md` | Orden de prioridad cuando dos reglas chocan (accesibilidad, frecuencia de uso, respuesta en menos de 100 ms, rendimiento, claridad, expresividad), tabla de qué animar según la frecuencia de uso, tokens de duración, curvas y springs, reglas concretas, los 12 principios de animación con "dónde sí / dónde no", leyes de UX (Fitts, Hick, Miller, Doherty, Postel, Jakob), rendimiento, accesibilidad y checklist de revisión |
| `references/css-tailwind.md` | Tokens para Tailwind v3 y v4, modal con `<dialog>`, Radix y shadcn, acordeón, elevación sin animar `box-shadow`, área táctil ampliada, shake, spinner |
| `references/motion-react.md` | Motion (ex Framer Motion): configuración global con reduced motion, modal, popover, listas, layout, bottom sheet arrastrable |
| `references/react-native.md` | Reanimated y Gesture Handler: press, entradas y salidas, listas, bottom sheet, y una sección para totems y kioscos |

## Instalación

```text
/plugin install ux-motion-laws@conscious-coding-skills
```

O solo la skill:

```bash
npx skills add nicolasboattini/conscious-coding-skills --skill ux-motion-laws
```

## Fuentes

Parte de la lista "20 Principles of UX & Animation" de Charles Liu (TikTok, @charles.unemployed), reescrita y ampliada. La lista original se apoya en *The Illusion of Life* (Frank Thomas y Ollie Johnston, Disney), *Laws of UX* (Jon Yablonski), *userinterface.wiki* (Raphael Salaja) y la forma de pensar el movimiento de Emil Kowalski.
