import * as SecureStore from 'expo-secure-store';

// ─── Keys ─────────────────────────────────────────────────────────────────────
const KEYS = {
  AUTH_TOKEN: 'volkern_auth_token',
  USER_DATA: 'volkern_user_data',
  BIOMETRIC_ENABLED: 'volkern_biometric_enabled',
  BIOMETRIC_TOKEN: 'volkern_biometric_token',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  tenantId: string;
  phone?: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
async function getItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function getToken(): Promise<string | null> {
  return getItem(KEYS.AUTH_TOKEN);
}

export async function setToken(token: string): Promise<void> {
  await setItem(KEYS.AUTH_TOKEN, token);
}

export async function removeToken(): Promise<void> {
  await removeItem(KEYS.AUTH_TOKEN);
}

export async function getUserData(): Promise<UserData | null> {
  const raw = await getItem(KEYS.USER_DATA);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

export async function setUserData(user: UserData): Promise<void> {
  await setItem(KEYS.USER_DATA, JSON.stringify(user));
}

export async function removeUserData(): Promise<void> {
  await removeItem(KEYS.USER_DATA);
}

// ─── Biometría ────────────────────────────────────────────────────────────────
export async function isBiometricEnabled(): Promise<boolean> {
  const val = await getItem(KEYS.BIOMETRIC_ENABLED);
  return val === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await setItem(KEYS.BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
}

export async function getBiometricToken(): Promise<string | null> {
  return getItem(KEYS.BIOMETRIC_TOKEN);
}

export async function setBiometricToken(token: string): Promise<void> {
  await setItem(KEYS.BIOMETRIC_TOKEN, token);
}

export async function removeBiometricToken(): Promise<void> {
  await removeItem(KEYS.BIOMETRIC_TOKEN);
}

// ─── Clear All ────────────────────────────────────────────────────────────────
export async function clearAll(): Promise<void> {
  await Promise.all([
    removeToken(),
    removeUserData(),
    removeBiometricToken(),
  ]);
}
