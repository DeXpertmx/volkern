import { describe, it, expect } from 'vitest';
import {
  coversNight,
  perPropertyOccupancy,
  perChannelRevenueTrend,
  type AnalyticsReservationInput,
} from '../lib/hospitality/analytics';

// Fechas locales deterministas (sin dependencia de la hora del sistema).
function d(y: number, m: number, day: number): Date {
  return new Date(y, m, day);
}

function res(overrides: Partial<AnalyticsReservationInput> = {}): AnalyticsReservationInput {
  return {
    id: 'r1',
    propertyId: 'p1',
    unitId: 'u1',
    channel: 'airbnb',
    estado: 'confirmed',
    checkIn: d(2026, 8, 10), // 10 sep 2026
    checkOut: d(2026, 8, 15), // 15 sep 2026 → 5 noches: 10,11,12,13,14
    amountAfterTax: 5000,
    currency: 'MXN',
    ...overrides,
  };
}

const HASTA = d(2026, 8, 11); // ventana de 2 días: 10 y 11 sep

describe('coversNight con check-in a mitad del día', () => {
  // Regresión: las reservas manuales entran a las 15:00 y las de OTA pueden
  // traer la hora del proveedor. Comparar instantes crudos dejaba fuera la
  // primera noche, así que el planning y las analíticas no coincidían.
  it('una reserva que entra a las 15:00 ocupa su primera noche', () => {
    const conHora = res({
      checkIn: new Date(2026, 8, 10, 15, 0, 0),
      checkOut: new Date(2026, 8, 12, 11, 0, 0),
    });
    expect(coversNight(conHora, d(2026, 8, 10).getTime())).toBe(true);
    expect(coversNight(conHora, d(2026, 8, 11).getTime())).toBe(true);
    // La noche del check-out no se ocupa (§8).
    expect(coversNight(conHora, d(2026, 8, 12).getTime())).toBe(false);
  });

  it('coincide con la convención del planning para el mismo caso', () => {
    const conHora = res({
      checkIn: new Date(2026, 8, 10, 15, 0, 0),
      checkOut: new Date(2026, 8, 12, 11, 0, 0),
    });
    const noches = [10, 11, 12].filter((dia) =>
      coversNight(conHora, d(2026, 8, dia).getTime())
    );
    expect(noches).toEqual([10, 11]);
  });
});

describe('coversNight (§8: checkIn <= D < checkOut)', () => {
  it('cubre las noches de la estancia, no la del check-out', () => {
    const r = res();
    expect(coversNight(r, d(2026, 8, 10).getTime())).toBe(true);
    expect(coversNight(r, d(2026, 8, 14).getTime())).toBe(true);
    expect(coversNight(r, d(2026, 8, 15).getTime())).toBe(false);
  });

  it('excluye canceladas y no_show', () => {
    expect(coversNight(res({ estado: 'cancelled' }), d(2026, 8, 11).getTime())).toBe(false);
    expect(coversNight(res({ estado: 'no_show' }), d(2026, 8, 11).getTime())).toBe(false);
  });
});

describe('perPropertyOccupancy', () => {
  const properties = [
    { id: 'p1', nombre: 'Villa Mar Azul' },
    { id: 'p2', nombre: 'Loft Centro' },
    { id: 'p3', nombre: 'Sin unidades' },
  ];
  const units = [
    { id: 'u1', propertyId: 'p1' },
    { id: 'u2', propertyId: 'p1' },
    { id: 'u3', propertyId: 'p2' },
  ];

  it('calcula ocupación diaria por propiedad y omite propiedades sin unidades', () => {
    const series = perPropertyOccupancy({
      properties,
      units,
      reservations: [res()],
      dias: 2,
      hasta: HASTA,
    });

    expect(series.map((s) => s.propertyId)).toEqual(['p1', 'p2']);
    const villa = series[0];
    expect(villa.nombre).toBe('Villa Mar Azul');
    expect(villa.totalUnidades).toBe(2);
    expect(villa.puntos).toHaveLength(2);
    // 10 y 11 sep están ocupadas por la reserva (1 de 2 unidades)
    expect(villa.puntos[0].ocupadas).toBe(1);
    expect(villa.puntos[1].ocupadas).toBe(1);
    expect(villa.puntos[0].ocupacion).toBeCloseTo(0.5);
    expect(villa.ocupacionMedia).toBeCloseTo(0.5);
    // Loft Centro sin reservas → 0
    expect(series[1].puntos.every((p) => p.ocupadas === 0)).toBe(true);
  });

  it('no doble-conta una unidad con dos reservas solapadas', () => {
    const series = perPropertyOccupancy({
      properties: [properties[0]],
      units: [units[0]],
      reservations: [
        res({ id: 'a', unitId: 'u1' }),
        res({ id: 'b', unitId: 'u1', channel: 'booking' }),
      ],
      dias: 2,
      hasta: HASTA,
    });
    expect(series[0].puntos[0].ocupadas).toBe(1);
    expect(series[0].puntos[0].ocupacion).toBe(1);
  });

  it('respeta la ventana: noches fuera del período no cuentan', () => {
    const series = perPropertyOccupancy({
      properties: [properties[0]],
      units: [units[0]],
      reservations: [res({ checkIn: d(2026, 8, 12), checkOut: d(2026, 8, 14) })],
      dias: 2,
      hasta: HASTA,
    });
    expect(series[0].puntos.every((p) => p.ocupadas === 0)).toBe(true);
    expect(series[0].ocupacionMedia).toBe(0);
  });
});

describe('perChannelRevenueTrend', () => {
  it('reparte el importe por noche y solo suma las noches dentro de la ventana', () => {
    const series = perChannelRevenueTrend({
      reservations: [res({ amountAfterTax: 5000 })], // 5 noches → 1000/noche
      dias: 2,
      hasta: HASTA,
    });
    expect(series).toHaveLength(1);
    expect(series[0].canal).toBe('airbnb');
    expect(series[0].puntos[0].ingresos).toBeCloseTo(1000);
    expect(series[0].puntos[1].ingresos).toBeCloseTo(1000);
    expect(series[0].total).toBeCloseTo(2000);
  });

  it('separa por canal y ordena por ingresos descendente', () => {
    const series = perChannelRevenueTrend({
      reservations: [
        res({ id: 'a', channel: 'airbnb', amountAfterTax: 5000 }),
        res({ id: 'b', channel: 'booking', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), amountAfterTax: 9000 }),
      ],
      dias: 2,
      hasta: HASTA,
    });
    expect(series.map((s) => s.canal)).toEqual(['booking', 'airbnb']);
    expect(series[0].total).toBeCloseTo(9000);
    expect(series[1].total).toBeCloseTo(2000);
  });

  it('excluye canceladas y reservas sin importe', () => {
    const series = perChannelRevenueTrend({
      reservations: [
        res({ id: 'c', estado: 'cancelled' }),
        res({ id: 'd', amountAfterTax: null }),
        res({ id: 'e', amountAfterTax: 0 }),
      ],
      dias: 2,
      hasta: HASTA,
    });
    expect(series).toHaveLength(0);
  });

  it('reserva sin noches (mismo día) atribuye todo al día de llegada', () => {
    const series = perChannelRevenueTrend({
      reservations: [res({ checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 11), amountAfterTax: 777 })],
      dias: 2,
      hasta: HASTA,
    });
    expect(series[0].puntos[1].ingresos).toBeCloseTo(777);
    expect(series[0].puntos[0].ingresos).toBe(0);
    expect(series[0].total).toBeCloseTo(777);
  });

  it('reserva que empieza antes de la ventana aporta solo las noches dentro', () => {
    const series = perChannelRevenueTrend({
      reservations: [res({ checkIn: d(2026, 8, 5), checkOut: d(2026, 8, 11), amountAfterTax: 6000 })], // 6 noches: 5..10 sep → 1000/noche
      dias: 2,
      hasta: HASTA,
    });
    // Solo la noche del 10 sep cae en la ventana (la del 11 ya es check-out)
    expect(series[0].puntos[0].ingresos).toBeCloseTo(1000);
    expect(series[0].puntos[1].ingresos).toBe(0);
    expect(series[0].total).toBeCloseTo(1000);
  });
});
