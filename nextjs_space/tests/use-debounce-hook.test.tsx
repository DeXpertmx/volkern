// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/lib/hooks/useDebounce'

describe('useDebounce (con @testing-library/react)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debe retornar el valor inicial inmediatamente', () => {
    const { result } = renderHook(() => useDebounce('hola', 300))
    expect(result.current).toBe('hola')
  })

  it('debe retornar el valor inicial para tipos numéricos', () => {
    const { result } = renderHook(() => useDebounce(42, 500))
    expect(result.current).toBe(42)
  })

  it('no debe actualizar el valor antes de que expire el delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'inicial', delay: 500 } }
    )

    expect(result.current).toBe('inicial')

    // Cambiar el valor
    rerender({ value: 'cambiado', delay: 500 })

    // Avanzar solo 200ms (menos que el delay)
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Aún no debe haber cambiado
    expect(result.current).toBe('inicial')
  })

  it('debe actualizar el valor después del delay completo', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'inicial', delay: 300 } }
    )

    expect(result.current).toBe('inicial')

    rerender({ value: 'actualizado', delay: 300 })

    // Avanzar el delay completo
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('actualizado')
  })

  it('debe cancelar el timer anterior si el valor cambia antes del delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'primero', delay: 500 } }
    )

    expect(result.current).toBe('primero')

    // Cambiar a segundo valor a los 200ms
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'segundo', delay: 500 })

    // Cambiar a tercer valor a los 200ms (total 400ms desde inicio)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'tercero', delay: 500 })

    // Avanzar solo 300ms más (total 700ms, pero solo 300ms desde 'tercero')
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // 'tercero' aún no debe haberse aplicado (faltan 200ms)
    expect(result.current).toBe('primero')

    // Completar los 200ms restantes
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toBe('tercero')
  })

  it('debe simular tipeo rápido sin disparar actualizaciones intermedias', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'h' } }
    )

    // Simular tipeo: cada carácter cada 50ms
    const chars = ['ho', 'hol', 'hola']
    for (const char of chars) {
      act(() => {
        vi.advanceTimersByTime(50)
      })
      rerender({ value: char })
    }

    // Durante el tipeo, el valor no debe cambiar
    expect(result.current).toBe('h')

    // Esperar el delay completo desde el último carácter
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Solo debe reflejar el último valor
    expect(result.current).toBe('hola')
  })

  it('debe funcionar con delay 0 (actualización inmediata)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 0),
      { initialProps: { value: 'inicial' } }
    )

    rerender({ value: 'instantáneo' })

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(result.current).toBe('instantáneo')
  })

  it('debe limpiar el timer al desmontar (sin memory leaks)', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { unmount } = renderHook(() => useDebounce('valor', 300))

    unmount()

    // Al desmontar, el cleanup del useEffect debe llamar a clearTimeout
    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })

  it('debe manejar cambios de delay correctamente', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'test', delay: 500 } }
    )

    // Cambiar valor y delay
    rerender({ value: 'nuevo', delay: 100 })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toBe('nuevo')
  })

  it('debe retornar el valor actual cuando el delay no cambia', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 200 } }
    )

    rerender({ value: 'b', delay: 200 })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toBe('b')
  })
})
