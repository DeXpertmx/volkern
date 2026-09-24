/**
 * Booking Engine público (FASE 3.D del plan de Booking Engine + Payments).
 *
 * Módulo PURO de cotización y validación. La disponibilidad la calcula
 * SIEMPRE el Availability Engine central (`unitAvailability`): este módulo
 * no reimplementa ninguna regla de ocupación (guardia de "un solo motor").
 *
 * Precio: la tarifa del rate plan activo de la unidad (la tarifa por noche ya
 * vive en `HospitalityRatePlan.tarifa`, sincronizada con el canal) multiplicada
 * por las noches — y, cuando el plan tiene **estacionalidad**, la suma noche a
 * noche con las MISMAS reglas que el resto del sistema (`./estacionalidad`, el
 * módulo que también tarifica el asistente y el push de canales). Con
 * temporadas el detalle viaja en `desgloseNoches`: la media del rango no es
 * ningún precio real y nadie la paga.
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
import { serieDeTarifas, tieneEstacionalidad, totalDeSerie } from './estacionalidad';

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
  unidades: Array<{
    id: string;
    tarifaNoche: number | null;
    moneda: string;
    ratePlan?: RestriccionesVenta | null;
    /**
     * Estacionalidad del plan de la unidad (el Json crudo `temporadas` /
     * `finDeSemana`, tal como vive en la fila). Presente y utilizable → el
     * precio se suma noche a noche; ausente → noches × tarifa, como siempre.
     */
    estacionalidad?: unknown;
  }>;
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
  /**
   * Precio por noche con su fecha cuando el plan tiene estacionalidad (`null`
   * en el cálculo plano, que no necesita desglose): es lo que la página enseña
   * noche a noche en vez de una media que nadie cobra.
   */
  desgloseNoches: Array<{ fecha: string; tarifa: number }> | null;
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

  /** Unidad que no se puede vender: misma causa que el Availability Engine, sin precio. */
  const sinVender = (
    unidad: { id: string; moneda: string },
    motivo: CotizacionUnidad['motivo']
  ): CotizacionUnidad => ({
    unitId: unidad.id,
    disponible: false,
    motivo,
    noches: nNoches,
    precioTotal: null,
    desgloseNoches: null,
    moneda: unidad.moneda,
  });

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
      return sinVender(u, 'ocupada');
    }
    // 2) Restricciones de venta del rate plan.
    if (nNoches < minNoches) {
      return sinVender(u, 'min_noches');
    }
    if (maxNoches != null && nNoches > maxNoches) {
      return sinVender(u, 'max_noches');
    }
    if (checkInDias && !checkInDias.includes(diaLlegada)) {
      return sinVender(u, 'dia_checkin');
    }
    if (checkOutDias && !checkOutDias.includes(diaSalida)) {
      return sinVender(u, 'dia_checkout');
    }
    // 3) Precio: la tarifa del plan por cada noche.
    if (u.tarifaNoche == null || u.tarifaNoche <= 0) {
      return sinVender(u, 'sin_tarifa');
    }

    // Con estacionalidad, la noche cuesta la tarifa de SU fecha (temporada, o
    // recargo de fin de semana) y el total es la suma de la serie: el mismo
    // cálculo del asistente y del push, hecho por el mismo módulo. Se devuelve
    // el detalle noche a noche para que la página pueda enseñarlo en vez de una
    // media que nadie paga.
    if (tieneEstacionalidad(u.estacionalidad)) {
      const tarifasPorNoche = serieDeTarifas({
        desde: inicio,
        hasta: fin,
        tarifaBase: u.tarifaNoche,
        plan: { tarifa: u.tarifaNoche, estacionalidad: u.estacionalidad },
      });
      const precioTotal = totalDeSerie(tarifasPorNoche);
      if (precioTotal === null) {
        return sinVender(u, 'sin_tarifa');
      }
      return {
        unitId: u.id,
        disponible: true,
        noches: nNoches,
        precioTotal,
        desgloseNoches: tarifasPorNoche.map((f) => ({
          fecha: f.fecha,
          tarifa: Math.round((f.tarifa ?? 0) * 100) / 100,
        })),
        moneda: u.moneda,
      };
    }

    const precioTotal = Math.round(u.tarifaNoche * nNoches * 100) / 100;
    return { unitId: u.id, disponible: true, noches: nNoches, precioTotal, desgloseNoches: null, moneda: u.moneda };
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
