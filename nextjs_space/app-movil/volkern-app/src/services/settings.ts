import * as SecureStore from 'expo-secure-store';

// ─── Keys ─────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'volkern_settings';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system';
export type Locale = 'es-MX' | 'en-US';
export type Timezone = string;

export interface AppSettings {
  // Notificaciones
  pushNotifications: boolean;
  emailNotifications: boolean;
  soundEnabled: boolean;
  dailyDigest: boolean;
  marketingEmails: boolean;

  // Apariencia
  theme: ThemeMode;
  useDeviceTheme: boolean;

  // Región
  timezone: Timezone;
  locale: Locale;

  // Privacidad
  showOnlineStatus: boolean;
  profileVisibility: 'public' | 'team' | 'private';
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  pushNotifications: true,
  emailNotifications: true,
  soundEnabled: true,
  dailyDigest: false,
  marketingEmails: false,

  theme: 'light',
  useDeviceTheme: false,

  timezone: 'America/Mexico_City',
  locale: 'es-MX',

  showOnlineStatus: true,
  profileVisibility: 'team',
};

// ─── Timezones available ──────────────────────────────────────────────────────
export const TIMEZONES: { label: string; value: string }[] = [
  { label: 'Ciudad de México (GMT-6)', value: 'America/Mexico_City' },
  { label: 'Monterrey (GMT-6)', value: 'America/Monterrey' },
  { label: 'Cancún (GMT-5)', value: 'America/Cancun' },
  { label: 'Hermosillo (GMT-7)', value: 'America/Hermosillo' },
  { label: 'Tijuana (GMT-8)', value: 'America/Tijuana' },
  { label: 'Madrid (GMT+1)', value: 'Europe/Madrid' },
  { label: 'Buenos Aires (GMT-3)', value: 'America/Argentina/Buenos_Aires' },
  { label: 'Bogotá (GMT-5)', value: 'America/Bogota' },
  { label: 'Santiago (GMT-3)', value: 'America/Santiago' },
  { label: 'Lima (GMT-5)', value: 'America/Lima' },
  { label: 'Sao Paulo (GMT-3)', value: 'America/Sao_Paulo' },
  { label: 'Nueva York (GMT-5)', value: 'America/New_York' },
  { label: 'Miami (GMT-5)', value: 'America/New_York' },
];

export const LOCALES: { label: string; value: Locale }[] = [
  { label: 'Español (México)', value: 'es-MX' },
  { label: 'English (US)', value: 'en-US' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
class SettingsService {
  private cached: AppSettings | null = null;

  /**
   * Carga settings desde SecureStore (con caché en memoria)
   */
  async load(): Promise<AppSettings> {
    if (this.cached) return this.cached;

    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        this.cached = { ...DEFAULT_SETTINGS, ...parsed };
        return this.cached;
      }
    } catch {
      // Ignorar errores de parseo, usar defaults
    }

    this.cached = { ...DEFAULT_SETTINGS };
    return this.cached;
  }

  /**
   * Guarda settings completos en SecureStore
   */
  async save(settings: AppSettings): Promise<void> {
    this.cached = { ...settings };
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      console.warn('[Settings] Error saving settings');
    }
  }

  /**
   * Actualiza una propiedad específica y persiste
   */
  async update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings> {
    const current = await this.load();
    const updated = { ...current, [key]: value };
    await this.save(updated);
    return updated;
  }

  /**
   * Resetea todos los settings a valores por defecto
   */
  async reset(): Promise<AppSettings> {
    await this.save({ ...DEFAULT_SETTINGS });
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Obtiene el label de una timezone por su value
   */
  getTimezoneLabel(value: string): string {
    return TIMEZONES.find(t => t.value === value)?.label || value;
  }
}

export const settingsService = new SettingsService();
