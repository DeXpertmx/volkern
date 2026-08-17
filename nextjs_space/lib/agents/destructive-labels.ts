/**
 * Etiquetas legibles de los intents destructivos/sensibles (regla de seguridad
 * de Telegram): el bot NUNCA borra información y ninguna acción destructiva se
 * ejecuta sin confirmación explícita sí/no del usuario.
 *
 * CANCELAR ≠ BORRAR: cancelar una cita/factura deja rastro y es un flujo
 * permitido sin la puerta de confirmación destructiva.
 */
export const DESTRUCTIVE_INTENT_LABELS: Record<string, string> = {
  eliminar_horario: 'eliminar un horario de anuncios',
  declarar_ganador: 'declarar un ganador en el test A/B (cierra el test de forma definitiva)',
  ajustar_stock: 'ajustar el stock de un producto (entrada/salida/transferencia)',
  consumir_inventario: 'consumir inventario (descontar unidades)',
  cancelar_factura: 'cancelar una factura (deja constancia legal en el sistema)',
  rectificar_factura: 'rectificar una factura (cambio fiscal con efectos en hacienda)',
};
