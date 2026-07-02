import { useState, useEffect, useCallback } from 'react'
import { saveFilters, loadFilters, mergeWithDefaults, storageKey as buildStorageKey } from '@/lib/utils/filters-storage'

export interface PersistedFilters {
  [key: string]: string | undefined
}

/**
 * Hook para persistir y restaurar filtros en localStorage.
 *
 * - Restaura filtros guardados en el primer montaje (solo cliente)
 * - Persiste los filtros automáticamente cuando cambian
 * - Usa un guard `filtersRestored` para evitar sobrescribir valores
 *   guardados con los defaults antes de la restauración
 * - SSR-safe: solo accede a localStorage cuando `typeof window !== 'undefined'`
 *
 * @param storageKey - Clave única para localStorage (sin prefijo, se añade automáticamente)
 * @param defaultValues - Valores por defecto para los filtros
 * @returns [filters, setFilter, clearFilters, filtersRestored]
 */
export function useFiltersPersistence(
  name: string,
  defaultValues: PersistedFilters = {}
): [
    filters: PersistedFilters,
    setFilter: (key: string, value: string) => void,
    clearFilters: () => void,
    filtersRestored: boolean,
  ] {
  const fullKey = buildStorageKey(name)
  const [filters, setFilters] = useState<PersistedFilters>(defaultValues)
  const [filtersRestored, setFiltersRestored] = useState(false)

  // Restaurar filtros tras montaje (SSR-safe)
  useEffect(() => {
    const saved = loadFilters(fullKey)
    if (saved) {
      setFilters((prev) => mergeWithDefaults(saved, prev))
    }
    setFiltersRestored(true)
  }, [fullKey])

  // Persistir filtros cuando cambian (tras restauración)
  useEffect(() => {
    if (!filtersRestored) return
    saveFilters(fullKey, filters)
  }, [filters, filtersRestored, fullKey])

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({ ...defaultValues })
  }, [defaultValues])

  return [filters, setFilter, clearFilters, filtersRestored]
}
