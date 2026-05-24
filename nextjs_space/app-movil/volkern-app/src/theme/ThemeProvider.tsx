import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { settingsService, type ThemeMode } from '../services/settings';
import { colors as lightColors, darkColors as darkColorSet } from './tokens';
import type { ColorSet, ThemeContextType } from './types';

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextType>({
  colors: lightColors,
  isDark: false,
  themeMode: 'light',
  setThemeMode: async () => {},
  toggleTheme: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');

  // Cargar preferencia guardada al montar
  useEffect(() => {
    settingsService.load().then((s) => {
      setThemeModeState(s.theme);
    });
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await settingsService.update('theme', mode);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeModeState(next);
    await settingsService.update('theme', next);
  }, [themeMode]);

  // Determinar si es oscuro
  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemScheme === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, systemScheme]);

  const colors = useMemo(() => (isDark ? darkColorSet : lightColors), [isDark]);

  const value = useMemo(
    () => ({ colors, isDark, themeMode, setThemeMode, toggleTheme }),
    [colors, isDark, themeMode, setThemeMode, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useThemeColors(): ColorSet {
  const ctx = useContext(ThemeContext);
  return ctx.colors;
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
