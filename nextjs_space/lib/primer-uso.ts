/**
 * Secuencia del primer uso: sólo puede haber UN paso activo a la vez.
 *
 * El problema (informe de primeros pasos, 28 oct): al llegar al dashboard de
 * una cuenta recién creada se abrían a la vez el resumen de Gemma y la
 * petición de notificaciones. Dos mensajes compitiendo por la atención en el
 * mismo instante, cuando lo que hace falta es uno: orientar primero y pedir
 * permisos después.
 *
 * Quien manda es el briefing: mientras no se haya resuelto hoy (mostrado y
 * cerrado, o descartado porque la preferencia lo tiene desactivado), el resto
 * de pasos espera. La señal es un evento de ventana más un indicador en
 * memoria, para que el que se suscriba tarde también se entere de que ya pasó.
 *
 * Si el briefing no se monta en la sesión (páginas fuera del dashboard), el
 * paso siguiente espera: se prefiere no interrumpir antes de orientar.
 */

export const EVENTO_BRIEFING_RESUELTO = 'volkern:briefing-resuelto'

const CLAVE = 'last_morning_briefing'

let resuelto = false

/**
 * ¿Falta resolver el briefing de hoy? `true` significa «todavía no toca pedir
 * nada más al usuario».
 */
export function briefingPendienteHoy(): boolean {
  if (resuelto) return false
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CLAVE) !== new Date().toDateString()
  } catch {
    // Sin localStorage (modo privado estricto) no hay memoria del día:
    // preferimos no bloquear el paso siguiente.
    return false
  }
}

/** El briefing terminó: los demás pasos pueden continuar. */
export function marcarBriefingResuelto(): void {
  resuelto = true
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(EVENTO_BRIEFING_RESUELTO))
}
