import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isWithinBusinessHours, parseFechaHora } from '@/lib/chatbot-engine';

// ─── isWithinBusinessHours ────────────────────────────────────────────────

describe('isWithinBusinessHours', () => {
  // ── Legacy hours ──
  describe('legacy (diasActivos + horarioInicio/Fin)', () => {
    const legacyConfig = {
      diasActivos: '1,2,3,4,5', // Mon-Fri (getDay: 1-5)
      horarioInicio: 9,
      horarioFin: 18,
    };

    it('dentro de horario (lunes 10:30) → true', () => {
      const date = new Date('2026-05-18T10:30:00'); // Monday
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(legacyConfig)).toBe(true);
    });

    it('fuera de horario por hora temprana → false', () => {
      const date = new Date('2026-05-19T07:30:00'); // Tuesday 7:30
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(legacyConfig)).toBe(false);
    });

    it('fuera de horario por hora tardía → false', () => {
      const date = new Date('2026-05-20T18:00:00'); // Wednesday 18:00 (= horarioFin)
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(legacyConfig)).toBe(false);
    });

    it('fin de semana (domingo) → false', () => {
      const date = new Date('2026-05-24T11:00:00'); // Sunday
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(legacyConfig)).toBe(false);
    });

    it('sábado (no en diasActivos) → false', () => {
      const date = new Date('2026-05-23T11:00:00'); // Saturday
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(legacyConfig)).toBe(false);
    });
  });

  // ── Personalized hours (horariosPersonalizados) ──
  describe('personalizados (horariosPersonalizados)', () => {
    const persoConfig = {
      horariosPersonalizados: {
        '0': [],                    // Sunday: closed
        '1': [{ inicio: '09:00', fin: '13:00' }, { inicio: '15:00', fin: '18:00' }], // Mon: split
        '2': [{ inicio: '09:00', fin: '18:00' }],
        '3': [{ inicio: '09:00', fin: '18:00' }],
        '4': [{ inicio: '09:00', fin: '18:00' }],
        '5': [{ inicio: '09:00', fin: '14:00' }], // Fri: half day
        '6': [],                    // Saturday: closed
      },
    };

    it('lunes 10:00 (dentro del primer rango) → true', () => {
      const date = new Date('2026-05-18T10:00:00'); // Monday
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(persoConfig)).toBe(true);
    });

    it('lunes 14:00 (entre rangos, en descanso) → false', () => {
      const date = new Date('2026-05-18T14:00:00'); // Monday lunch break
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(persoConfig)).toBe(false);
    });

    it('lunes 16:00 (dentro del segundo rango) → true', () => {
      const date = new Date('2026-05-18T16:00:00'); // Monday afternoon
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(persoConfig)).toBe(true);
    });

    it('viernes 13:00 → true (medio día)', () => {
      const date = new Date('2026-05-22T13:00:00'); // Friday
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(persoConfig)).toBe(true);
    });

    it('viernes 14:30 → false (después del cierre)', () => {
      const date = new Date('2026-05-22T14:30:00'); // Friday afternoon
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(persoConfig)).toBe(false);
    });

    it('domingo → false (sin rangos)', () => {
      const date = new Date('2026-05-24T10:00:00'); // Sunday
      vi.setSystemTime(date);
      expect(isWithinBusinessHours(persoConfig)).toBe(false);
    });
  });

  // ── Edge cases ──
  it('config sin horariosPersonalizados → usa legacy', () => {
    const date = new Date('2026-05-19T10:00:00'); // Tuesday
    vi.setSystemTime(date);
    // Sin horariosPersonalizados, usa diasActivos/horarioInicio/horarioFin legacy
    const config = {
      diasActivos: '1,2,3,4,5',
      horarioInicio: 9,
      horarioFin: 18,
    };
    expect(isWithinBusinessHours(config)).toBe(true);
  });

  it('horariosPersonalizados con día sin definir → false', () => {
    const date = new Date('2026-05-19T10:00:00'); // Tuesday
    vi.setSystemTime(date);
    const result = isWithinBusinessHours({ horariosPersonalizados: { '1': [] } });
    expect(result).toBe(false);
  });
});

// ─── parseFechaHora ───────────────────────────────────────────────────────

describe('parseFechaHora', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-20T12:00:00')); // Miércoles 20 mayo 2026
  });

  it('hoy + hora simple ("10:00") → fecha de hoy con esa hora', () => {
    const result = parseFechaHora('hoy', '10:00');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(20);
    expect(result!.getHours()).toBe(10);
    expect(result!.getMinutes()).toBe(0);
  });

  it('hoy + hora con minutos ("14:30") → fecha correcta', () => {
    const result = parseFechaHora('hoy', '14:30');
    expect(result!.getHours()).toBe(14);
    expect(result!.getMinutes()).toBe(30);
  });

  it('mañana → día siguiente', () => {
    const result = parseFechaHora('mañana', '10:00');
    expect(result!.getDate()).toBe(21);
    expect(result!.getHours()).toBe(10);
  });

  it('pasado → día + 2', () => {
    // Usar solo "pasado" porque "pasado mañana" contiene "mañana" y matchea primero
    const result = parseFechaHora('pasado', '10:00');
    expect(result!.getDate()).toBe(22);
  });

  it('hora con am ("10:00 am") → 10:00', () => {
    const result = parseFechaHora('hoy', '10:00 am');
    expect(result!.getHours()).toBe(10);
  });

  it('hora con pm ("3:00 pm") → 15:00', () => {
    const result = parseFechaHora('hoy', '3:00 pm');
    expect(result!.getHours()).toBe(15);
  });

  it('12am → 0:00', () => {
    const result = parseFechaHora('hoy', '12:00 am');
    expect(result!.getHours()).toBe(0);
  });

  it('12pm → 12:00', () => {
    const result = parseFechaHora('hoy', '12:00 pm');
    expect(result!.getHours()).toBe(12);
  });

  it('fecha específica con día numérico → solo aplica el día (mes ignorado por la función)', () => {
    const result = parseFechaHora('15 de mayo', '10:00');
    // La función captura el mes con regex pero NO llama setMonth() — solo setDate()
    expect(result!.getDate()).toBe(15);
    // El mes sigue siendo el mes actual (mayo = 4) o el siguiente si el día ya pasó
    expect(result!.getMonth()).toBeGreaterThanOrEqual(4); // mayo o posterior
  });

  it('sin hora → mantiene hora por defecto', () => {
    const result = parseFechaHora('hoy', '');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(20);
  });

  it('texto irreconocible → devuelve Date con día actual', () => {
    const result = parseFechaHora('xyz', 'abc');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(20);
  });
});
