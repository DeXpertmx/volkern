/**
 * Almacenamiento para web.
 *
 * Usa localStorage directamente. En versiones anteriores se intentó
 * usar @react-native-async-storage/async-storage con dynamic import,
 * pero el módulo nativo falla en web porque NativeModules.RNCAsyncStorage
 * no existe, y el error se propaga incluso con try/catch porque Metro
 * lo incluye en el bundle.
 *
 * Para web, localStorage es suficiente y evita por completo el error:
 *   [@RNC/AsyncStorage]: NativeModule: AsyncStorage is null
 */

export async function getItem(key: string): Promise<string | null> {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage puede lanzar si está lleno o deshabilitado
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignorar
  }
}

export const storage = { getItem, setItem, removeItem }

export default storage
