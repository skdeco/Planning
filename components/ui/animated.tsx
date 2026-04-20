/**
 * Composants animés réutilisables — SK DECO
 * Utilise react-native-reanimated pour des animations 60fps sur le thread UI.
 */
import React, { useEffect } from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  interpolate,
  Easing,
  FadeIn as ReanimatedFadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInDown,
  SlideInRight,
  Layout,
} from 'react-native-reanimated';

// ── Animations d'entrée prédéfinies (à utiliser sur Animated.View) ──────────
export const enterFadeIn = ReanimatedFadeIn.duration(300);
export const enterFadeInDown = FadeInDown.duration(400).springify().damping(18);
export const enterFadeInUp = FadeInUp.duration(400).springify().damping(18);
export const enterSlideDown = SlideInDown.duration(350).springify().damping(20);
export const enterSlideRight = SlideInRight.duration(300);
export const exitFade = FadeOut.duration(200);
export const layoutTransition = Layout.springify().damping(18);

// ── FadeInView : fait apparaître un contenu en fondu ────────────────────────
interface FadeInViewProps extends ViewProps {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
}

export function FadeInView({ delay = 0, duration = 400, children, style, ...props }: FadeInViewProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.cubic) }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]} {...props}>
      {children}
    </Animated.View>
  );
}

// ── StaggeredList : fait apparaître les enfants en cascade ──────────────────
interface StaggeredListProps extends ViewProps {
  staggerDelay?: number;
  children: React.ReactNode;
}

export function StaggeredList({ staggerDelay = 60, children, style, ...props }: StaggeredListProps) {
  const childArray = React.Children.toArray(children);
  return (
    <View style={style} {...props}>
      {childArray.map((child, index) => (
        <FadeInView key={index} delay={index * staggerDelay}>
          {child}
        </FadeInView>
      ))}
    </View>
  );
}

// ── ScaleButton : bouton avec effet de pression (scale down au tap) ─────────
interface ScaleButtonProps extends PressableProps {
  scaleValue?: number;
  children: React.ReactNode;
}

export function ScaleButton({ scaleValue = 0.96, children, style, onPressIn, onPressOut, ...props }: ScaleButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={(e) => {
          scale.value = withSpring(scaleValue, { damping: 15, stiffness: 200 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
          onPressOut?.(e);
        }}
        style={style}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ── Skeleton : placeholder animé "pulsant" pendant le chargement ────────────
interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const pulse = () => {
      opacity.value = withTiming(0.7, { duration: 800 }, () => {
        opacity.value = withTiming(0.3, { duration: 800 });
      });
    };
    pulse();
    const interval = setInterval(pulse, 1600);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: '#E8DDD0' },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ── ProgressBar : barre de progression animée ───────────────────────────────
interface ProgressBarProps {
  progress: number; // 0 à 1
  color?: string;
  backgroundColor?: string;
  height?: number;
}

export function ProgressBar({ progress, color = '#C9A96E', backgroundColor = '#E8DDD0', height = 6 }: ProgressBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.min(1, Math.max(0, progress)), { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={{ height, backgroundColor, borderRadius: height / 2, overflow: 'hidden' }}>
      <Animated.View style={[{ height, backgroundColor: color, borderRadius: height / 2 }, barStyle]} />
    </View>
  );
}

// ── CountUp : animation de compteur (nombre qui monte) ──────────────────────
interface CountUpProps {
  value: number;
  duration?: number;
  style?: any;
  suffix?: string;
}

export function CountUp({ value, duration = 800, style, suffix = '' }: CountUpProps) {
  const animValue = useSharedValue(0);

  useEffect(() => {
    animValue.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value]);

  const animatedProps = useAnimatedStyle(() => ({
    // On ne peut pas animer le texte directement, utiliser interpolate pour le style
    opacity: interpolate(animValue.value, [0, value], [0.5, 1]),
  }));

  // Pour le compteur, on utilise un composant Animated.Text avec la valeur directe
  return (
    <Animated.Text style={[style, animatedProps]}>
      {value}{suffix}
    </Animated.Text>
  );
}
