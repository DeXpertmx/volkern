import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeColors, typography, spacing, radius, shadows } from '../../src/theme';
import { useI18n } from '../../src/contexts/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlide {
  icon: string;
  titleKey: string;
  subtitleKey: string;
  features: { icon: string; label: string }[];
}

function getSlides(t: (domain: string, key: string) => string): OnboardingSlide[] {
  return [
    {
      icon: 'sparkles',
      titleKey: t('onboarding', 'slide1Title'),
      subtitleKey: t('onboarding', 'slide1Desc'),
      features: [
        { icon: 'people-outline', label: t('contacts', 'subtitle') },
        { icon: 'chatbubbles-outline', label: t('gemma', 'placeholder') },
        { icon: 'analytics-outline', label: t('dashboard', 'fullAnalytics') },
      ],
    },
    {
      icon: 'grid-outline',
      titleKey: t('onboarding', 'slide2Title'),
      subtitleKey: t('onboarding', 'slide2Desc'),
      features: [
        { icon: 'megaphone-outline', label: t('reports', 'campaigns') },
        { icon: 'calendar-outline', label: t('calendar', 'title') },
        { icon: 'cloud-outline', label: t('offline', 'offlineMode') },
      ],
    },
    {
      icon: 'rocket-outline',
      titleKey: t('onboarding', 'slide3Title'),
      subtitleKey: t('onboarding', 'slide3Desc'),
      features: [
        { icon: 'add-circle-outline', label: t('contacts', 'title') },
        { icon: 'settings-outline', label: t('settings', 'title') },
        { icon: 'person-add-outline', label: t('auth', 'signUp') },
      ],
    },
  ];
}

export default function OnboardingScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const s = useMemo(() => makeStyles(colors), [colors]);

  const SLIDES = useMemo(() => getSlides(t), [t]);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * SCREEN_WIDTH, animated: true });
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false, listener: (event: any) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setCurrentIndex(index);
    }}
  );

  const isLastSlide = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={s.container}>
      {/* Skip Button */}
      {!isLastSlide && (
        <TouchableOpacity style={s.skipButton} onPress={handleSkip}>
          <Text style={s.skipText}>{t('common', 'skip')}</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={s.scrollView}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={s.slide}>
            {/* Icon */}
            <View style={[s.iconContainer, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name={slide.icon as any} size={48} color={colors.primary} />
            </View>

            {/* Title */}
            <Text style={s.title}>{slide.titleKey}</Text>

            {/* Subtitle */}
            <Text style={s.subtitle}>{slide.subtitleKey}</Text>

            {/* Features */}
            <View style={s.featuresContainer}>
              {slide.features.map((feature, fIndex) => (
                <View key={fIndex} style={s.featureItem}>
                  <View style={[s.featureIconContainer, { backgroundColor: colors.primaryBg }]}>
                    <Ionicons name={feature.icon as any} size={20} color={colors.primary} />
                  </View>
                  <Text style={s.featureLabel}>{feature.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Section */}
      <View style={s.bottomSection}>
        {/* Dots */}
        <View style={s.dotsContainer}>
          {SLIDES.map((_, index) => {
            const opacity = scrollX.interpolate({
              inputRange: [
                (index - 1) * SCREEN_WIDTH,
                index * SCREEN_WIDTH,
                (index + 1) * SCREEN_WIDTH,
              ],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            const scale = scrollX.interpolate({
              inputRange: [
                (index - 1) * SCREEN_WIDTH,
                index * SCREEN_WIDTH,
                (index + 1) * SCREEN_WIDTH,
              ],
              outputRange: [0.8, 1.2, 0.8],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={index}
                style={[
                  s.dot,
                  {
                    opacity,
                    transform: [{ scale }],
                    backgroundColor: index === currentIndex ? colors.primary : colors.border,
                    width: index === currentIndex ? 24 : 8,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Action Button */}
        <TouchableOpacity style={s.actionButton} onPress={handleNext}>
          <Text style={s.actionButtonText}>
            {isLastSlide ? t('onboarding', 'startButton') : t('common', 'next')}
          </Text>
          <Ionicons
            name={isLastSlide ? 'checkmark' : 'arrow-forward'}
            size={20}
            color={colors.white}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  skipButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  skipText: {
    ...typography.body,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxxl + 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxl,
    ...shadows.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xxl,
  },
  featuresContainer: {
    width: '100%',
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  bottomSection: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.lg,
    gap: spacing.xxl,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    ...shadows.md,
  },
  actionButtonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '700',
  },
});
