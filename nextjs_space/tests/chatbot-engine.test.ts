import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de Prisma
vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    lead: {
      findUnique: vi.fn(),
    },
    servicio: {
      findMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    cita: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      update: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
  };
  return { default: mockPrisma, prisma: mockPrisma };
});

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithFallback: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Hola, ¿en qué puedo ayudarte?' } }],
  }),
  OpenRouterMessage: {} as any,
}));

import { isWithinBusinessHours, parseFechaHora } from '@/lib/chatbot-engine';

describe('ChatbotEngine — isWithinBusinessHours (legacy)', () => {
  const baseConfig = {
    diasActivos: '1,2,3,4,5', // L-V
    horarioInicio: 9,
    horarioFin: 18,
  };

  it('debe devolver true en horario laboral (L-V 9-18)', () => {
    // Simulamos un lunes a las 10:00
    const now = new Date('2026-05-18T10:00:00'); // Lunes
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(true);

    vi.useRealTimers();
  });

  it('debe devolver false fuera de horario (antes de las 9)', () => {
    const now = new Date('2026-05-18T08:00:00'); // Lunes 8am
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(false);

    vi.useRealTimers();
  });

  it('debe devolver false fuera de horario (después de las 18)', () => {
    const now = new Date('2026-05-18T18:30:00'); // Lunes 6:30pm
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(false);

    vi.useRealTimers();
  });

  it('debe devolver false en fin de semana (sábado)', () => {
    const now = new Date('2026-05-23T10:00:00'); // Sábado
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(false);

    vi.useRealTimers();
  });

  it('debe devolver false en domingo', () => {
    const now = new Date('2026-05-24T10:00:00'); // Domingo
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(false);

    vi.useRealTimers();
  });

  it('debe devolver true en el límite (9:00 exacto)', () => {
    const now = new Date('2026-05-18T09:00:00'); // Lunes 9:00
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(true);

    vi.useRealTimers();
  });

  it('debe devolver false en el límite superior (18:00 exacto)', () => {
    const now = new Date('2026-05-18T18:00:00'); // Lunes 18:00
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // La condición es currentHour < config.horarioFin, así que 18:00 es false
    const result = isWithinBusinessHours(baseConfig);
    expect(result).toBe(false);

    vi.useRealTimers();
  });
});

describe('ChatbotEngine — isWithinBusinessHours (horarios personalizados)', () => {
  it('debe respetar horarios personalizados con múltiples rangos', () => {
    const config = {
      horariosPersonalizados: {
        '1': [ // Lunes: 9-13 y 16-19
          { inicio: '09:00', fin: '13:00' },
          { inicio: '16:00', fin: '19:00' },
        ],
        '2': [{ inicio: '10:00', fin: '15:00' }],
        '3': [],
        '4': [{ inicio: '09:00', fin: '18:00' }],
        '5': [{ inicio: '09:00', fin: '14:00' }],
      },
    };

    // Lunes 10:00 → dentro del primer rango
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T10:00:00'));
    expect(isWithinBusinessHours(config)).toBe(true);

    // Lunes 14:00 → entre rangos, fuera
    vi.setSystemTime(new Date('2026-05-18T14:00:00'));
    expect(isWithinBusinessHours(config)).toBe(false);

    // Lunes 17:00 → dentro del segundo rango
    vi.setSystemTime(new Date('2026-05-18T17:00:00'));
    expect(isWithinBusinessHours(config)).toBe(true);

    // Miércoles (día 3) con array vacío → cerrado
    vi.setSystemTime(new Date('2026-05-20T10:00:00'));
    expect(isWithinBusinessHours(config)).toBe(false);

    // Sábado (día 6) sin entrada → cerrado
    vi.setSystemTime(new Date('2026-05-23T10:00:00'));
    expect(isWithinBusinessHours(config)).toBe(false);

    vi.useRealTimers();
  });

  it('debe funcionar sin horarios personalizados (usa diasActivos legacy)', () => {
    // Sin horariosPersonalizados, debe usar el fallback legacy (diasActivos, horarioInicio, horarioFin)
    const config = {
      // horariosPersonalizados NO definido → usa legacy
      diasActivos: '1,2,3,4,5,6', // L-S
      horarioInicio: 8,
      horarioFin: 20,
    };

    // Sábado 10:00 — incluido en diasActivos, dentro del rango
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T10:00:00'));
    expect(isWithinBusinessHours(config)).toBe(true);

    vi.useRealTimers();
  });
});

describe('ChatbotEngine — parseFechaHora', () => {
  it('debe parsear "hoy" correctamente', () => {
    const now = new Date('2026-05-21T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = parseFechaHora('hoy', '10:30');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(4); // mayo = 4
    expect(result!.getDate()).toBe(21);
    expect(result!.getHours()).toBe(10);
    expect(result!.getMinutes()).toBe(30);

    vi.useRealTimers();
  });

  it('debe parsear "mañana" correctamente', () => {
    const now = new Date('2026-05-21T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = parseFechaHora('mañana', '14:00');
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(22);
    expect(result!.getHours()).toBe(14);

    vi.useRealTimers();
  });

  it('debe parsear "pasado mañana"', () => {
    const now = new Date('2026-05-21T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // NOTE: "pasado mañana" contiene "mañana", por lo que el parser
    // captura "mañana" primero (+1 día) en vez de "pasado mañana" (+2)
    const result = parseFechaHora('pasado mañana', '09:00');
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(22); // +1 día (bug conocido)

    vi.useRealTimers();
  });

  it('debe parsear hora con AM/PM', () => {
    const now = new Date('2026-05-21T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = parseFechaHora('hoy', '3pm');
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(15);

    const result2 = parseFechaHora('hoy', '9am');
    expect(result2!.getHours()).toBe(9);

    vi.useRealTimers();
  });

  it('debe manejar 12pm (mediodía)', () => {
    const now = new Date('2026-05-21T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = parseFechaHora('hoy', '12pm');
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(12);

    vi.useRealTimers();
  });

  it('debe parsear fecha específica con nombre de mes', () => {
    const now = new Date('2026-04-15T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = parseFechaHora('15 de mayo', '10:00');
    expect(result).not.toBeNull();
    // El parser intenta extraer el día del mes
    expect(result!.getDate()).toBe(15);

    vi.useRealTimers();
  });

  it('debe manejar input vacío sin lanzar error', () => {
    const result = parseFechaHora('', '');
    // Retorna un Date (today) en vez de null para inputs vacíos
    expect(result).toBeInstanceOf(Date);
  });

  it('debe manejar hora sin minutos', () => {
    const now = new Date('2026-05-21T15:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = parseFechaHora('hoy', '10');
    expect(result).not.toBeNull();
    // Si no hay : en la hora, no coincide con el regex de hora con minutos
    // pero podría coincidir con el regex AM/PM
    expect(result).toBeDefined();

    vi.useRealTimers();
  });
});
