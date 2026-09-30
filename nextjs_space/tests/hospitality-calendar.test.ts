import { describe, it, expect } from 'vitest';
import {
  nightsBetween,
  buildDays,
  layoutReservations,
  currentWeekRange,
  channelStyle,
  toIsoDate,
  type CalendarReservation,
} from '@/lib/hospitality/calendar';

function res(overrides: Partial<CalendarReservation>): CalendarReservation {
  return {
    id: 'r1',
    unitId: 'u1',
    unitNombre: 'Suite 1',
    propertyId: 'p1',
    channel: 'airbnb',
    guestName: 'María García',
    email: null,
    phone: null,
    estado: 'confirmed',
    checkIn: new Date('2026-10-10'),
    checkOut: new Date('2026-10-15'),
    nights: 5,
    amountAfterTax: null,
    currency: null,
    specialRequests: null,
    externalBookingId: 'BKG-1',
    ...overrides,
  };
}

describe('Hospitality — lógica del planning calendar', () => {
  describe('nightsBetween (regla de fechas, sección 8)', () => {
    it('check-in 10 / check-out 15 = 5 noches (no ocupa el 15)', () => {
      expect(nightsBetween(new Date('2026-10-10'), new Date('2026-10-15'))).toBe(5);
    });

    it('misma noche: check-in y check-out igual = 0', () => {
      expect(nightsBetween(new Date('2026-10-10'), new Date('2026-10-10'))).toBe(0);
    });

    it('1 noche: check-in 10 / check-out 11', () => {
      expect(nightsBetween(new Date('2026-10-10'), new Date('2026-10-11'))).toBe(1);
    });
  });

  describe('buildDays', () => {
    it('genera columnas inclusive con etiqueta corta y marca fin de semana', () => {
      const days = buildDays(new Date('2026-10-12'), new Date('2026-10-18')); // lun a dom
      expect(days).toHaveLength(7);
      expect(days[0].label).toBe('lun 12');
      expect(days[6].isWeekend).toBe(true);
      expect(days[1].isWeekend).toBe(false);
    });

    it('marca hoy', () => {
      const days = buildDays(new Date('2026-10-12'), new Date('2026-10-12'), new Date('2026-10-12'));
      expect(days[0].isToday).toBe(true);
    });

    it('marca los días anteriores a hoy como pasados (sombras del planning)', () => {
      const days = buildDays(
        new Date('2026-10-11'),
        new Date('2026-10-13'),
        new Date('2026-10-12')
      );
      expect(days[0].isPast).toBe(true);
      expect(days[1].isPast).toBe(false); // hoy
      expect(days[1].isToday).toBe(true);
      expect(days[2].isPast).toBe(false);
    });
  });

  describe('layoutReservations', () => {
    const days = buildDays(new Date('2026-10-12'), new Date('2026-10-18')); // 7 columnas

    it('posiciona una reserva entera dentro del rango con colSpan = noches', () => {
      const r = res({ checkIn: new Date('2026-10-12'), checkOut: new Date('2026-10-15') });
      const layout = layoutReservations([r], days);
      const blocks = layout.get('u1')!;

      expect(blocks).toHaveLength(1);
      expect(blocks[0].startCol).toBe(0);
      expect(blocks[0].colSpan).toBe(3); // 12, 13, 14
      expect(blocks[0].totalNights).toBe(3);
      expect(blocks[0].continuesLeft).toBe(false);
      expect(blocks[0].continuesRight).toBe(false);
    });

    it('estancia que EMPIEZA antes del rango visible: recorta por la izquierda', () => {
      const r = res({ checkIn: new Date('2026-10-10'), checkOut: new Date('2026-10-15') });
      const layout = layoutReservations([r], days);
      const block = layout.get('u1')![0];

      expect(block.startCol).toBe(0);
      expect(block.colSpan).toBe(3); // 12,13,14 visibles
      expect(block.totalNights).toBe(5);
      expect(block.continuesLeft).toBe(true);
    });

    it('estancia que TERMINA después del rango: recorta por la derecha', () => {
      const r = res({ checkIn: new Date('2026-10-15'), checkOut: new Date('2026-10-22') });
      const layout = layoutReservations([r], days);
      const block = layout.get('u1')![0];

      expect(block.startCol).toBe(3); // día 15
      expect(block.colSpan).toBe(4); // 15,16,17,18
      expect(block.totalNights).toBe(7);
      expect(block.continuesRight).toBe(true);
    });

    it('reserva completamente fuera del rango no aparece', () => {
      const before = res({ checkIn: new Date('2026-10-01'), checkOut: new Date('2026-10-05') });
      const after = res({ checkIn: new Date('2026-11-01'), checkOut: new Date('2026-11-05') });
      const layout = layoutReservations([before, after], days);

      expect(layout.get('u1') || []).toHaveLength(0);
    });

    it('agrupa por unidad y una reserva sin unidad no se posiciona', () => {
      const a = res({ id: 'a', checkIn: new Date('2026-10-12'), checkOut: new Date('2026-10-13') });
      const noUnit = res({ id: 'b', unitId: null, checkIn: new Date('2026-10-12'), checkOut: new Date('2026-10-13') });
      const layout = layoutReservations([a, noUnit], days);

      expect(layout.get('u1')).toHaveLength(1);
      expect(layout.has('null')).toBe(false);
    });

    it('dos reservas en unidades distintas van a filas distintas', () => {
      const a = res({ unitId: 'u1', checkIn: new Date('2026-10-12'), checkOut: new Date('2026-10-14') });
      const b = res({ id: 'b', unitId: 'u2', checkIn: new Date('2026-10-12'), checkOut: new Date('2026-10-14') });
      const layout = layoutReservations([a, b], days);

      expect(layout.get('u1')).toHaveLength(1);
      expect(layout.get('u2')).toHaveLength(1);
    });
  });

  describe('currentWeekRange', () => {
    it('devuelve lunes a domingo de la semana del día dado', () => {
      const { start, end } = currentWeekRange(new Date('2026-10-14')); // miércoles
      expect(toIsoDate(start)).toBe('2026-10-12'); // lunes
      expect(toIsoDate(end)).toBe('2026-10-18'); // domingo
    });
  });

  describe('channelStyle', () => {
    it('identifica Airbnb, Booking, directa y fallback genérico', () => {
      expect(channelStyle('airbnb').label).toBe('Airbnb');
      expect(channelStyle('booking.com').label).toBe('Booking.com');
      expect(channelStyle('direct').label).toBe('Directa');
      expect(channelStyle('otro-canal').label).toBe('otro-canal');
    });
  });
});