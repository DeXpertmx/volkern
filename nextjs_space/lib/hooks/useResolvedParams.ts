'use client'

import { useEffect, useState } from 'react'

/**
 * Resuelve el `params` de una página cliente.
 *
 * Next 16 entrega `params` como promesa también a los componentes de cliente,
 * pero este proyecto va con React 18, donde `use()` todavía no existe. El hook
 * la desenvuelve con estado y devuelve `undefined` mientras no esté lista, para
 * que la página pueda pintar su estado de carga sin leer un `params.id` vacío.
 */
export function useResolvedParams<T>(params: T | Promise<T>): T | undefined {
  const esPromesa = params != null && typeof (params as { then?: unknown }).then === 'function'
  const [resuelto, setResuelto] = useState<T | undefined>(
    esPromesa ? undefined : (params as T)
  )

  useEffect(() => {
    if (!esPromesa) {
      setResuelto(params as T)
      return
    }

    let activo = true
    ;(params as Promise<T>).then((valor) => {
      if (activo) setResuelto(valor)
    })

    return () => {
      activo = false
    }
  }, [params, esPromesa])

  return resuelto
}
