import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '@/lib/utils/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debe ejecutar la función después del delay especificado', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('arg1', 'arg2')

    // No debe ejecutarse antes del delay
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('debe cancelar la llamada anterior si se invoca de nuevo antes del delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('primero')
    vi.advanceTimersByTime(200)

    debounced('segundo')
    vi.advanceTimersByTime(200)

    debounced('tercero')

    // Aún no debe haberse ejecutado nada
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)

    // Solo la última llamada debe ejecutarse
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('tercero')
  })

  it('debe manejar múltiples argumentos correctamente', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced(1, 'dos', { tres: 3 })

    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledWith(1, 'dos', { tres: 3 })
  })

  it('debe manejar delay 0 (ejecución inmediata en el siguiente tick)', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 0)

    debounced('inmediato')

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(0)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('.cancel() debe cancelar el timer pendiente', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('cancelado')

    vi.advanceTimersByTime(200)

    debounced.cancel()

    vi.advanceTimersByTime(500)

    expect(fn).not.toHaveBeenCalled()
  })

  it('.cancel() no debe lanzar error si no hay timer pendiente', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    // Cancelar sin haber llamado a debounced
    expect(() => debounced.cancel()).not.toThrow()

    // Llamar y cancelar
    debounced('test')
    debounced.cancel()
    expect(() => debounced.cancel()).not.toThrow()
  })

  it('debe permitir múltiples ejecuciones tras expirar cada delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    // Primera ráfaga
    debounced('a')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith('a')

    // Segunda ráfaga
    debounced('b')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')

    // Tercera ráfaga
    debounced('c')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenLastCalledWith('c')
  })

  it('debe simular correctamente el tipeo rápido del usuario', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    // Simular tipeo: una tecla cada 50ms
    const chars = ['h', 'ho', 'hol', 'hola']
    for (const char of chars) {
      debounced(char)
      vi.advanceTimersByTime(50)
    }

    // No debe haberse ejecutado durante el tipeo
    expect(fn).not.toHaveBeenCalled()

    // Esperar el delay restante (300ms desde la última tecla)
    vi.advanceTimersByTime(250)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('hola')
  })

  it('clearTimeout debe llamarse al cancelar', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('test')
    debounced.cancel()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  it('clearTimeout debe llamarse al re-invocar antes del delay', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const fn = vi.fn()
    const debounced = debounce(fn, 500)

    debounced('primero')
    const callCountBefore = clearTimeoutSpy.mock.calls.length

    debounced('segundo')
    // Debe haberse llamado a clearTimeout para cancelar el timer de 'primero'
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(callCountBefore)

    clearTimeoutSpy.mockRestore()
  })
})
