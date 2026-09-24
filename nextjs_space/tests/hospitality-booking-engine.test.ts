// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  cotizarEstancia,
  restriccionesDeRatePlan,
  referenciaBookingEngine,
  CANAL_BOOKING_ENGINE,
} from '../lib/hospitality/booking-engine';
import { unitOccupiedOnDay, type ActiveReservationSpan } from '../lib/hospitality/availability';

/**
 * Guardia de la FASE 3.D — Booking Engine público.
 *
 * Reglas del plan que protege:
 * 1. La disponibilidad pública la calcula el Availability Engine central
 *    (`unitAvailability`): el booking engine NO reimplementa la regla §8.
 * 2. Precio = noches × tarifa del rate plan; la noche de salida no se cobra.
 * 3. Las restricciones de venta del rate plan se respetan (min/max noches,
 *    días de llegada/salida).
 * 4. La reserva pública entra al flujo común como canal "Directa".
 */

// Ventana: 10 → 15 sep (5 noches: 10, 11, 12, 13, 14).
const d = (y: number, m: number, day: number) => new Date(y, m, day);
const R1: ActiveReservationSpan = {
  unitId: 'u_ocupada',
  checkIn: d(2026, 8, 12),
  checkOut: d(2026, 8, 15),
  estado: 'confirmed',
};

const unidades = (ids: string[], tarifa = 100) =>
  ids.map((id) => ({ id, tarifaNoche: tarifa, moneda: 'MXN' }));

describe('cotizarEstancia — disponibilidad vía Availability Engine', () => {
  it('cuenta 5 noches del 10 al 15 (la salida no se cobra, §8)', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: unidades(['u1']),
      reservas: [],
    });
    expect(c.noches).toBe(5);
    expect(c.unidades[0].disponible).toBe(true);
    expect(c.unidades[0].precioTotal).toBe(500);
  });

  it('unidad ocupada en medio del rango → no disponible con motivo ocupada', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: unidades(['u_ocupada']),
      reservas: [R1],
    });
    expect(c.unidades[0].disponible).toBe(false);
    expect(c.unidades[0].motivo).toBe('ocupada');
    expect(c.disponible).toBe(false);
  });

  it('reserva cancelada NO bloquea la unidad (misma regla que el motor)', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: unidades(['u_ocupada']),
      reservas: [{ ...R1, estado: 'cancelled' }],
    });
    expect(c.unidades[0].disponible).toBe(true);
  });

  it('bloqueo de mantenimiento saca la unidad de venta', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      unidades: unidades(['u1']),
      reservas: [],
      bloques: [{ unitId: 'u1', fechaInicio: d(2026, 8, 10), fechaFin: d(2026, 8, 12), estado: 'activo' }],
    });
    expect(c.unidades[0].disponible).toBe(false);
    expect(c.unidades[0].motivo).toBe('ocupada');
  });

  it('mezcla unidades: es vendible si al menos una está libre', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: unidades(['u_ocupada', 'u_libre']),
      reservas: [R1],
    });
    expect(c.disponible).toBe(true);
    expect(c.unidades.find((u) => u.unitId === 'u_libre')?.disponible).toBe(true);
    expect(c.unidades.find((u) => u.unitId === 'u_ocupada')?.disponible).toBe(false);
  });
});

describe('cotizarEstancia — precio y restricciones del rate plan', () => {
  it('precio = noches × tarifa (con decimales redondeados a 2)', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-13', // 3 noches
      unidades: [{ id: 'u1', tarifaNoche: 99.99, moneda: 'MXN' }],
      reservas: [],
    });
    expect(c.unidades[0].precioTotal).toBe(299.97);
  });

  it('sin tarifa publicada → no vendible (sin inventar precio)', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-13',
      unidades: [{ id: 'u1', tarifaNoche: null, moneda: 'MXN' }],
      reservas: [],
    });
    expect(c.unidades[0].disponible).toBe(false);
    expect(c.unidades[0].motivo).toBe('sin_tarifa');
  });

  it('minNoches del rate plan: 2 noches pedidas contra mínimo de 3', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      unidades: unidades(['u1']),
      reservas: [],
      ratePlan: { minNoches: 3 },
    });
    expect(c.unidades[0].motivo).toBe('min_noches');
  });

  it('maxNoches del rate plan', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: unidades(['u1']),
      reservas: [],
      ratePlan: { maxNoches: 4 },
    });
    expect(c.unidades[0].motivo).toBe('max_noches');
  });

  it('días de llegada/salida restringidos (0=domingo … 6=sábado)', () => {
    // 10 sep 2026 es jueves (4); 13 sep es domingo (0).
    const soloLlegadaFinDeSemana = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-13',
      unidades: unidades(['u1']),
      reservas: [],
      ratePlan: { checkInDias: [5, 6, 0] }, // vie, sáb, dom
    });
    expect(soloLlegadaFinDeSemana.unidades[0].motivo).toBe('dia_checkin');

    const salidaDomingoOk = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-13',
      unidades: unidades(['u1']),
      reservas: [],
      ratePlan: { checkOutDias: [0] }, // domingo
    });
    expect(salidaDomingoOk.unidades[0].disponible).toBe(true);
  });

  it('las restricciones de cada unidad mandan sobre el plan por defecto', () => {
    // Dos unidades con planes distintos: la cotización pública cotiza todas
    // las unidades a la vez, así que cada una trae su propio plan.
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-12', // 2 noches
      unidades: [
        { id: 'u_min3', tarifaNoche: 100, moneda: 'MXN', ratePlan: { minNoches: 3 } },
        { id: 'u_min1', tarifaNoche: 120, moneda: 'MXN', ratePlan: { minNoches: 1 } },
      ],
      reservas: [],
    });

    expect(c.unidades.find((u) => u.unitId === 'u_min3')?.motivo).toBe('min_noches');
    expect(c.unidades.find((u) => u.unitId === 'u_min1')?.disponible).toBe(true);
    // Hay al menos una unidad vendible: la estancia sigue ofreciéndose.
    expect(c.disponible).toBe(true);
  });

  it('el plan por defecto solo aplica a las unidades que no traen el suyo', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-12', // 2 noches
      unidades: [
        { id: 'u_con_plan', tarifaNoche: 100, moneda: 'MXN', ratePlan: { minNoches: 1 } },
        { id: 'u_sin_plan', tarifaNoche: 100, moneda: 'MXN' },
      ],
      reservas: [],
      ratePlan: { minNoches: 3 },
    });

    expect(c.unidades.find((u) => u.unitId === 'u_con_plan')?.disponible).toBe(true);
    expect(c.unidades.find((u) => u.unitId === 'u_sin_plan')?.motivo).toBe('min_noches');
  });

  it('restriccionesDeRatePlan normaliza el Json de la fila (null y [] = sin regla)', () => {
    expect(restriccionesDeRatePlan(null)).toBeNull();
    expect(restriccionesDeRatePlan(undefined)).toBeNull();
    expect(
      restriccionesDeRatePlan({ minNoches: 2, maxNoches: null, checkInDias: [], checkOutDias: null })
    ).toEqual({ minNoches: 2, maxNoches: null, checkInDias: null, checkOutDias: null });
    expect(
      restriccionesDeRatePlan({ minNoches: null, checkInDias: [5, 6] })
    ).toEqual({ minNoches: 1, maxNoches: null, checkInDias: [5, 6], checkOutDias: null });
    // Un Json con basura no se cuela como regla de días.
    expect(restriccionesDeRatePlan({ checkInDias: 'lunes' })?.checkInDias).toBeNull();
  });

  it('moneda única cuando todas las unidades comparten moneda', () => {
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-11',
      unidades: [
        { id: 'a', tarifaNoche: 100, moneda: 'EUR' },
        { id: 'b', tarifaNoche: 200, moneda: 'EUR' },
      ],
      reservas: [],
    });
    expect(c.moneda).toBe('EUR');
  });

  it('rechaza fechas invertidas o malformadas', () => {
    expect(() => cotizarEstancia({ checkIn: '2026-09-15', checkOut: '2026-09-10', unidades: [], reservas: [] })).toThrow(/Fechas inválidas/);
    expect(() => cotizarEstancia({ checkIn: 'ayer', checkOut: 'mañana', unidades: [], reservas: [] })).toThrow(/Fechas inválidas/);
  });
});

describe('Contratos del flujo común', () => {
  it('el canal del booking engine es "Directa" (reserva indistinguible de una manual)', () => {
    expect(CANAL_BOOKING_ENGINE).toBe('Directa');
  });

  it('la referencia pública sigue el formato BE-…', () => {
    expect(referenciaBookingEngine()).toMatch(/^BE-[A-Z0-9]+$/);
  });

  it('GUARDIA de un solo motor: el booking engine no reimplementa la regla §8', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    // Las DOS piezas del motor fusionado tienen que apoyarse en el mismo
    // Availability Engine central: el motor de reserva directa (canonical) y
    // la tarificación del flujo desplegado (booking-rates.ts). Cada una usa la
    // función que le corresponde del módulo central; ninguna redefine la regla.
    const motor = fs.readFileSync(path.resolve(__dirname, '../lib/hospitality/booking-engine.ts'), 'utf8');
    expect(motor).toContain("from './availability'");
    expect(motor).toMatch(/unitUnavailableOnDay\(|loadAvailabilityContext\(/);

    const tarifas = fs.readFileSync(path.resolve(__dirname, '../lib/hospitality/booking-rates.ts'), 'utf8');
    expect(tarifas).toContain("from './availability'");
    expect(tarifas).toContain('unitAvailability(');

    // …y ninguna redefine la regla de ocupación (ni comparaciones de estancia propias).
    for (const fuente of [motor, tarifas]) {
      expect(fuente).not.toMatch(/checkIn\.getTime\(\)\s*<=/);
      expect(fuente).not.toContain('function unitOccupiedOnDay');
    }
  });
});

describe('cotizarEstancia — estacionalidad del plan (el mismo precio que ve el asistente)', () => {
  // Ventana 10 → 15 sep 2026: noches 10 (jue), 11 (vie), 12 (sáb), 13 (dom) y 14 (lun).
  const conPlan = (estacionalidad: unknown, tarifa = 100) =>
    cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: [{ id: 'u1', tarifaNoche: tarifa, moneda: 'MXN', estacionalidad }],
      reservas: [],
    }).unidades[0];

  it('con temporadas suma noche a noche y devuelve el desglose (no una media)', () => {
    const u = conPlan({ temporadas: [{ desde: '2026-09-12', hasta: '2026-09-14', tarifa: 200 }] });

    // 10 y 11 a la tarifa del plan; 12, 13 y 14 a la de la temporada.
    expect(u.precioTotal).toBe(800);
    expect(u.desgloseNoches).toEqual([
      { fecha: '2026-09-10', tarifa: 100 },
      { fecha: '2026-09-11', tarifa: 100 },
      { fecha: '2026-09-12', tarifa: 200 },
      { fecha: '2026-09-13', tarifa: 200 },
      { fecha: '2026-09-14', tarifa: 200 },
    ]);
  });

  it('sin estacionalidad el precio es plano y no hay desglose que enseñar', () => {
    const u = conPlan(null);
    expect(u.precioTotal).toBe(500);
    expect(u.desgloseNoches).toBeNull();
  });

  it('el recargo de fin de semana solo toca las noches SIN temporada', () => {
    const sin = conPlan({ finDeSemana: { dias: [5, 6], porcentaje: 20 } });
    expect(sin.desgloseNoches?.map((n) => n.tarifa)).toEqual([100, 120, 120, 100, 100]);
    expect(sin.precioTotal).toBe(540);

    // Con una temporada encima del sábado, esa noche vale SU tarifa: un +20 %
    // sobre un precio ya configurado a mano sería un precio que nadie puso.
    const con = conPlan({
      temporadas: [{ desde: '2026-09-12', hasta: '2026-09-12', tarifa: 300 }],
      finDeSemana: { dias: [5, 6], porcentaje: 20 },
    });
    expect(con.desgloseNoches?.map((n) => n.tarifa)).toEqual([100, 120, 300, 100, 100]);
  });

  it('una temporada no vuelve vendible una unidad sin precio base', () => {
    // Misma regla que el asistente: sin tarifa del plan no hay precio del que
    // partir, y una temporada suelta no es una tarifa publicada.
    const u = conPlan({ temporadas: [{ desde: '2026-09-12', hasta: '2026-09-14', tarifa: 200 }] }, 0);
    expect(u.disponible).toBe(false);
    expect(u.motivo).toBe('sin_tarifa');
    expect(u.desgloseNoches).toBeNull();
  });
});

describe('Coherencia con el Availability Engine (caso cruzado)', () => {
  it('cotizar y el motor coinciden día a día en el mismo rango', () => {
    // La unidad está ocupada SOLO la noche del 12 (reserva de 1 noche).
    const r: ActiveReservationSpan = {
      unitId: 'u1',
      checkIn: d(2026, 8, 12),
      checkOut: d(2026, 8, 13),
      estado: 'confirmed',
    };
    const c = cotizarEstancia({
      checkIn: '2026-09-10',
      checkOut: '2026-09-15',
      unidades: unidades(['u1']),
      reservas: [r],
    });
    // El motor dice ocupado el 12…
    expect(unitOccupiedOnDay('u1', d(2026, 8, 12), [r])).toBe(true);
    expect(unitOccupiedOnDay('u1', d(2026, 8, 13), [r])).toBe(false);
    // …y la cotización rechaza la estancia completa por ese día.
    expect(c.unidades[0].disponible).toBe(false);
  });
});
