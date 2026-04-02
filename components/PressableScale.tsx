import { Pressable, type PressableProps, StyleSheet } from 'react-native';

/**
 * Pressable avec effet d'opacité au clic.
 * Remplace Pressable partout où un retour visuel est souhaité.
 */
export function PressableScale({ style, children, ...props }: PressableProps) {
  return (
    <Pressable
      {...props}
      style={((state: any) => [
        typeof style === 'function' ? style(state) : style,
        state.pressed && styles.pressed,
      ]) as any}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
