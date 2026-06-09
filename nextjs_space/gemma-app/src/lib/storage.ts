import { Platform } from 'react-native'

/**
 * Almacenamiento universal y seguro para Web y Móvil.
 * - En la Web: utiliza `localStorage` para que la sesión persista.
 * - En Móvil (Expo Go): utiliza un almacenamiento seguro en memoria (memoryStore)
 *   como alternativa rápida y 100% libre de crasheos nativos.
 */

const memoryStore: Record<string, string> = {}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  
  // Respaldo en memoria para dispositivos móviles
  return memoryStore[key] || null
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Ignorar fallos de cuota o modo incógnito
    }
  }
  
  // Guardar siempre en memoria para la sesión activa móvil
  memoryStore[key] = value
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key)
    } catch {
      // Ignorar fallos
    }
  }
  
  delete memoryStore[key]
}

export const storage = { getItem, setItem, removeItem }

export default storage
