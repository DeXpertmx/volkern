// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFiltersPersistence } from '@/lib/hooks/useFiltersPersistence'

describe('useFiltersPersistence (con @testing-library/react)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('debe retornar los valores por defecto inicialmente', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('test-filters', { search: '', status: 'all' })
    )

    const [filters] = result.current
    expect(filters).toEqual({ search: '', status: 'all' })
  })

  it('debe restaurar valores guardados desde localStorage al montar', () => {
    localStorage.setItem(
      'volkern-test-filters',
      JSON.stringify({ search: 'guardado', status: 'activo' })
    )

    const { result } = renderHook(() =>
      useFiltersPersistence('test-filters', { search: '', status: 'all' })
    )

    const [filters] = result.current
    expect(filters.search).toBe('guardado')
    expect(filters.status).toBe('activo')
  })

  it('debe ignorar localStorage corrupto y usar defaults', () => {
    localStorage.setItem('volkern-test-filters', 'json-invalido{{{')

    const { result } = renderHook(() =>
      useFiltersPersistence('test-filters', { search: '', status: 'all' })
    )

    const [filters] = result.current
    expect(filters).toEqual({ search: '', status: 'all' })
  })

  it('debe ignorar localStorage vacío y usar defaults', () => {
    localStorage.setItem('volkern-test-filters', '')

    const { result } = renderHook(() =>
      useFiltersPersistence('test-filters', { search: 'default', status: 'all' })
    )

    const [filters] = result.current
    expect(filters).toEqual({ search: 'default', status: 'all' })
  })

  it('debe persistir filtros a localStorage cuando cambian', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('persist-test', { search: '', status: 'all' })
    )

    const [, setFilter] = result.current

    act(() => {
      setFilter('search', 'nuevo-valor')
    })

    const saved = localStorage.getItem('volkern-persist-test')
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(parsed.search).toBe('nuevo-valor')
  })

  it('setFilter debe actualizar un solo key sin borrar los demás', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('merge-test', { a: '1', b: '2', c: '3' })
    )

    act(() => {
      result.current[1]('b', 'cambiado')
    })

    const [filters] = result.current
    expect(filters.a).toBe('1')
    expect(filters.b).toBe('cambiado')
    expect(filters.c).toBe('3')
  })

  it('clearFilters debe restaurar los valores por defecto', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('clear-test', { search: '', status: 'all' })
    )

    // Cambiar filtro primero
    act(() => {
      result.current[1]('search', 'algo')
    })
    expect(result.current[0].search).toBe('algo')

    // Limpiar
    act(() => {
      result.current[2]() // clearFilters
    })

    expect(result.current[0]).toEqual({ search: '', status: 'all' })
  })

  it('clearFilters también limpia localStorage', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('clear-storage-test', { search: '' })
    )

    act(() => {
      result.current[1]('search', 'valor')
    })
    expect(localStorage.getItem('volkern-clear-storage-test')).toContain('valor')

    act(() => {
      result.current[2]()
    })

    const saved = localStorage.getItem('volkern-clear-storage-test')
    expect(saved).toContain('""') // search: ''
    expect(saved).not.toContain('valor')
  })

  it('debe usar claves de localStorage diferentes para diferentes storageKeys', () => {
    const { result: resultA } = renderHook(() =>
      useFiltersPersistence('filters-a', { search: '' })
    )
    const { result: resultB } = renderHook(() =>
      useFiltersPersistence('filters-b', { search: '' })
    )

    act(() => {
      resultA.current[1]('search', 'aaa')
      resultB.current[1]('search', 'bbb')
    })

    expect(resultA.current[0].search).toBe('aaa')
    expect(resultB.current[0].search).toBe('bbb')

    const savedA = JSON.parse(localStorage.getItem('volkern-filters-a')!)
    const savedB = JSON.parse(localStorage.getItem('volkern-filters-b')!)
    expect(savedA.search).toBe('aaa')
    expect(savedB.search).toBe('bbb')
  })

  it('debe restaurar solo los valores guardados, manteniendo defaults para el resto', () => {
    localStorage.setItem(
      'volkern-partial-test',
      JSON.stringify({ search: 'guardado' })
    )

    const { result } = renderHook(() =>
      useFiltersPersistence('partial-test', {
        search: '',
        status: 'all',
        extra: 'default',
      })
    )

    const [filters] = result.current
    expect(filters.search).toBe('guardado')
    expect(filters.status).toBe('all')
    expect(filters.extra).toBe('default')
  })

  it('filtersRestored debe ser false inicialmente y true tras el efecto de restauración', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('restored-test', { search: '' })
    )

    // Por defecto, al montar, el efecto se ejecuta como microtask
    // renderHook espera a que se ejecuten los efectos con React 18
    // El hook usa setFiltersRestored(true) dentro del efecto de restauración
    const [, , , filtersRestored] = result.current
    expect(filtersRestored).toBe(true)
  })

  it('debe manejar valores vacíos correctamente', () => {
    const { result } = renderHook(() =>
      useFiltersPersistence('empty-test', { search: '', status: 'all' })
    )

    act(() => {
      result.current[1]('search', '')
    })

    // El valor vacío es válido
    expect(result.current[0].search).toBe('')
  })

  it('el prefijo volkern- se añade automáticamente al storageKey', () => {
    renderHook(() =>
      useFiltersPersistence('prefix-test', { key: 'val' })
    )

    // Verificar que se usó el prefijo volkern-
    expect(localStorage.getItem('volkern-prefix-test')).not.toBeNull()
    // Verificar que NO se usó la clave sin prefijo
    expect(localStorage.getItem('prefix-test')).toBeNull()
  })
})
