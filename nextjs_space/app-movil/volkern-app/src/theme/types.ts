import type { ThemeMode } from '../services/settings';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ThemeContextType {
  colors: ColorSet;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

export interface ColorSet {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryBg: string;
  white: string;
  background: string;
  surface: string;
  border: string;
  borderLight: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  textLink: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  info: string;
  infoBg: string;
  categoryVentas: string;
  categoryComunicacion: string;
  categoryMarketing: string;
  categoryAcademia: string;
  categoryERP: string;
  categoryAdmin: string;
  categoryEstrategia: string;
  categoryIntegraciones: string;
  chatUser: string;
  chatBot: string;
  chatSystem: string;
  overlay: string;
}
