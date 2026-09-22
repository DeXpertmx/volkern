import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  reservationsOnDay,
  occupancyByDay,
  arrivalsOn,
  departuresOn,
  toIsoDate,
  startOfDay,
  type CalendarReservation,
} from '../lib/hospitality/calendar';

function res(overrides: Partial<CalendarReservation>): CalendarReservation {
  return {
    id: 'r1',
    unitId: 'u1',
    unitNombre: 'Unidad 1',
    propertyId: 'p1',
    channel: 'Airbnb',
    guestName: 'Test',
    email: null,
    phone: null,
    estado: 'confirmed',
    checkIn: new Date('2026-09-10T15:00:00'),
    checkOut: new Date('2026-09-15T11:00:00'),
    nights: 5,
    amountAfterTax: 100,
    currency: 'MXN',
    specialRequests: null,
    externalBookingId: 'AB1',
    ...overrides,
  };
}

describe('buildMonthGrid', () => {
  it('genera semanas completas empezando en lunes', () => {
    // Septiembre 2026: el día 1 es martes → 1 día de relleno (lunes 31 ago)
    const grid = buildMonthGrid(new Date('2026-09-15T12:00:00'));
    expect(grid.days[0].key).toBe('2026-08-31'); // lunes
    expect(grid.days.length % 7).toBe(0);
    // Incluye todos los días de septiembre
    expect(grid.days.some((d) => d.key === '2026-09-01')).toBe(true);
    expect(grid.days.some((d) => d.key === '2026-09-30')).toBe(true);
  });

  it('marca hoy correctamente', () => {
    const grid = buildMonthGrid(new Date('2026-09-09T10:00:00'));
    const today = grid.days.find((d) => d.isToday);
    expect(today?.key).toBe('2026-09-09');
  });
});

describe('reservationsOnDay (regla del plan: checkout no ocupa su día)', () => {
  const r = res({ checkIn: new Date('2026-09-10T15:00:00'), checkOut: new Date('2026-09-15T11:00:00') });

  it('ocupa del check-in al día anterior al check-out', () => {
    expect(reservationsOnDay([r], '2026-09-10').length).toBe(1); // check-in
    expect(reservationsOnDay([r], '2026-09-12').length).toBe(1); // noche media
    expect(reservationsOnDay([r], '2026-09-14').length).toBe(1); // última noche
    expect(reservationsOnDay([r], '2026-09-15').length).toBe(0); // día de checkout
  });

  it('excluye canceladas', () => {
    const cancelled = res({ estado: 'cancelled' });
    expect(reservationsOnDay([cancelled], '2026-09-12').length).toBe(0);
  });

  it('excluye no-shows: la vista Mes es ocupación, y el motor la da por libre', () => {
    // Auditoría del 17 sep 2026: esta vista filtraba solo «no cancelada», así
    // que un no-show pintaba la noche como ocupada mientras el motor de
    // disponibilidad y los canales la vendían. La regla es `aportaProduccion`.
    const noShow = res({ estado: 'no_show' });
    for (const dia of ['2026-09-10', '2026-09-12', '2026-09-14']) {
      expect(reservationsOnDay([noShow], dia).length).toBe(0);
    }
    // El control: una reserva viva sí ocupa esas mismas noches.
    expect(reservationsOnDay([res({ estado: 'checked_in' })], '2026-09-12').length).toBe(1);
  });
});

describe('occupancyByDay', () => {
  it('agrupa reservas por cada día del rango', () => {
    const r = res({ checkIn: new Date('2026-09-10T15:00:00'), checkOut: new Date('2026-09-15T11:00:00') });
    const grid = buildMonthGrid(new Date('2026-09-15T12:00:00'));
    const map = occupancyByDay([r], grid.days);
    expect(map.get('2026-09-10')!.length).toBe(1);
    expect(map.get('2026-09-14')!.length).toBe(1);
    expect(map.get('2026-09-15')!.length).toBe(0);
    // Días fuera de la estancia vacíos
    expect(map.get('2026-09-20')!.length).toBe(0);
  });
});

describe('arrivalsOn / departuresOn', () => {
  const today = '2026-09-09';
  const arriving = res({ checkIn: new Date('2026-09-09T15:00:00'), checkOut: new Date('2026-09-12T11:00:00') });
  const departing = res({ id: 'r2', checkIn: new Date('2026-09-05T15:00:00'), checkOut: new Date('2026-09-09T11:00:00') });

  it('detecta llegadas y salidas del día', () => {
    expect(arrivalsOn([arriving, departing], today).map((x) => x.id)).toEqual(['r1']);
    expect(departuresOn([arriving, departing], today).map((x) => x.id)).toEqual(['r2']);
  });

  it('excluye canceladas', () => {
    const cancelledArrival = res({ estado: 'cancelled', checkIn: new Date('2026-09-09T15:00:00') });
    expect(arrivalsOn([cancelledArrival], today).length).toBe(0);
  });

  it('el no-show sí figura como llegada del día (no ocupa, pero se le esperaba)', () => {
    // Misma definición que los reportes (`llegadas` alimenta la tasa de
    // no-show) y que el panel de operaciones. Es «movimiento», no «ocupación».
    const noShow = res({ estado: 'no_show', checkIn: new Date('2026-09-09T15:00:00') });
    expect(arrivalsOn([noShow], today).length).toBe(1);
    expect(reservationsOnDay([noShow], '2026-09-09').length).toBe(0);
  });

  it('respeta zonas horarias locales (sin desfase UTC)', () => {
    const r = res({ checkIn: new Date(2026, 8, 9, 20, 0), checkOut: new Date(2026, 8, 12, 11, 0) });
    expect(toIsoDate(startOfDay(r.checkIn))).toBe('2026-09-09');
    expect(arrivalsOn([r], today).length).toBe(1);
  });
});