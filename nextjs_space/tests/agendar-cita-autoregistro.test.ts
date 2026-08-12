// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  leadCreate: vi.fn(),
  createBooking: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findFirst: mocks.leadFindFirst, create: mocks.leadCreate },
    contact: { findFirst: mocks.contactFindFirst },
  },
}));

// Interceptar solo createBooking del módulo de bookings (el resto se mantiene real)
vi.mock('@/lib/skills/booking-skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/skills/booking-skills')>();
  return { ...actual, createBooking: mocks.createBooking };
});

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { crmIntents } = await import('@/lib/agents/intents/crm-intents');
const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const { skills } = await import('@/lib/skills');

const TENANT = 'tenant-1';
const classifier = new IntentClassifierAgent();
const base = { userId: 'u1', tenantId: TENANT };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. Schema: fecha+hora requeridos, nombre/email opcionales ─────────────

describe('agendar_cita — schema', () => {
  it('exige solo fecha + hora (nombre/email los resuelve el wrapper)', () => {
    const intent = crmIntents.find(i => i.name === 'agendar_cita')!;
    expect(intent.requiredParams).toEqual(['fecha', 'hora']);
    expect(intent.optionalParams).toEqual(expect.arrayContaining(['nombre', 'email', 'telefono']));
  });
});

// ─── 2. Clasificador: agendar por nombre sin email ─────────────────────────

describe('clasificador — agendar cita por nombre sin email', () => {
  it('agenda cita con nombre y sin email → completo (sin pedir email)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda cita con Juan Pérez mañana a las 10am',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('Juan Pérez');
    expect(result.extractedParams.fecha).toBeTruthy();
    expect(result.extractedParams.hora).toBe('10:00');
    expect(result.needsMoreInfo).toBe(false);
    expect(result.missingParams).not.toContain('email');
  });

  it('agenda cita solo con email → completo (el wrapper deriva el nombre)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda una cita con maria@empresa.com para mañana a las 10am',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.email).toBe('maria@empresa.com');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('agendar sin nombre ni email → es agendar_cita (no mis_citas)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda una cita para mañana a las 10am',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.intent).not.toBe('mis_citas');
    expect(result.extractedParams.fecha).toBeTruthy();
    expect(result.extractedParams.hora).toBe('10:00');
  });

  // Regresión: "reunión por Google meet con X" caía al LLM (caído en
  // producción: 402/404/429) y el usuario veía "Lo siento, ocurrió un error".
  it('"crear una reunión por Google meet con X mañana a las 6pm" → agendar_cita determinista', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'Ayúdame a crear una reunión por Google meet con Juan Antonio Moreno mañana a las 6pm',
    });
    expect(result.rawResponse).toBe('[determinista]'); // sin LLM
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('Juan Antonio Moreno');
    expect(result.extractedParams.fecha).toBeTruthy();
    expect(result.extractedParams.hora).toBe('18:00');
    expect(result.extractedParams.tipo).toBe('videollamada');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('"crear una reunión por Zoom con X" → agendar_cita determinista', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea una reunión por Zoom con María García el viernes a las 15:30',
    });
    expect(result.rawResponse).toBe('[determinista]');
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('María García');
    expect(result.extractedParams.tipo).toBe('videollamada');
    expect(result.extractedParams.hora).toBe('15:30');
  });
});

// ─── 3. Wrapper: auto-registro del lead si no está en el CRM ───────────────

describe('create_booking — auto-registro del lead', () => {
  const fecha = '2026-08-12';
  const hora = '10:00';

  it('lead NO existe por nombre → lo crea con email sintético + teléfono y vincula la cita', async () => {
    mocks.leadFindFirst.mockResolvedValue(null); // no hay lead con ese nombre
    mocks.contactFindFirst.mockResolvedValue(null); // ni contacto
    mocks.leadCreate.mockResolvedValue({ id: 'lead-auto-1', email: 'juan.perez@auto.volkern.local' } as any);
    mocks.createBooking.mockResolvedValue({ id: 'cita-1' } as any);

    const result = await (skills as any).create_booking({
      tenantId: TENANT,
      nombre: 'Juan Pérez',
      telefono: '+34600123456',
      fecha,
      hora,
    });

    // Auto-registro: lead creado con email sintético determinista y teléfono
    expect(mocks.leadCreate).toHaveBeenCalledTimes(1);
    expect(mocks.leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          nombre: 'Juan Pérez',
          email: 'juan.perez@auto.volkern.local',
          telefono: '+34600123456',
        }),
      }),
    );
    // La cita se crea contra ese lead (createBooking reutiliza el email)
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        email: 'juan.perez@auto.volkern.local',
        nombre: 'Juan Pérez',
        telefono: '+34600123456',
      }),
    );
    expect(result).toEqual({ id: 'cita-1' });
  });

  it('lead YA existe por nombre → lo reutiliza, no crea duplicado', async () => {
    mocks.leadFindFirst.mockResolvedValue({ id: 'lead-1', nombre: 'Juan Pérez', email: 'juan@x.com' } as any);
    mocks.createBooking.mockResolvedValue({ id: 'cita-1' } as any);

    await (skills as any).create_booking({ tenantId: TENANT, nombre: 'Juan Pérez', fecha, hora });

    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'juan@x.com', nombre: 'Juan Pérez' }),
    );
  });

  it('con email del usuario → no genera sintético, pasa el email tal cual', async () => {
    mocks.leadFindFirst.mockResolvedValue(null); // no existe por nombre
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.createBooking.mockResolvedValue({ id: 'cita-1' } as any);

    await (skills as any).create_booking({
      tenantId: TENANT,
      nombre: 'Juan Pérez',
      email: 'juan@empresa.com',
      fecha,
      hora,
    });

    expect(mocks.leadCreate).not.toHaveBeenCalled(); // createBooking lo crea por email
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'juan@empresa.com', nombre: 'Juan Pérez' }),
    );
  });

  it('solo email (sin nombre) → deriva el nombre del email y crea la cita', async () => {
    mocks.createBooking.mockResolvedValue({ id: 'cita-1' } as any);

    await (skills as any).create_booking({
      tenantId: TENANT,
      email: 'maria.garcia@empresa.com',
      fecha,
      hora,
    });

    expect(mocks.leadCreate).not.toHaveBeenCalled(); // createBooking lo crea por email
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'maria.garcia@empresa.com', nombre: 'maria garcia' }),
    );
  });

  it('sin nombre ni email → error claro (requerido)', async () => {
    await expect(
      (skills as any).create_booking({ tenantId: TENANT, fecha, hora }),
    ).rejects.toThrow(/nombre o email/);
  });

  it('nombre con acentos → email sintético sin acentos', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.leadCreate.mockResolvedValue({ id: 'lead-auto-2' } as any);
    mocks.createBooking.mockResolvedValue({ id: 'cita-2' } as any);

    await (skills as any).create_booking({ tenantId: TENANT, nombre: 'María José Fernández', fecha, hora });

    expect(mocks.leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'maria.jose.fernandez@auto.volkern.local' }),
      }),
    );
  });
});
