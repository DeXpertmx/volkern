/**
 * Etiquetas y utilidades de presentación para tipo de operación inmobiliaria.
 *
 * Módulo SALVO de Prisma: no importa @/lib/db ni @prisma/client, de modo que
 * puede importarse de forma segura desde componentes cliente (portal público),
 * donde bundlerear Prisma en el navegador rompe el runtime.
 */

import { formatearImporte } from '@/lib/moneda';

/** Texto con el que se anuncia un inmueble que no publica precio. */
const PRECIO_A_CONSULTAR = 'Precio a consultar';

/**
 * Precio de un inmueble listo para pintar.
 *
 * Un inmueble sin precio publicado (0 o ausente) se anuncia como «Precio a
 * consultar» en vez de «0 €»: un cero es un importe, no la falta de importe, y
 * en el portal parecía una propiedad regalada.
 */
export function formatearPrecioInmueble(
  precio: number | null | undefined,
  moneda: string | null | undefined
): string {
  if (!precio || precio <= 0) return PRECIO_A_CONSULTAR;
  return formatearImporte(precio, moneda || '', 0);
}

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
