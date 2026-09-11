/**
 * Tipos de bloqueo de unidad (Calendar Blocks).
 *
 * Módulo PURO y compartido: la API valida contra esta lista y la UI la pinta.
 * No debe existir una segunda copia de los tipos en ninguna pantalla: si se
 * duplica, la UI puede ofrecer un tipo que el servidor rechaza.
 *
 * No todo lo que ocupa una unidad es una reserva:
 *  - `propietario`     → uso propio del propietario (fuera de venta)
 *  - `mantenimiento`   → unidad fuera de servicio por incidencia
 *  - `administrativo`  → cierre comercial / bloqueo administrativo
 *
 * Las reservas (OTA, manual o Booking Engine) NO son bloqueos: son entidades
 * propias del Reservation Engine. Los cuatro restan disponibilidad por el
 * mismo motor.
 */

export const TIPOS_BLOQUEO = ['propietario', 'mantenimiento', 'administrativo'] as const;

export type TipoBloqueo = (typeof TIPOS_BLOQUEO)[number];

export const TIPO_BLOQUEO_POR_DEFECTO: TipoBloqueo = 'propietario';

/** Presentación de cada tipo para la UI (etiqueta y color del bloque). */
export const PRESENTACION_BLOQUEO: Record<TipoBloqueo, { etiqueta: string; color: string }> = {
  propietario: { etiqueta: 'Propietario', color: '#b45309' },
  mantenimiento: { etiqueta: 'Mantenimiento', color: '#b91c1c' },
  administrativo: { etiqueta: 'Administrativo', color: '#475569' },
};

export function esTipoBloqueoValido(valor: unknown): valor is TipoBloqueo {
  return typeof valor === 'string' && (TIPOS_BLOQUEO as readonly string[]).includes(valor);
}

/** Normaliza un tipo desconocido al valor por defecto (nunca falla). */
export function normalizarTipoBloqueo(valor: unknown): TipoBloqueo {
  return esTipoBloqueoValido(valor) ? valor : TIPO_BLOQUEO_POR_DEFECTO;
}

export function etiquetaTipoBloqueo(valor: unknown): string {
  return PRESENTACION_BLOQUEO[normalizarTipoBloqueo(valor)].etiqueta;
}

export function colorTipoBloqueo(valor: unknown): string {
  return PRESENTACION_BLOQUEO[normalizarTipoBloqueo(valor)].color;
}
