/**
 * Forma del hash de contraseña tal como se guarda en `User.password`.
 *
 * bcrypt produce siempre 60 caracteres (`$2b$<coste>$<salt><hash>`). Un valor
 * con otra forma no se puede validar nunca: `bcrypt.compare` devuelve `false`
 * por muy correcta que sea la contraseña, y la persona se queda fuera de su
 * cuenta sin que nadie sepa por qué. Por eso el login revisa la forma antes de
 * comparar y deja un aviso explícito en el log cuando no cuadra.
 */

import { logger } from '@/lib/logger'

const PATRON_HASH_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

/** ¿El hash guardado tiene la forma que produce bcrypt (60 caracteres)? */
export function tieneFormaDeHashBcrypt(hash: unknown): boolean {
  return typeof hash === 'string' && PATRON_HASH_BCRYPT.test(hash)
}

/**
 * Revisa la forma del hash y, si está corrupta, lo deja en el log como error
 * accionable (la cuenta necesita un restablecimiento de contraseña).
 *
 * Devuelve true solo cuando el hash sirve para comparar. Un usuario sin
 * contraseña no llega aquí: el login lo descarta antes, como «no encontrado».
 */
export function avisarSiHashCorrupto(params: { hash: unknown; userId: string }): boolean {
  if (tieneFormaDeHashBcrypt(params.hash)) return true

  logger.error(
    {
      event: 'password_hash_corrupto',
      userId: params.userId,
      longitud: typeof params.hash === 'string' ? params.hash.length : null,
    },
    'El hash de contraseña guardado no tiene forma bcrypt (60 caracteres): esa cuenta no podrá iniciar sesión hasta que se restablezca la contraseña.'
  )
  return false
}
