import { StyleSheet } from 'react-native';

// ─── Colores ──────────────────────────────────────────────────────────────────
export const colors = {
  // Primarios
  primary: '#2563EB',
  primaryLight: '#3B82F6',
  primaryDark: '#1D4ED8',
  primaryBg: '#EFF6FF',

  // Neutros
  white: '#FFFFFF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  divider: '#E2E8F0',

  // Texto
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',
  textLink: '#2563EB',

  // Semánticos
  success: '#10B981',
  successBg: '#ECFDF5',
  warning: '#F59E0B',
  warningBg: '#FFFBEB',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  info: '#3B82F6',
  infoBg: '#EFF6FF',

  // Categorías módulos
  categoryVentas: '#2563EB',
  categoryComunicacion: '#8B5CF6',
  categoryMarketing: '#EC4899',
  categoryAcademia: '#F59E0B',
  categoryERP: '#10B981',
  categoryAdmin: '#64748B',
  categoryEstrategia: '#06B6D4',
  categoryIntegraciones: '#F97316',

  // Estado chat
  chatUser: '#2563EB',
  chatBot: '#F1F5F9',
  chatSystem: '#FEF3C7',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
} as const;

// ─── Colores Oscuros ──────────────────────────────────────────────────────────
export const darkColors = {
  // Primarios
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  primaryDark: '#2563EB',
  primaryBg: '#1E3A5F',

  // Neutros
  white: '#FFFFFF',
  background: '#0F172A',
  surface: '#1E293B',
  border: '#334155',
  borderLight: '#1E293B',
  divider: '#334155',

  // Texto
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textInverse: '#0F172A',
  textLink: '#60A5FA',

  // Semánticos
  success: '#34D399',
  successBg: '#064E3B',
  warning: '#FBBF24',
  warningBg: '#451A03',
  error: '#F87171',
  errorBg: '#450A0A',
  info: '#60A5FA',
  infoBg: '#1E3A5F',

  // Categorías módulos
  categoryVentas: '#60A5FA',
  categoryComunicacion: '#A78BFA',
  categoryMarketing: '#F472B6',
  categoryAcademia: '#FBBF24',
  categoryERP: '#34D399',
  categoryAdmin: '#94A3B8',
  categoryEstrategia: '#22D3EE',
  categoryIntegraciones: '#FB923C',

  // Estado chat
  chatUser: '#3B82F6',
  chatBot: '#1E293B',
  chatSystem: '#451A03',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
} as const;

// ─── Tipografía ───────────────────────────────────────────────────────────────
export const typography = {
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  number: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
} as const;

// ─── Espaciado ────────────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// ─── Sombras ──────────────────────────────────────────────────────────────────
export const shadows = StyleSheet.create({
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
});

// ─── Layout ───────────────────────────────────────────────────────────────────
export const layout = {
  screenPadding: spacing.lg,
  tabBarHeight: 60,
  headerHeight: 56,
  maxContentWidth: 500,
} as const;
