import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

interface Slide {
  icon: string;
  title: string;
  description: string;
}

interface OnboardingProps {
  visible: boolean;
  role: 'admin' | 'employe' | 'soustraitant';
  onComplete: () => void;
}

const ADMIN_SLIDES: Slide[] = [
  { icon: '🏠', title: 'Bienvenue sur SK DECO Planning', description: 'Gérez vos chantiers, votre équipe et vos finances' },
  { icon: '📅', title: 'Planning', description: 'Affectez vos employés aux chantiers. Glissez pour naviguer entre les semaines.' },
  { icon: '🏗', title: 'Chantiers', description: 'Créez vos chantiers, ajoutez des fiches, photos, notes et suivez les marchés.' },
  { icon: '👷', title: 'Équipe', description: 'Gérez vos employés et sous-traitants. Suivez le pointage dans Reporting.' },
  { icon: '💬', title: 'Messages', description: 'Communiquez avec votre équipe. Les notifications push sont automatiques.' },
];

const EMPLOYE_SLIDES: Slide[] = [
  { icon: '🏠', title: 'Bienvenue sur SK DECO Planning', description: 'Votre outil de travail au quotidien' },
  { icon: '🕐', title: 'Pointage', description: 'Pointez votre arrivée et départ chaque jour. Votre position sera vérifiée.' },
  { icon: '📋', title: 'Tâches', description: 'Consultez vos tâches du jour et cochez-les quand c\'est fait. Ajoutez des photos.' },
  { icon: '🛒', title: 'Matériel', description: 'Créez des listes de matériel. L\'acheteur sera notifié automatiquement.' },
];

const ST_SLIDES: Slide[] = [
  { icon: '🏠', title: 'Bienvenue sur SK DECO Planning', description: 'Consultez votre planning et vos finances' },
  { icon: '📅', title: 'Planning', description: 'Vos affectations sont visibles dans l\'onglet Planning.' },
  { icon: '💰', title: 'Finances', description: 'Suivez vos devis et paiements dans l\'onglet Mes finances.' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function Onboarding({ visible, role, onComplete }: OnboardingProps) {
  const slides = role === 'admin' ? ADMIN_SLIDES : role === 'employe' ? EMPLOYE_SLIDES : ST_SLIDES;
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const goNext = () => {
    if (currentIndex >= slides.length - 1) {
      onComplete();
      setCurrentIndex(0);
    } else {
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      setCurrentIndex(next);
    }
  };

  const skip = () => {
    onComplete();
    setCurrentIndex(0);
  };

  const isLast = currentIndex >= slides.length - 1;

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <View style={styles.container}>
        {/* Skip button */}
        <Pressable style={styles.skipBtn} onPress={skip}>
          <Text style={styles.skipText}>Passer</Text>
        </Pressable>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.scrollView}
        >
          {slides.map((slide, i) => (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Text style={styles.icon}>{slide.icon}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Next / Start button */}
        <Pressable style={styles.nextBtn} onPress={goNext}>
          <Text style={styles.nextText}>{isLast ? 'Commencer' : 'Suivant'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2C2C2C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtn: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: '#F5EDE3',
    fontSize: 15,
    fontWeight: '500',
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  icon: {
    fontSize: 60,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    fontWeight: '400',
    color: '#FFFFFF',
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#C9A96E',
    width: 24,
  },
  dotInactive: {
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  nextBtn: {
    backgroundColor: '#C9A96E',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginBottom: 50,
    minWidth: 200,
    alignItems: 'center',
  },
  nextText: {
    color: '#2C2C2C',
    fontSize: 16,
    fontWeight: '700',
  },
});
