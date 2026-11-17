# React Native (Reanimated y Gesture Handler)

Para apps móviles y para totems o kioscos en React Native. Las animaciones van con `react-native-reanimated` (corren en el hilo de UI) y los gestos con `react-native-gesture-handler`. No usar la API `Animated` de React Native para nada nuevo. Los valores salen de los tokens de `SKILL.md`, sección 3.

## Tokens

```ts
// lib/motion.ts
import { Easing } from "react-native-reanimated";

export const DUR = { instant: 80, fast: 140, base: 200, slow: 260, emphasis: 400 } as const;

export const EASE = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.55, 0, 1, 0.45),
} as const;

// Springs por duración. dampingRatio 1 = sin rebote.
// El resorte puede tardar un poco más que `duration` en quedar quieto.
export const SPRING = {
  snappy: { duration: 250, dampingRatio: 1 },
  smooth: { duration: 350, dampingRatio: 1 },
  bouncy: { duration: 450, dampingRatio: 0.7 }, // solo frecuencia baja
} as const;
```

## Reduced motion

- Por defecto, las animaciones de Reanimated respetan la preferencia del sistema (`ReduceMotion.System`): si está activada, saltan directo al estado final. Verificar que el estado final se entienda sin la transición.
- Para decidir en el render (por ejemplo, cambiar un desplazamiento por un fade): `const reduce = useReducedMotion();` de `react-native-reanimated`.
- Fuera de Reanimated: `AccessibilityInfo.isReduceMotionEnabled()` y el evento `reduceMotionChanged`.
- En React Native no existe `prefers-reduced-motion`.

## Press

La versión más simple, sin animación (respuesta instantánea, ideal para lo muy frecuente):

```tsx
<Pressable
  hitSlop={8}
  style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]}
/>
```

Con transición:

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { DUR, EASE } from "@/lib/motion";

export function PressableScale({ children, ...props }: PressableProps & { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      hitSlop={8}
      onPressIn={() => { scale.value = withTiming(0.97, { duration: DUR.instant, easing: EASE.out }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: DUR.fast, easing: EASE.out }); }}
      {...props}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}
```

En Android, `android_ripple` es el feedback que el usuario espera de un toque (ley de Jakob). En un totem con diseño propio, el press con escala alcanza.

## Entradas y salidas

```tsx
<Animated.View
  entering={FadeIn.duration(DUR.base).easing(EASE.out)}
  exiting={FadeOut.duration(DUR.fast)}
/>
```

No usar `ZoomIn` ni `ZoomOut` predefinidos para modales: arrancan desde escala 0. Usar una entrada propia:

```tsx
import { withTiming } from "react-native-reanimated";

export const modalIn = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.95 }] },
    animations: {
      opacity: withTiming(1, { duration: DUR.slow, easing: EASE.out }),
      transform: [{ scale: withTiming(1, { duration: DUR.slow, easing: EASE.out }) }],
    },
  };
};

export const modalOut = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: DUR.base, easing: EASE.out }),
      transform: [{ scale: withTiming(0.97, { duration: DUR.base, easing: EASE.out }) }],
    },
  };
};

<Animated.View entering={modalIn} exiting={modalOut} />
```

## Listas

- Al agregar, quitar o reordenar ítems: `layout={LinearTransition.duration(DUR.base)}` en cada ítem para que el resto se reacomode con movimiento.
- Stagger con tope: `entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(DUR.base)}`, solo en la primera carga, no en cada refetch.
- En `FlatList` grandes, no animar la entrada de cada celda al hacer scroll.

## Bottom sheet

Para producción, preferir `@gorhom/bottom-sheet`, que ya resuelve gestos, teclado y accesibilidad. Si hace falta uno propio:

```tsx
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";

const translateY = useSharedValue(0); // 0 = abierto, sheetHeight = cerrado

const pan = Gesture.Pan()
  .activeOffsetY([-10, 10]) // ángulo generoso: decide el eje después de 10 px
  .onUpdate((e) => {
    const y = e.translationY;
    translateY.value = y < 0 ? y * 0.2 : y; // resistencia elástica hacia arriba
  })
  .onEnd((e) => {
    const shouldClose = translateY.value > sheetHeight * 0.4 || e.velocityY > 500;
    translateY.value = withSpring(shouldClose ? sheetHeight : 0, {
      ...SPRING.smooth,
      velocity: e.velocityY,
    });
    if (shouldClose) runOnJS(onClose)();
  });

const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

<GestureDetector gesture={pan}>
  <Animated.View style={[styles.sheet, style]} />
</GestureDetector>
```

En Reanimated 4, `runOnJS` está deprecado: usar `scheduleOnRN` de `react-native-worklets`.

## Totems y kioscos

- Hardware modesto: evitar blur (`expo-blur`, `@react-native-community/blur`) y animar imágenes grandes. Probar siempre en el equipo real, no en el emulador.
- Sin hover: todo el feedback va en el press.
- Targets de 60 dp o más y separación generosa: se usan de pie, con apuro y con el brazo extendido. Agrandar el área con `hitSlop` sin cambiar lo visual.
- Frecuencia de uso: sumar o restar cantidad y cambiar de categoría se repiten muchísimo. Respuesta instantánea, como mucho un press de 80–140 ms, sin rebote.
- Agregar un producto admite una animación corta hacia el carrito (en arco, 300 ms o menos) porque muestra a dónde fue. El contador del carrito se actualiza al instante y la animación no bloquea el siguiente toque.
- Pocas opciones por pantalla (ley de Hick): categorías grandes y pocas, no una grilla de 16 botones chicos.
- Momentos que sí admiten más animación: confirmación del pedido, pantalla de pago aprobado, pantalla de espera (atract loop). Si esta última se mueve sola más de 5 s, el siguiente toque tiene que cortarla al instante.
