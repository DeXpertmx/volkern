import { useState, useEffect } from 'react'

/**
 * Retorna una versión debounced del valor de entrada.
 * El valor debounced solo se actualiza después de `delay` ms
 * sin cambios en el valor original.
 *
 * Implementación basada en la utilidad pura `lib/utils/debounce.ts`.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
