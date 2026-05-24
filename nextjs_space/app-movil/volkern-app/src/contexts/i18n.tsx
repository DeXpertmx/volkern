import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { settingsService, type Locale } from '../services/settings';
import translations from '../translations';

// ─── Types ────────────────────────────────────────────────────────────────────
interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (domain: string, key: string, vars?: Record<string, string | number>) => string;
  tArray: (domain: string, key: string) => string[];
  translate: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es-MX');

  useEffect(() => {
    settingsService.load().then((s) => {
      setLocaleState(s.locale);
    });
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    await settingsService.update('locale', newLocale);
  }, []);

  const t = useCallback(
    (domain: string, key: string, vars?: Record<string, string | number>): string => {
      const domainMap = (translations as any)[locale]?.[domain];
      if (!domainMap) {
        // Fallback to ES
        const fallback = (translations as any)['es-MX']?.[domain]?.[key];
        return typeof fallback === 'string' ? interpolate(fallback, vars) : `${domain}.${key}`;
      }
      const val = domainMap[key];
      if (typeof val !== 'string') {
        // Fallback to ES
        const fallback = (translations as any)['es-MX']?.[domain]?.[key];
        return typeof fallback === 'string' ? interpolate(fallback, vars) : `${domain}.${key}`;
      }
      return interpolate(val, vars);
    },
    [locale],
  );

  const tArray = useCallback(
    (domain: string, key: string): string[] => {
      const domainMap = (translations as any)[locale]?.[domain];
      if (domainMap?.[key] && Array.isArray(domainMap[key])) {
        return domainMap[key];
      }
      // Fallback
      const fallback = (translations as any)['es-MX']?.[domain]?.[key];
      if (Array.isArray(fallback)) return fallback;
      return [];
    },
    [locale],
  );

  // Shortcut: t('key') automatically scopes to 'common'
  const translate = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      return t('common', key, vars);
    },
    [t],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, tArray, translate }),
    [locale, setLocale, t, tArray, translate],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
