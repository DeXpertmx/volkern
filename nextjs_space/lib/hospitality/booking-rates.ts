/**
 * Booking Engine público (FASE 3.D del plan de Booking Engine + Payments).
 *
 * Módulo PURO de cotización y validación. La disponibilidad la calcula
 * SIEMPRE el Availability Engine central (`unitAvailability`): este módulo
 * no reimplementa ninguna regla de ocupación (guardia de "un solo motor").
 *
 * Precio: noches × tarifa del rate plan activo de la unidad (la tarifa por
 * noche ya vive en `HospitalityRatePlan.tarifa`, sincronizada con el canal).
 * Restricciones del plan: `minNoches`, `maxNoches` y días de llegada/salida.
 *
 * Cada unidad cotiza con las restricciones de SU plan (`unidades[].ratePlan`),
 * porque la cotización pública evalúa varias unidades a la vez y cada una tiene
 * sus planes. El `ratePlan` de arriba queda como valor por defecto para quien
 * cotiza una sola unidad (la creación de la reserva). Mismo precio y mismas
 * restricciones en la página y en la reserva: si la página ofrece algo, la
 * reserva lo acepta.
 */

import { unitAvailability, type ActiveReservationSpan, type ActiveUnitBlockSpan } from './availability';
import { startOfDay, toIsoDate } from './calendar';

export const CANAL_BOOKING_ENGINE = 'Directa';

/** Restricciones de venta de un plan de tarifa. */
export interface RestriccionesVenta {
  minNoches?: number;
  maxNoches?: number | null;
  checkInDias?: number[] | null;
  checkOutDias?: number[] | null;
}

export interface CotizacionInput {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD (exclusiva: la salida no se cobra)
  /**
   * Cada unidad puede traer las restricciones de SU plan de tarifa: es la
   * forma correcta, porque cada unidad tiene sus propios planes. El `ratePlan`
   * de arriba queda como valor por defecto cuando la unidad no trae el suyo
   * (una sola unidad cotizada, como en la creación de la reserva).
   */
  unidades: Array<{ id: string; tarifaNoche: number | null; moneda: string; ratePlan?: RestriccionesVenta | null }>;
  reservas: ActiveReservationSpan[];
  bloques?: ActiveUnitBlockSpan[];
  ratePlan?: RestriccionesVenta | null;
}

/**
 * Normaliza las restricciones de una fila de rate plan (los días de la semana
 * viven en un Json y pueden venir como null o como array vacío = sin regla).
 * Acepta la fila de Prisma tal cual: el Json se valida aquí, no en cada ruta.
 */
export function restriccionesDeRatePlan(
  plan:
    | {
        minNoches?: number | null;
        maxNoches?: number | null;
        checkInDias?: unknown;
        checkOutDias?: unknown;
      }
    | null
    | undefined
): RestriccionesVenta | null {
  if (!plan) return null;
  const dias = (valor: unknown): number[] | null =>
    Array.isArray(valor) && valor.length ? (valor as number[]) : null;
  return {
    minNoches: plan.minNoches ?? 1,
    maxNoches: plan.maxNoches ?? null,
    checkInDias: dias(plan.checkInDias),
    checkOutDias: dias(plan.checkOutDias),
  };
}

export interface CotizacionUnidad {
  unitId: string;
  disponible: boolean
  motivo?: 'ocupada' | 'min_noches' | 'max_noches' | 'dia_checkin' | 'dia_checkout' | 'sin_tarifa';
  noches: number;
  precioTotal: number | null;
  moneda: string;
}

export interface Cotizacion {
  checkIn: string;
  checkOut: string;
  noches: number;
  moneda: string | null;
  unidades: CotizacionUnidad[];
  disponible: boolean;
}

function parseDia(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

export function cotizarEstancia(input: CotizacionInput): Cotizacion {
  const inicio = parseDia(input.checkIn);
  const fin = parseDia(input.checkOut);

  if (!inicio || !fin || fin.getTime() <= inicio.getTime()) {
    throw new Error('Fechas inválidas: checkOut debe ser posterior a checkIn');
  }

  // Noches del rango (§8: [checkIn, checkOut)).
  const noches: number[] = [];
  const cursor = startOfDay(inicio);
  while (cursor.getTime() < startOfDay(fin).getTime()) {
    noches.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  const nNoches = noches.length;

  // Disponibilidad por unidad: LA CALCULA EL MOTOR CENTRAL.
  const start = startOfDay(inicio);
  const end = startOfDay(fin);

  const diaLlegada = inicio.getDay();
  const diaSalida = fin.getDay();

  const unidades: CotizacionUnidad[] = input.unidades.map((u) => {
    // Restricciones del plan de esta unidad (o las del plan por defecto).
    const restricciones = restriccionesDeRatePlan(u.ratePlan ?? input.ratePlan);
    const minNoches = restricciones?.minNoches ?? 1;
    const maxNoches = restricciones?.maxNoches ?? null;
    const checkInDias = restricciones?.checkInDias ?? null;
    const checkOutDias = restricciones?.checkOutDias ?? null;
    // 1) Disponibilidad noche a noche — Availability Engine.
    const serie = unitAvailability(
      { id: u.id, propertyId: '', roomCode: null, estado: 'available' },
      start,
      end,
      input.reservas,
      input.bloques || [],
    );
    if (!serie.every((d) => d.disponible)) {
      return { unitId: u.id, disponible: false, motivo: 'ocupada', noches: nNoches, precioTotal: null, moneda: u.moneda };
    }
    // 2) Restricciones de venta del rate plan.
    if (nNoches < minNoches) {
      return { unitId: u.id, disponible: false, motivo: 'min_noches', noches: nNoches, precioTotal: null, moneda: u.moneda };
    }
    if (maxNoches != null && nNoches > maxNoches) {
      return { unitId: u.id, disponible: false, motivo: 'max_noches', noches: nNoches, precioTotal: null, moneda: u.moneda };
    }
    if (checkInDias && !checkInDias.includes(diaLlegada)) {
      return { unitId: u.id, disponible: false, motivo: 'dia_checkin', noches: nNoches, precioTotal: null, moneda: u.moneda };
    }
    if (checkOutDias && !checkOutDias.includes(diaSalida)) {
      return { unitId: u.id, disponible: false, motivo: 'dia_checkout', noches: nNoches, precioTotal: null, moneda: u.moneda };
    }
    // 3) Precio: noches × tarifa por noche del rate plan.
    if (u.tarifaNoche == null || u.tarifaNoche <= 0) {
      return { unitId: u.id, disponible: false, motivo: 'sin_tarifa', noches: nNoches, precioTotal: null, moneda: u.moneda };
    }
    const precioTotal = Math.round(u.tarifaNoche * nNoches * 100) / 100;
    return { unitId: u.id, disponible: true, noches: nNoches, precioTotal, moneda: u.moneda };
  });

  const monedas = new Set(unidades.map((u) => u.moneda));
  return {
    checkIn: toIsoDate(start),
    checkOut: toIsoDate(end),
    noches: nNoches,
    moneda: monedas.size === 1 ? unidades[0].moneda : null,
    unidades,
    disponible: unidades.some((u) => u.disponible),
  };
}

/** Referencia externa de la reserva pública: BE-<timestamp base36>. */
export function referenciaBookingEngine(): string {
  return `BE-${Date.now().toString(36).toUpperCase()}`;
}
