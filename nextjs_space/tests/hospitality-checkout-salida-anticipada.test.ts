// @vitest-environment node
//
// Guardia de la SALIDA ANTICIPADA (decisión de producto del 18 sep 2026,
// docs/hospitality-estados-auditoria.md §check-out anticipado).
//
// Decisión del Anfitrión: es un APAGADOR por propiedad —
//   A · cerrar_estancia: el check-out pisa el checkOut (acorta la estancia).
//   B · salida_real (defecto): se guarda checkOutReal y la ocupación usa
//       min(checkOut, checkOutReal); checkOut queda para noches vendidas.
//
// La regla de ocupación vive en UN sitio (finEstanciaReal, módulo checkout) y
// la consumen el motor de disponibilidad y la analítica: estos tests exigen
// que las dos coincidan (la misma valla que ya existe para la regla §8) y que
// las dos puertas de check-out (operativa y PATCH manual) apliquen el
// apagador vía datosDeSalida.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  finEstanciaReal,
  datosDeSalida,
  politicaSalidaAnticipadaEfectiva,
  POLITICA_SALIDA_ANTICIPADA_POR_DEFECTO,
} from '../lib/hospitality/checkout';
import { unitOccupiedOnDay } from '../lib/hospitality/availability';
import { coversNight } from '../lib/hospitality/analytics';
import { reservationsOnDay } from '../lib/hospitality/calendar';

const DIA = 86_400_000;
// Estancia prevista: llega día 1 (15:00), sale día 5 (11:00) → 4 noches.
const checkIn = new Date('2026-09-01T15:00:00');
const checkOut = new Date('2026-09-05T11:00:00');
// Sale anticipadamente el día 3 (11:00): las noches del 3 y el 4 quedan libres.
const salidaReal = new Date('2026-09-03T11:00:00');

describe('política de salida anticipada (apagador por propiedad)', () => {
  it('el defecto es B · salida_real', () => {
    expect(POLITICA_SALIDA_ANTICIPADA_POR_DEFECTO).toBe('salida_real');
    expect(politicaSalidaAnticipadaEfectiva(null)).toBe('salida_real');
    expect(politicaSalidaAnticipadaEfectiva('otra_cosa')).toBe('salida_real');
    expect(politicaSalidaAnticipadaEfectiva('cerrar_estancia')).toBe('cerrar_estancia');
  });

  it('finEstanciaReal: sin salida real devuelve la prevista (función inocua)', () => {
    expect(finEstanciaReal(checkOut, null)).toBe(checkOut);
    expect(finEstanciaReal(checkOut, undefined).getTime()).toBe(checkOut.getTime());
  });

  it('finEstanciaReal: con salida anticipada devuelve la real; salida tardía no acorta', () => {
    expect(finEstanciaReal(checkOut, salidaReal).getTime()).toBe(salidaReal.getTime());
    // Un checkOutReal POSTERIOR al previsto (dato raro de un modify) no alarga la estancia.
    expect(finEstanciaReal(checkOut, new Date('2026-09-09T11:00:00')).getTime()).toBe(checkOut.getTime());
  });

  it('A · cerrar_estancia pisa el checkOut al día en curso; salir el día previsto no toca fechas', () => {
    const a = datosDeSalida('cerrar_estancia', {
      checkOutPrevisto: checkOut,
      hoy: new Date('2026-09-03T11:30:00'),
    });
    expect(a.checkOut).toEqual(new Date('2026-09-03T11:00:00'));
    expect(a.checkOutReal).toBeUndefined();

    const aEnDia = datosDeSalida('cerrar_estancia', {
      checkOutPrevisto: checkOut,
      hoy: new Date('2026-09-05T10:00:00'),
    });
    expect(aEnDia).toEqual({});
  });

  it('B · salida_real guarda checkOutReal y no toca el previsto', () => {
    const b = datosDeSalida('salida_real', {
      checkOutPrevisto: checkOut,
      hoy: new Date('2026-09-03T11:30:00'),
    });
    expect(b.checkOutReal).toEqual(new Date('2026-09-03T11:30:00'));
    expect(b.checkOut).toBeUndefined();
  });
});

describe('la ocupación consume la salida real (motor y analítica coinciden)', () => {
  const reserva = {
    unitId: 'u1',
    checkIn,
    checkOut,
    checkOutReal: salidaReal,
    estado: 'checked_out',
  };

  it('motor: la unidad vuelve a estar libre desde la salida real', () => {
    expect(unitOccupiedOnDay('u1', new Date('2026-09-02'), [reserva])).toBe(true);
    expect(unitOccupiedOnDay('u1', new Date('2026-09-03'), [reserva])).toBe(false);
    expect(unitOccupiedOnDay('u1', new Date('2026-09-04'), [reserva])).toBe(false);
  });

  it('la misma reserva ocupa lo mismo para el motor y para la analítica (invariante)', () => {
    for (let d = 0; d < 7; d++) {
      const dia = new Date(checkIn.getTime() + d * DIA);
      const motor = unitOccupiedOnDay('u1', dia, [reserva]);
      const analitica = coversNight(
        { checkIn, checkOut, checkOutReal: salidaReal, estado: 'checked_out' },
        new Date(dia).setHours(0, 0, 0, 0)
      );
      expect(analitica, `día +${d}`).toBe(motor);
    }
  });

  it('sin salida anticipada no cambia nada respecto a la regla §8 clásica', () => {
    const sinSalida = { unitId: 'u1', checkIn, checkOut, estado: 'confirmed' };
    expect(unitOccupiedOnDay('u1', new Date('2026-09-04'), [sinSalida])).toBe(true);
    expect(unitOccupiedOnDay('u1', new Date('2026-09-05'), [sinSalida])).toBe(false);
  });
});

describe('las dos puertas de check-out aplican el apagador', () => {
  // vi.hoisted: la fábrica de vi.mock se eleva por encima de este describe y
  // necesita los mocks ya creados cuando el módulo mockeado se evalúa.
  const mocks = vi.hoisted(() => ({
    findReservation: vi.fn(),
    updateReservation: vi.fn(),
    updateUnit: vi.fn(),
    findCleaning: vi.fn(),
    createCleaning: vi.fn(),
    findProperty: vi.fn(),
    dispatch: vi.fn(),
  }));

  vi.mock('../lib/db', () => ({
    prisma: {
      hospitalityReservation: {
        findFirst: mocks.findReservation,
        update: mocks.updateReservation,
      },
      hospitalityUnit: { update: mocks.updateUnit },
      hospitalityCleaningTask: {
        findFirst: mocks.findCleaning,
        create: mocks.createCleaning,
      },
      hospitalityProperty: { findFirst: mocks.findProperty },
    },
  }));
  vi.mock('../lib/hospitality/sync', () => ({
    dispatchConnectivityPush: mocks.dispatch,
  }));

  // Estancia RELATIVA a hoy (el check-out es «ahora»): prevista para dentro de
  // 4 días, así que un check-out de hoy ES una salida anticipada en ambas políticas.
  const enDias = (n: number) => new Date(Date.now() + n * 86_400_000);
  const RESERVA = {
    id: 'r1',
    tenantId: 't1',
    propertyId: 'p1',
    unitId: 'u1',
    estado: 'checked_in',
    checkIn: enDias(-1),
    checkOut: enDias(4),
    unit: { id: 'u1', nombre: 'Loft Marina' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findReservation.mockResolvedValue(RESERVA);
    mocks.updateReservation.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'r1', ...data })
    );
    mocks.updateUnit.mockResolvedValue({ id: 'u1' });
    mocks.findCleaning.mockResolvedValue(null);
    mocks.createCleaning.mockResolvedValue({ id: 'cleaning-1' });
    mocks.findProperty.mockResolvedValue({ politicaSalidaAnticipada: 'salida_real' });
    mocks.dispatch.mockResolvedValue({ ok: true });
  });

  it('check-out operativo con B: guarda checkOutReal y conserva el checkOut previsto', async () => {
    const { performCheckOperation } = await import('../lib/hospitality/operations');
    const r = await performCheckOperation('t1', 'r1', 'checkout');
    expect(r.ok).toBe(true);
    const data = mocks.updateReservation.mock.calls[0][0].data;
    expect(data.estado).toBe('checked_out');
    expect(data.checkOutReal).toBeInstanceOf(Date);
    expect(data.checkOut).toBeUndefined();
  });

  it('check-out operativo con A: pisa el checkOut y no guarda checkOutReal', async () => {
    mocks.findProperty.mockResolvedValue({ politicaSalidaAnticipada: 'cerrar_estancia' });
    const { performCheckOperation } = await import('../lib/hospitality/operations');
    const r = await performCheckOperation('t1', 'r1', 'checkout');
    expect(r.ok).toBe(true);
    const data = mocks.updateReservation.mock.calls[0][0].data;
    expect(data.checkOut).toBeInstanceOf(Date);
    expect(data.checkOutReal).toBeUndefined();
  });

  it('sin propiedad legible cae en B (el defecto no rompe el flujo)', async () => {
    mocks.findProperty.mockResolvedValue(null);
    const { performCheckOperation } = await import('../lib/hospitality/operations');
    const r = await performCheckOperation('t1', 'r1', 'checkout');
    expect(r.ok).toBe(true);
    const data = mocks.updateReservation.mock.calls[0][0].data;
    expect(data.checkOutReal).toBeInstanceOf(Date);
  });
});

describe('la vista Mes del planning consume el fin real (coherencia motor ↔ planning)', () => {
  // Observación abierta del audit: la vista Mes decidía ocupación con el
  // checkOut previsto. Con salida anticipada B pintaba como ocupadas las
  // noches que el motor ya publicaba como disponibles. Mismo día a día que
  // la guardia motor↔analítica.
  const reserva = {
    id: 'r1',
    unitId: 'u1',
    unitNombre: 'Loft Marina',
    propertyId: 'p1',
    channel: 'Directa',
    guestName: 'Test',
    email: null,
    phone: null,
    estado: 'checked_out',
    checkIn,
    checkOut,
    checkOutReal: salidaReal,
    nights: 4,
    amountAfterTax: 400,
    currency: 'MXN',
    specialRequests: null,
    externalBookingId: 'AB1',
  };

  it('la noche liberada deja de pintarse como ocupada en la vista Mes', () => {
    // Motor: el 2 (última noche usada) ocupa; el 3 y el 4, liberados, no.
    expect(unitOccupiedOnDay('u1', new Date('2026-09-02'), [reserva])).toBe(true);
    expect(unitOccupiedOnDay('u1', new Date('2026-09-03'), [reserva])).toBe(false);
    // Planning (vista Mes): coincide noche a noche con el motor.
    expect(reservationsOnDay([reserva], '2026-09-02').length).toBe(1);
    expect(reservationsOnDay([reserva], '2026-09-03').length).toBe(0);
    expect(reservationsOnDay([reserva], '2026-09-04').length).toBe(0);
  });

  it('sin salida real sigue la regla del plan (checkout no ocupa su día)', () => {
    const sin = { ...reserva, checkOutReal: null };
    expect(reservationsOnDay([sin], '2026-09-04').length).toBe(1);
    expect(reservationsOnDay([sin], '2026-09-05').length).toBe(0);
  });
});
