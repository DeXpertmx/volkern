/**
 * Eventos del portal público.
 *
 * Módulo sin Prisma a propósito: lo importa el beacon del navegador, y
 * arrastrar `@/lib/db` al bundle del portal rompería el runtime.
 */

const EVENTOS_PORTAL = ['visita_portada', 'visita_ficha', 'clic_contacto'] as const;
export type EventoPortal = (typeof EVENTOS_PORTAL)[number];

export function esEventoPortal(valor: unknown): valor is EventoPortal {
  return typeof valor === 'string' && (EVENTOS_PORTAL as readonly string[]).includes(valor);
}
