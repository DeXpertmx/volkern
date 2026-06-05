/**
 * Almacenamiento seguro para web y native.
 *
 * En web, `@react-native-async-storage/async-storage` lanza
 *   NativeModule: AsyncStorage is null
 * porque el módulo nativo no existe. Este wrapper atrapa ese error
 * y hace fallback a localStorage.
 *
 * En native usa AsyncStorage directamente.
 */

type StorageImpl = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

// ─── Implementación web (localStorage) ───────────────────────────────────

const webStorage: StorageImpl = {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key)
  },
}

// ─── Implementación native (AsyncStorage) ────────────────────────────────

let nativeStorage: StorageImpl | null = null

async function getNativeStorage(): Promise<StorageImpl> {
  if (nativeStorage) return nativeStorage

  try {
    const mod = await import('@react-native-async-storage/async-storage')
    const AsyncStorage = mod.default
    // Verificar que realmente funciona (falla en web con NativeModule null)
    await AsyncStorage.getItem('__probe__').catch(() => {
      throw new Error('AsyncStorage probe failed')
    })
    nativeStorage = {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    }
  } catch {
    // Fallback a localStorage si AsyncStorage no está disponible
    nativeStorage = webStorage
  }

  return nativeStorage
}

// ─── API pública ─────────────────────────────────────────────────────────

let _implPromise: Promise<StorageImpl> | null = null

function getImpl(): Promise<StorageImpl> {
  if (!_implPromise) {
    _implPromise = getNativeStorage()
  }
  return _implPromise
}

export async function getItem(key: string): Promise<string | null> {
  const impl = await getImpl()
  return impl.getItem(key)
}

export async function setItem(key: string, value: string): Promise<void> {
  const impl = await getImpl()
  return impl.setItem(key, value)
}

export async function removeItem(key: string): Promise<void> {
  const impl = await getImpl()
  return impl.removeItem(key)
}

// También exportamos como objeto para compatibilidad con código legacy
export const storage: StorageImpl = {
  getItem: (key) => getItem(key),
  setItem: (key, value) => setItem(key, value),
  removeItem: (key) => removeItem(key),
}
