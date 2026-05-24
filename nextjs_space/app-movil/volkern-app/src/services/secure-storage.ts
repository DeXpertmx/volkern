import * as SecureStore from 'expo-secure-store';

export async function getData<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return null;
}

export async function saveData(key: string, data: unknown): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(data));
  } catch {
    console.error(`[SecureStorage] Error saving key: ${key}`);
  }
}
