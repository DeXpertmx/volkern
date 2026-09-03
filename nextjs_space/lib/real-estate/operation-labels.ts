/**
 * Etiquetas y utilidades de presentación para tipo de operación inmobiliaria.
 *
 * Módulo SALVO de Prisma: no importa @/lib/db ni @prisma/client, de modo que
 * puede importarse de forma segura desde componentes cliente (portal público),
 * donde bundlerear Prisma en el navegador rompe el runtime.
 */

/**
 * Etiquetas legibles para el tipo de operación (portal público).
 * Incluye 'alquiler_temporada' para renta vacacional estilo Airbnb/Booking.
 */
export function formatOperationLabel(operationType: string | null | undefined): string {
  switch (operationType) {
    case 'venta':
      return 'En Venta';
    case 'alquiler':
      return 'En Alquiler';
    case 'alquiler_temporada':
      return 'Renta Vacacional';
    case 'traspaso':
      return 'Traspaso';
    default:
      return 'Propiedad';
  }
}

/**
 * Color del badge por tipo de operación (portal público).
 */
export function operationBadgeColor(operationType: string | null | undefined): string {
  switch (operationType) {
    case 'venta':
      return '#3b82f6'; // azul
    case 'alquiler':
      return '#8b5cf6'; // violeta
    case 'alquiler_temporada':
      return '#0d9488'; // teal (renta vacacional)
    default:
      return '#6b7280'; // gris
  }
}

/**
 * Sufijo de precio según operación: mensual para alquiler, por noche
 * para renta vacacional, sin sufijo para venta.
 */
export function priceSuffix(operationType: string | null | undefined): string {
  if (operationType === 'alquiler') return '/mes';
  if (operationType === 'alquiler_temporada') return '/noche';
  return '';
}
