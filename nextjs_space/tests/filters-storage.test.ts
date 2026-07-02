import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import {
  saveFilters,
  loadFilters,
  clearSavedFilters,
  mergeWithDefaults,
  storageKey,
} from '@/lib/utils/filters-storage'

describe('filters-storage', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key]
      }),
      clear: vi.fn(() => {
        store = {}
      }),
      get length() {
        return Object.keys(store).length
      },
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    }
  })()

  beforeAll(() => {
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    })
    Object.defineProperty(global, 'window', {
      value: { localStorage: localStorageMock },
      writable: true,
    })
  })

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('saveFilters', () => {
    it('debe guardar filtros en localStorage como JSON', () => {
      const result = saveFilters('test-key', { search: 'hola', status: 'activo' })
      expect(result).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test-key',
        '{"search":"hola","status":"activo"}'
      )
    })

    it('debe guardar filtros vacíos correctamente', () => {
      const result = saveFilters('test-key', {})
      expect(result).toBe(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-key', '{}')
    })

    it('debe retornar false si localStorage lanza error', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded')
      })
      const result = saveFilters('test-key', { data: 'grande' })
      expect(result).toBe(false)
    })

    it('debe sobrescribir datos existentes para la misma clave', () => {
      saveFilters('test-key', { a: '1' })
      saveFilters('test-key', { b: '2' })

      const loaded = loadFilters('test-key')
      expect(loaded).toEqual({ b: '2' })
      // No debe contener el valor anterior
      expect(loaded).not.toHaveProperty('a')
    })
  })

  describe('loadFilters', () => {
    it('debe cargar filtros guardados desde localStorage', () => {
      localStorageMock.setItem('test-key', '{"search":"guardado","status":"nuevo"}')

      const result = loadFilters('test-key')
      expect(result).toEqual({ search: 'guardado', status: 'nuevo' })
    })

    it('debe retornar null si no hay datos guardados', () => {
      const result = loadFilters('clave-inexistente')
      expect(result).toBeNull()
    })

    it('debe retornar null si el JSON está corrupto', () => {
      localStorageMock.setItem('test-key', 'no-es-json{{{')

      const result = loadFilters('test-key')
      expect(result).toBeNull()
    })

    it('debe retornar null si el valor no es un objeto', () => {
      localStorageMock.setItem('test-key', '"solo-un-string"')

      const result = loadFilters('test-key')
      expect(result).toBeNull()
    })

    it('debe retornar null si el valor es un array', () => {
      localStorageMock.setItem('test-key', '[1,2,3]')

      const result = loadFilters('test-key')
      expect(result).toBeNull()
    })

    it('debe retornar null si el valor es null', () => {
      localStorageMock.setItem('test-key', 'null')

      const result = loadFilters('test-key')
      expect(result).toBeNull()
    })

    it('debe manejar localStorage.getItem retornando null', () => {
      localStorageMock.getItem.mockReturnValueOnce(null)

      const result = loadFilters('test-key')
      expect(result).toBeNull()
    })

    it('debe manejar objetos anidados correctamente', () => {
      const data = { search: 'test', nested: { key: 'value' } }
      localStorageMock.setItem('test-key', JSON.stringify(data))

      const result = loadFilters('test-key')
      // Los objetos anidados no se usan en filtros pero deben cargarse sin error
      expect(result).toBeTruthy()
    })
  })

  describe('clearSavedFilters', () => {
    it('debe eliminar los filtros guardados', () => {
      saveFilters('test-key', { search: 'algo' })
      expect(loadFilters('test-key')).not.toBeNull()

      const result = clearSavedFilters('test-key')
      expect(result).toBe(true)
      expect(loadFilters('test-key')).toBeNull()
    })

    it('debe retornar true incluso si la clave no existe', () => {
      const result = clearSavedFilters('clave-inexistente')
      expect(result).toBe(true)
    })

    it('debe retornar false si localStorage lanza error', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('Not available')
      })
      const result = clearSavedFilters('test-key')
      expect(result).toBe(false)
    })
  })

  describe('mergeWithDefaults', () => {
    it('debe retornar defaults cuando saved es null', () => {
      const result = mergeWithDefaults(null, { search: '', status: 'all' })
      expect(result).toEqual({ search: '', status: 'all' })
    })

    it('debe fusionar saved sobre defaults', () => {
      const result = mergeWithDefaults(
        { search: 'guardado' },
        { search: '', status: 'all' }
      )
      expect(result).toEqual({ search: 'guardado', status: 'all' })
    })

    it('debe preservar keys en saved que no están en defaults', () => {
      const result = mergeWithDefaults(
        { search: 'x', extra: 'y' },
        { search: '', status: 'all' }
      )
      expect(result).toEqual({ search: 'x', status: 'all', extra: 'y' })
    })

    it('debe manejar saved vacío correctamente', () => {
      const result = mergeWithDefaults({}, { a: '1', b: '2' })
      expect(result).toEqual({ a: '1', b: '2' })
    })

    it('no debe mutar el objeto defaults original', () => {
      const defaults = { search: '', status: 'all' }
      const original = { ...defaults }

      mergeWithDefaults({ search: 'cambiado' }, defaults)

      expect(defaults).toEqual(original)
    })
  })

  describe('storageKey', () => {
    it('debe generar clave con prefijo volkern', () => {
      expect(storageKey('leads-filters')).toBe('volkern-leads-filters')
    })

    it('debe manejar nombres con guiones', () => {
      expect(storageKey('contacts-search-filters')).toBe(
        'volkern-contacts-search-filters'
      )
    })
  })
})
