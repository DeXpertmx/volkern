/**
 * Utilidades puras para leer y escribir filtros en localStorage.
 * Separadas de los hooks de React para facilitar el testeo unitario.
 */

export interface StoredFilters {
  [key: string]: string | undefined
}

const STORAGE_PREFIX = 'volkern'

/**
 * Guarda filtros en localStorage bajo la clave dada.
 * No lanza excepciones — falla silenciosamente si localStorage no está disponible.
 */
export function saveFilters(storageKey: string, filters: StoredFilters): boolean {
  if (typeof window === 'undefined') return false
  try {
    localStorage.setItem(storageKey, JSON.stringify(filters))
    return true
  } catch {
    return false
  }
}

/**
 * Carga filtros desde localStorage.
 * Retorna null si no hay datos guardados o si localStorage no está disponible.
 */
export function loadFilters(storageKey: string): StoredFilters | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return parsed as StoredFilters
  } catch {
    return null
  }
}

/**
 * Elimina los filtros guardados para la clave dada.
 */
export function clearSavedFilters(storageKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    localStorage.removeItem(storageKey)
    return true
  } catch {
    return false
  }
}

/**
 * Fusiona los filtros guardados con los valores por defecto.
 * Los valores guardados prevalecen sobre los defaults cuando existen.
 */
export function mergeWithDefaults(
  saved: StoredFilters | null,
  defaults: StoredFilters
): StoredFilters {
  if (!saved) return { ...defaults }
  return { ...defaults, ...saved }
}

/**
 * Genera una clave de almacenamiento con prefijo de la app.
 */
export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}-${name}`
}
