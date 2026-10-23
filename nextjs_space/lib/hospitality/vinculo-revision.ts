/**
 * Estados de revisión del vínculo (mapping) con el proveedor de conectividad.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * La vinculación automática por webhook puede crear un vínculo **sin que
 * nadie lo pida**: llega una reserva de un roomCode desconocido y el sistema
 * lo vincula solo dejando traza. Antes de esta pieza el vínculo nacía
 * `activo` y el dispatcher lo publicaba a la siguiente pasada —el canal
 * empezaba a vender una habitación que nadie había revisado— (pedido del
 * operador tras la revisión del hotel `75fdbbce2e`, 15-oct-2026).
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 * Un vínculo creado SOLO por el sistema (webhook) nace
 * `pendiente_revision`:
 *
 *   • **Entrada** (importar): reservas, mensajes, incidencias y
 *     reconciliación de reservas lo aceptan. La vinculación automática existe
 *     justo para que una reserva llegue a su unidad —romperla convertiría el
 *     estado en un agujero de importación.
 *   • **Salida** (publicar): solo el `activo` que confirmó una persona
 *     empuja. El dispatcher ya filtra `estado: 'activo'`, así que lo
 *     pendiente queda fuera del push sin tocar nada más.
 *   • **Revisar**: guardar los vínculos desde el wizard valida contra el
 *     catálogo real del proveedor y reescribe `activo` con
 *     `metadataConfirmado`. Eso ES la revisión; nada más hace falta.
 *
 * Es a propósito un módulo puro y sin dependencias (ni prisma ni fetch): la
 * regla se prueba sola y ningún test que mockee el adapter tiene que saber
 * de ella para ejecutar lo que la usa.
 *
 * Nota sobre los vínculos automáticos ANTERIORES a esta pieza: siguen
 * `activo` (no se retrae lo ya publicado); el resumen periódico que los
 * recuerda (`listarVinculosAutomaticosPendientes`) los sigue listando por su
 * `metadata`, pero no bloquean la activación —solo los `pendiente_revision`
 * nuevos lo hacen.
 */

/** Vínculo creado por el sistema y todavía sin confirmar por una persona. */
export const VINCULO_PENDIENTE_REVISION = 'pendiente_revision';

/**
 * Estados que las lecturas de ENTRADA (importar) aceptan: lo revisado y lo
 * pendiente de revisión viajan igual hacia el ERP.
 */
export const ESTADOS_VINCULO_TRABAJABLES = ['activo', VINCULO_PENDIENTE_REVISION] as const;

/**
 * La guarda que dice si un mapping sirve para contestar "¿de qué unidad es
 * esta reserva?". El `estado` llega tal cual de la base (string libre en el
 * schema), así que la comparación es con strings conocidos.
 */
export function vinculoTrabajable(
  estado: string | null | undefined
): estado is (typeof ESTADOS_VINCULO_TRABAJABLES)[number] {
  return (
    typeof estado === 'string' &&
    (ESTADOS_VINCULO_TRABAJABLES as readonly string[]).includes(estado)
  );
}

/**
 * Origen de los vínculos creados exclusivamente por el webhook. Los que
 * provienen de una incidencia reintentada con origen distinto son trabajo
 * aprobado por un operador y nacen `activo` como antes.
 */
export const ORIGEN_VINCULO_WEBHOOK = 'vinculacion_automatica_webhook';

/**
 * Estado con el que NACE un vínculo automático por su metadata. La regla del
 * operador («solo lo aprobado por una persona publica») vive aquí y no en el
 * creador: si algún día cambia, cambia en un sitio.
 */
export function estadoDeVinculoAutomatico(
  metadata: Record<string, unknown> | null | undefined
): string {
  return metadata?.origen === ORIGEN_VINCULO_WEBHOOK
    ? VINCULO_PENDIENTE_REVISION
    : 'activo';
}

/**
 * ¿Este vínculo cuenta como «pendiente de revisión» para el peaje de
 * activación? Solo los `pendiente_revision` NUEVOS bloquean activar; los
 * automáticos anteriores (estado `activo` con metadata webhook) son solo
 * materia del recordatorio periódico, no del peaje.
 */
export function vinculoPendienteDeRevision(
  estado: string | null | undefined
): boolean {
  return estado === VINCULO_PENDIENTE_REVISION;
}

/** Motivo legible para el informe del wizard. */
export const MOTIVO_PENDIENTE_DOTACION =
  'se importó sin revisar y no publica hasta que una persona confirme el vínculo';
