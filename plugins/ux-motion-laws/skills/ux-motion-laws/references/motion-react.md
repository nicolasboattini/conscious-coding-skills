# Motion (`motion/react`)

Motion es el nombre actual de Framer Motion. Se importa desde `"motion/react"`; los proyectos viejos con `framer-motion` usan la misma API. Los valores salen de los tokens de `SKILL.md`, sección 3 (Motion usa segundos, no milisegundos).

## Tokens

```ts
// lib/motion.ts
export const dur = {
  instant: 0.08,
  fast: 0.14,
  base: 0.2,
  slow: 0.26,
  emphasis: 0.4,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
} as const;

export const spring = {
  snappy: { type: "spring", visualDuration: 0.2, bounce: 0 },
  smooth: { type: "spring", visualDuration: 0.3, bounce: 0 },
  bouncy: { type: "spring", visualDuration: 0.35, bounce: 0.25 }, // solo frecuencia baja
} as const;
```

## Configuración global y reduced motion

```tsx
import { MotionConfig } from "motion/react";
import { spring } from "@/lib/motion";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={spring.snappy}>
      {children}
    </MotionConfig>
  );
}
```

Con `reducedMotion="user"`, Motion desactiva las animaciones de transform y de layout cuando el sistema pide menos movimiento, y mantiene opacidad y color. Para lógica propia, `useReducedMotion()` devuelve `true` en ese caso:

```tsx
const reduce = useReducedMotion();
const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 8 };
```

## Press y hover

```tsx
<motion.button whileTap={{ scale: 0.97 }} transition={spring.snappy}>
  Guardar
</motion.button>
```

`whileHover` ignora los eventos de hover emulados por toque, así que no queda "pegado" en pantallas táctiles.

## Modal

```tsx
<AnimatePresence>
  {open && (
    <>
      <motion.div
        key="overlay"
        className="fixed inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: dur.slow, ease: ease.out } }}
        exit={{ opacity: 0, transition: { duration: dur.base, ease: ease.out } }}
      />
      <motion.div
        key="dialog"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: dur.slow, ease: ease.out } }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: dur.base, ease: ease.out } }}
      />
    </>
  )}
</AnimatePresence>
```

La salida es más corta y se mueve menos que la entrada. Con Radix Dialog: controlar `open` desde React, envolver con `AnimatePresence` y pasar `forceMount` a `Dialog.Portal`, `Dialog.Overlay` y `Dialog.Content`, con `asChild` sobre los `motion.div`.

## Popover o dropdown desde el trigger

```tsx
<motion.div
  style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
  initial={{ opacity: 0, scale: 0.97 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, transition: { duration: dur.fast } }}
  transition={spring.snappy}
/>
```

Sin Radix, calcular el origen a partir de la ubicación del panel (por ejemplo `"top left"` si se abre hacia abajo y a la derecha del trigger).

## Lista con stagger y tope

```tsx
const MAX_STAGGER = 6;

<AnimatePresence initial={false} mode="popLayout">
  {items.map((item, i) => (
    <motion.li
      key={item.id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { ...spring.snappy, delay: Math.min(i, MAX_STAGGER) * 0.04 },
      }}
      exit={{ opacity: 0, transition: { duration: dur.fast } }}
    />
  ))}
</AnimatePresence>
```

- `initial={false}` evita animar la lista completa en el primer render. Es lo correcto en pantallas que se visitan seguido (tablas, listados de un back-office). Sacarlo solo cuando la entrada inicial es un momento (primer uso, estado vacío que se llena).
- `layout` anima la posición de los ítems que se corren cuando otro se agrega o se quita. `mode="popLayout"` saca del flujo al que sale para que el resto se reacomode enseguida.

## Layout y elementos compartidos

- `layout` anima cambios de tamaño y posición con transforms (técnica FLIP). Si el texto de un hijo se deforma durante la animación, agregar `layout` también al hijo o usar `layout="position"` en el contenedor.
- `layoutId` conecta dos elementos en distintos lugares del árbol: indicador de tab activo, tarjeta que se convierte en detalle.

### Indicador de tab sin animación cuando se usa el teclado

```tsx
const [instant, setInstant] = useState(false);

<button
  onClick={(e) => {
    setInstant(e.detail === 0); // 0 = click disparado con Enter o Espacio
    setTab(id);
  }}
>
  {label}
  {active && (
    <motion.span
      layoutId="tab-indicator"
      transition={instant ? { duration: 0 } : spring.snappy}
    />
  )}
</button>
```

## Bottom sheet con arrastre

```tsx
const ref = useRef<HTMLDivElement>(null);

<motion.div
  ref={ref}
  drag="y"
  dragConstraints={{ top: 0, bottom: 0 }}
  dragElastic={{ top: 0.05, bottom: 0.8 }} // casi nada hacia arriba, libre hacia abajo
  onDragEnd={(_, info) => {
    const height = ref.current?.offsetHeight ?? 0;
    if (info.offset.y > height * 0.4 || info.velocity.y > 500) onClose();
  }}
  initial={{ y: "100%" }}
  animate={{ y: 0, transition: spring.smooth }}
  exit={{ y: "100%", transition: { duration: dur.base, ease: ease.out } }}
/>
```

Se cierra por distancia **o** por velocidad. Si no llega a ninguno de los dos umbrales, vuelve a su lugar con la velocidad del gesto, que Motion transfiere sola.

## Rendimiento

- Preferir `x`, `y`, `scale`, `rotate` y `opacity`. No animar `width` ni `height` directo: usar `layout`.
- Las animaciones de `layout` miden el DOM. En listas largas, limitar `layout` a los ítems visibles o desactivarlo en listas de más de unos cientos de elementos.
- No poner `whileHover` ni `whileTap` en cada celda de una tabla grande: con estilos CSS alcanza.
