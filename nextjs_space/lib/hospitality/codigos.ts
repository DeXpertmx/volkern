/**
 * Normalización de los códigos externos de la capa de conectividad.
 *
 * El proveedor puede enviar los códigos con mayúsculas o espacios accidentales
 * (`"  Executive "` ≡ `executive`), así que `roomCode` y `rateplanCode` se
 * comparan siempre normalizados: al resolver la unidad de una reserva entrante
 * (guardia de roomCode) y al buscar el vínculo que la resolvería.
 */
export function normalizeExternalCode(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}
