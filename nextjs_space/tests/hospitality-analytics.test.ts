import { describe, it, expect } from 'vitest';
import {
  coversNight,
  perPropertyOccupancy,
  perChannelRevenueTrend,
  kpisVentana,
  antelacionDias,
  ocupacionPorDia,
  llegadasDelDia,
  salidasDelDia,
  resumenReservas,
  type AnalyticsReservationInput,
} from '../lib/hospitality/analytics';
import { unitOccupiedOnDay } from '../lib/hospitality/availability';

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

// ─── KPIs de Reportes (FASE 3.E) ──────────────────────────────────────────

describe('antelacionDias', () => {
  it('cuenta días completos entre reserva y llegada', () => {
    expect(antelacionDias({ checkIn: d(2026, 8, 15), bookedOn: d(2026, 8, 5) })).toBe(10);
    expect(antelacionDias({ checkIn: d(2026, 8, 15), bookedOn: d(2026, 8, 15) })).toBe(0);
  });

  it('sin fecha de reserva devuelve null (no inventa antelación)', () => {
    expect(antelacionDias({ checkIn: d(2026, 8, 15), bookedOn: null })).toBeNull();
    expect(antelacionDias({ checkIn: d(2026, 8, 15) })).toBeNull();
  });
});

describe('kpisVentana — ADR y RevPAR (FASE 3.E)', () => {
  // Ventana de 2 días (10 y 11 sep) con 2 unidades → 4 noches disponibles.
  const base = {
    reservations: [res()], // 5000 MXN, 5 noches (llega el 10, dentro de la ventana)
    totalUnidades: 2,
    dias: 2,
    hasta: HASTA,
  };

  it('ADR = ingresos / noches vendidas de las reservas del período', () => {
    const k = kpisVentana(base);
    // La reserva entera entra por su llegada (10 sep): 5000 / 5 noches = 1000.
    expect(k.adr).toBeCloseTo(1000);
    expect(k.dias).toBe(2);
  });

  it('RevPAR = ingresos / (unidades × días), comparable entre propiedades', () => {
    const k = kpisVentana(base);
    // 5000 / (2 unidades × 2 días) = 1250.
    expect(k.revpar).toBeCloseTo(1250);
  });

  it('RevPAR cruza con ADR × ocupación cuando la estancia cabe en la ventana', () => {
    // Reserva de 2 noches (10 y 11 sep) contenida en la ventana de 2 días:
    // la convención de producción y la noche a noche coinciden y la identidad
    // RevPAR = ADR × ocupación debe cumplirse exactamente.
    const k = kpisVentana({
      reservations: [res({ checkIn: d(2026, 8, 10), checkOut: d(2026, 8, 12), amountAfterTax: 2000 })],
      totalUnidades: 4,
      dias: 2,
      hasta: HASTA,
    });
    expect(k.adr).toBeCloseTo(1000); // 2000 / 2 noches
    expect(k.revpar).toBeCloseTo(250); // 2000 / (4 × 2)
    expect(k.revpar!).toBeCloseTo((k.adr as number) * 0.25, 6); // ocupación 1/4
  });

  it('sin noches vendidas: ADR y RevPAR nulos, nunca NaN ni Infinity', () => {
    const k = kpisVentana({
      reservations: [res({ estado: 'cancelled' })],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    expect(k.adr).toBeNull();
    expect(k.revpar).toBeCloseTo(0); // hay noches disponibles pero 0 ingresos
  });

  it('los numeradores viajan con el KPI: ADR = ingresos / nochesVendidas, con la MISMA población', () => {
    // Reserva de día completo: aporta ingresos pero CERO noches (no entra en
    // el denominador del ADR — era la incoherencia del cálculo inline antiguo,
    // que mezclaba noches de TODAS las activas con ingresos de una subpoblación).
    const k = kpisVentana({
      reservations: [
        res({ id: 'con_noches' }), // 5000, 5 noches, llega 10 sep (en ventana)
        res({ id: 'dia_completo', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 11), amountAfterTax: 800 }),
      ],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    expect(k.ingresos).toBe(5800); // 5000 + 800
    expect(k.nochesVendidas).toBe(5); // las del día completo no son noches
    expect(k.nochesDisponibles).toBe(4); // 2 unidades × 2 días
    expect(k.adr).toBeCloseTo(k.ingresos / k.nochesVendidas); // 1160
    expect(k.revpar).toBeCloseTo(k.ingresos / k.nochesDisponibles); // 1450
  });

  it('cero unidades: RevPAR nulo en lugar de dividir entre cero', () => {
    const k = kpisVentana({ reservations: [res()], totalUnidades: 0, dias: 2, hasta: HASTA });
    expect(k.revpar).toBeNull();
  });
});

describe('kpisVentana — estancia media, no-shows, cancelaciones y antelación', () => {
  it('estancia media = noches / reservas con estancia', () => {
    const k = kpisVentana({
      reservations: [
        res({ id: 'a' }), // 5 noches, llega 10 sep (en ventana)
        res({ id: 'b', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), amountAfterTax: 1000 }), // 1 noche
        res({ id: 'c', unitId: 'u2', checkIn: d(2026, 8, 12), checkOut: d(2026, 8, 12), amountAfterTax: 800 }), // día completo: sin noches
      ],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    // (5 + 1) / 2 reservas con estancia = 3. La de día completo no la baja.
    expect(k.estanciaMedia).toBeCloseTo(3);
  });

  it('no-shows y su tasa excluyen canceladas de la base', () => {
    const k = kpisVentana({
      reservations: [
        res({ id: 'a' }),
        res({ id: 'b', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), estado: 'no_show', amountAfterTax: 1000 }),
        res({ id: 'c', estado: 'cancelled' }),
      ],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    // Llegadas = confirmada + no_show = 2 (la cancelada no cuenta como llegada).
    expect(k.llegadas).toBe(2);
    expect(k.noShows).toBe(1);
    expect(k.tasaNoShow).toBeCloseTo(0.5);
    expect(k.cancelaciones).toBe(1);
  });

  it('tasa de no-show nula si no hubo llegadas (no 0%)', () => {
    const k = kpisVentana({ reservations: [], totalUnidades: 2, dias: 2, hasta: HASTA });
    expect(k.llegadas).toBe(0);
    expect(k.tasaNoShow).toBeNull();
    expect(k.estanciaMedia).toBeNull();
    expect(k.antelacionMediaDias).toBeNull();
    expect(k.antelacionMedianaDias).toBeNull();
  });

  it('antelación media y mediana desde bookedOn, solo reservas no canceladas', () => {
    const k = kpisVentana({
      reservations: [
        res({ id: 'a', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), bookedOn: d(2026, 8, 9) }), // 2 días
        res({ id: 'b', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), amountAfterTax: 1000, bookedOn: d(2026, 7, 10) }), // 32 días
        res({ id: 'c', estado: 'cancelled', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), bookedOn: d(2026, 6, 1) }), // excluida
        res({ id: 'd', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), estado: 'no_show' }), // sin bookedOn → null
      ],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    // Media de [2, 32] = 17; mediana también 17.
    expect(k.antelacionMediaDias).toBeCloseTo(17);
    expect(k.antelacionMedianaDias).toBeCloseTo(17);
  });

  it('la mediana es robusta ante valores extremos que disparan la media', () => {
    const k = kpisVentana({
      reservations: [
        res({ id: 'a', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), bookedOn: d(2026, 8, 10) }), // 1 día
        res({ id: 'b', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), amountAfterTax: 1000, bookedOn: d(2026, 8, 8) }), // 3 días
        res({ id: 'c', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), estado: 'no_show', bookedOn: d(2025, 7, 12) }), // 395 días
      ],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    // Media de [1, 3, 395] = 133; la mediana queda en 3 (el valor típico).
    expect(k.antelacionMediaDias).toBeCloseTo(133);
    expect(k.antelacionMedianaDias).toBe(3);
  });

  it('solo cuentan las reservas cuya LLEGADA cae en la ventana', () => {
    const k = kpisVentana({
      reservations: [
        res({ id: 'fuera', checkIn: d(2026, 8, 5), checkOut: d(2026, 8, 12) }), // llegó antes de la ventana
        res({ id: 'dentro', unitId: 'u2', checkIn: d(2026, 8, 11), checkOut: d(2026, 8, 12), amountAfterTax: 1000 }),
      ],
      totalUnidades: 2,
      dias: 2,
      hasta: HASTA,
    });
    // La reserva del 5 sep aporta 0 ingresos aquí (su llegada fue el 5),
    // aunque cubra noches dentro de la ventana: convención de producción.
    expect(k.llegadas).toBe(1);
    expect(k.adr).toBeCloseTo(1000);
    expect(k.cancelaciones).toBe(0);
  });
});

// ─── La trampa de instantes vs días (auditoría del 17 sep 2026) ──────────────
//
// Las reservas se guardan con HORA (llegada 15:00, salida 11:00). Comparar
// instantes contra el inicio del día corre la ocupación un día entero: cuenta
// la noche del check-out y pierde la de la llegada. Los tests anteriores usan
// fechas a medianoche, así que las dos formas coinciden y el fallo no se veía.

describe('coversNight con la hora real de las reservas', () => {
  // 10 sep 15:00 → 12 sep 11:00 (2 noches: la del 10 y la del 11).
  const real = res({
    checkIn: new Date(2026, 8, 10, 15, 0),
    checkOut: new Date(2026, 8, 11 + 1, 11, 0),
  });

  it('cuenta la noche de la llegada y no la del check-out', () => {
    expect(coversNight(real, d(2026, 8, 9).getTime())).toBe(false);
    expect(coversNight(real, d(2026, 8, 10).getTime())).toBe(true); // llegada 15:00
    expect(coversNight(real, d(2026, 8, 11).getTime())).toBe(true);
    expect(coversNight(real, d(2026, 8, 12).getTime())).toBe(false); // salida 11:00
  });

  it('coincide día a día con el motor de disponibilidad (§8), siempre', () => {
    // Guardia de coherencia: analítica y disponibilidad son la MISMA regla.
    // Se recorre cada estado porque aquí estaba el fallo: el motor bloqueaba
    // los no-show mientras la analítica ya no los contaba. Un no-show que
    // bloquea deja una unidad no vendible sin que nadie la ocupe.
    for (const estado of ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'pending']) {
      for (const dia of [8, 9, 10, 11, 12, 13]) {
        const fecha = d(2026, 8, dia);
        expect(
          coversNight({ ...real, estado }, fecha.getTime()),
          `coversNight y unitOccupiedOnDay difieren con estado=${estado} el ${dia} sep`
        ).toBe(
          unitOccupiedOnDay('u1', fecha, [
            { unitId: 'u1', checkIn: real.checkIn, checkOut: real.checkOut, estado },
          ])
        );
      }
    }
  });

  it('un no-show no bloquea la unidad (decisión de producto: el no-show es de cobro, no de inventario)', () => {
    const noShow = { unitId: 'u1', checkIn: real.checkIn, checkOut: real.checkOut, estado: 'no_show' };
    for (const dia of [10, 11]) {
      expect(coversNight({ ...real, estado: 'no_show' }, d(2026, 8, dia).getTime())).toBe(false);
      expect(unitOccupiedOnDay('u1', d(2026, 8, dia), [noShow])).toBe(false);
    }
  });
});

describe('ocupacionPorDia — la única forma de calcular ocupación', () => {
  const units = [{ id: 'u1', propertyId: 'p1' }, { id: 'u2', propertyId: 'p1' }];

  it('serie día a día y media con la regla §8 por días', () => {
    const { puntos, ocupacionMedia, unidades } = ocupacionPorDia({
      units,
      reservations: [res({ checkIn: new Date(2026, 8, 10, 15, 0), checkOut: new Date(2026, 8, 12, 11, 0) })],
      dias: 3,
      desde: d(2026, 8, 10),
    });

    expect(unidades).toBe(2);
    expect(puntos.map((p) => p.fecha)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(puntos.map((p) => p.ocupadas)).toEqual([1, 1, 0]);
    expect(puntos[0].ocupacion).toBeCloseTo(0.5);
    expect(ocupacionMedia).toBeCloseTo(1 / 3);
  });

  it('canceladas y no-shows no ocupan', () => {
    const { puntos } = ocupacionPorDia({
      units,
      reservations: [
        res({ id: 'x', estado: 'cancelled' }),
        res({ id: 'y', unitId: 'u2', estado: 'no_show' }),
      ],
      dias: 2,
      desde: d(2026, 8, 10),
    });
    expect(puntos.every((p) => p.ocupadas === 0)).toBe(true);
  });

  it('las reservas de unidades ajenas al conjunto no cuentan en el denominador ni en el numerador', () => {
    const { puntos } = ocupacionPorDia({
      units: [{ id: 'u9', propertyId: 'p2' }],
      reservations: [res()], // es de u1
      dias: 1,
      desde: d(2026, 8, 10),
    });
    expect(puntos[0].ocupadas).toBe(0);
    expect(puntos[0].total).toBe(1);
  });

  it('sin unidades no divide entre cero', () => {
    const r = ocupacionPorDia({ units: [], reservations: [res()], dias: 2, desde: d(2026, 8, 10) });
    expect(r.unidades).toBe(0);
    expect(r.ocupacionMedia).toBe(0);
    expect(r.puntos[0].ocupacion).toBe(0);
  });

  it('sin `desde` cubre la ventana de `dias` días que termina en `hasta`', () => {
    const { puntos } = ocupacionPorDia({ units, reservations: [res()], dias: 2, hasta: HASTA });
    expect(puntos.map((p) => p.fecha)).toEqual(['2026-09-10', '2026-09-11']);
  });
});

describe('llegadasDelDia y salidasDelDia (comparadas por días)', () => {
  const manana = res({ id: 'llegada', checkIn: new Date(2026, 8, 10, 15, 0), checkOut: new Date(2026, 8, 12, 11, 0) });
  const salidaManana = res({ id: 'salida', checkIn: new Date(2026, 8, 8, 15, 0), checkOut: new Date(2026, 8, 10, 11, 0) });

  it('una llegada a las 15:00 es del día de su fecha (no del anterior)', () => {
    expect(llegadasDelDia([manana, salidaManana], d(2026, 8, 10)).map((r) => r.id)).toEqual(['llegada']);
  });

  it('una salida a las 11:00 es del día de su fecha (no del siguiente)', () => {
    expect(salidasDelDia([manana, salidaManana], d(2026, 8, 10)).map((r) => r.id)).toEqual(['salida']);
    expect(salidasDelDia([manana], d(2026, 8, 12)).map((r) => r.id)).toEqual(['llegada']);
  });
});

describe('resumenReservas — totales de una lista filtrada', () => {
  it('cuenta noches e ingresos solo de las reservas que produjeron', () => {
    const r = resumenReservas([
      { estado: 'confirmed', checkIn: d(2026, 8, 10), checkOut: d(2026, 8, 12), amountAfterTax: 2000 },
      { estado: 'cancelled', checkIn: d(2026, 8, 10), checkOut: d(2026, 8, 15), amountAfterTax: 9999 },
      { estado: 'no_show', checkIn: d(2026, 8, 10), checkOut: d(2026, 8, 12), amountAfterTax: 5000 },
    ]);
    expect(r).toEqual({ reservas: 1, noches: 2, ingresos: 2000 });
  });

  it('acepta las fechas como ISO (lo que llega del JSON de la API)', () => {
    const r = resumenReservas([
      { estado: 'confirmed', checkIn: '2026-09-10T15:00:00.000Z', checkOut: '2026-09-12T11:00:00.000Z', amountAfterTax: 3000 },
    ]);
    expect(r.noches).toBe(2);
    expect(r.ingresos).toBe(3000);
  });

  it('lista vacía → ceros, nunca NaN', () => {
    expect(resumenReservas([])).toEqual({ reservas: 0, noches: 0, ingresos: 0 });
  });
});
