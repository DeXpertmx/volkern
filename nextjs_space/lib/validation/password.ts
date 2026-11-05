/**
 * Regla de contraseña — una sola fuente de verdad.
 *
 * La comprobación estaba escrita cinco veces (signup API, cambiar-password API,
 * perfil, backup de perfil y el schema de zod) y una sexta vez —con otro
 * número— en el formulario de registro: el placeholder decía «Mínimo 6
 * caracteres» y el cliente validaba `length < 6`, mientras el servidor exigía
 * 8 con mayúscula, minúscula y carácter especial. El resultado era un alta que
 * sólo fallaba al enviar, que es exactamente el error previsible que hay que
 * evitar en el registro.
 *
 * Este módulo no importa nada: se usa desde el cliente (para enseñar los
 * requisitos mientras se escribe) y desde el servidor (para aceptar o rechazar),
 * y ambos ven la misma regla.
 */

/** Mínimo real que exige el servidor. */
export const PASSWORD_MIN_LENGTH = 8

/** Mayúscula, minúscula, carácter especial y longitud mínima. */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/

/**
 * Texto del campo: nombra TODOS los requisitos, no sólo el primero. Si el
 * placeholder promete menos de lo que se exige, el usuario se entera tarde.
 */
export const PASSWORD_PLACEHOLDER =
  'Mínimo 8 caracteres, con mayúscula, minúscula y carácter especial'

/** Los cuatro requisitos, evaluados contra lo que lleva escrito el usuario. */
export function requisitosPassword(password: string) {
  return [
    {
      id: 'longitud',
      texto: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'mayuscula',
      texto: 'Una mayúscula',
      ok: /[A-Z]/.test(password),
    },
    {
      id: 'minuscula',
      texto: 'Una minúscula',
      ok: /[a-z]/.test(password),
    },
    {
      id: 'especial',
      texto: 'Un carácter especial (!@#$%&*.,?…)',
      ok: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    },
  ] as const
}

/** ¿Cumple la regla completa? El servidor acepta lo que esta función acepta. */
export function passwordValida(password: string): boolean {
  return PASSWORD_REGEX.test(password)
}
