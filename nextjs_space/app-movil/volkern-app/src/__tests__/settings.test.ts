import { settingsService } from '../services/settings';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (settingsService as any).cached = null;
});

describe('settingsService.load', () => {
  it('returns default settings when no saved data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await settingsService.load();
    expect(result).toHaveProperty('theme', 'light');
    expect(result).toHaveProperty('locale', 'es-MX');
  });
  it('returns saved settings', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ theme: 'dark', locale: 'en-US' }));
    const result = await settingsService.load();
    expect(result.theme).toBe('dark');
    expect(result.locale).toBe('en-US');
  });
});

describe('settingsService.save', () => {
  it('persists settings', async () => {
    await settingsService.save({ theme: 'dark', locale: 'en-US', pushNotifications: true, emailNotifications: true, soundEnabled: true, dailyDigest: false, marketingEmails: false, useDeviceTheme: false, timezone: 'America/Mexico_City', showOnlineStatus: true, profileVisibility: 'team' });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('settingsService.update', () => {
  it('updates single setting', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ theme: 'light', locale: 'es-MX' }));
    await settingsService.update('theme', 'dark');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('settingsService.getTimezoneLabel', () => {
  it('returns label for known timezone', () => {
    const label = settingsService.getTimezoneLabel('America/Mexico_City');
    expect(label).toContain('Ciudad de México');
  });
  it('returns value for unknown timezone', () => {
    const label = settingsService.getTimezoneLabel('Unknown/Zone');
    expect(label).toBe('Unknown/Zone');
  });
});

describe('settingsService.save with error', () => {
  it('does not throw when SecureStore fails', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage full'));
    await expect(settingsService.save({
      theme: 'dark', locale: 'en-US', pushNotifications: true,
      emailNotifications: true, soundEnabled: true, dailyDigest: false,
      marketingEmails: false, useDeviceTheme: false,
      timezone: 'America/Mexico_City', showOnlineStatus: true,
      profileVisibility: 'team',
    })).resolves.toBeUndefined();
  });
});

describe('settingsService.reset', () => {
  it('restores default settings', async () => {
    const result = await settingsService.reset();
    expect(result.theme).toBe('light');
    expect(result.locale).toBe('es-MX');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});
