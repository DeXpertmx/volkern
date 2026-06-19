'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook que retorna un valor debounced después de `delay` ms.
 * Útil para inputs de búsqueda donde no se quiere filtrar en cada tecla.
 *
 * Retorna un tuple [debouncedValue, flush], donde flush() fuerza
 * la actualización inmediata del valor debounced (útil para botones
 * de "limpiar" donde no se quiere esperar el delay).
 *
 * @example
 * const [debouncedSearch, flushSearch] = useDebounce(searchTerm, 300)
 * // filter logic usa debouncedSearch en vez de searchTerm
 * // flushSearch() — actualiza debouncedSearch inmediatamente
 */
export function useDebounce<T>(value: T, delay: number): [T, () => void] {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const flush = useCallback(() => setDebouncedValue(value), [value]);

  return [debouncedValue, flush];
}
