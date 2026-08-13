// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  leadCreate: vi.fn(),
  createBooking: vi.fn(),
  userFindMany: vi.fn(),
  configFindUnique: vi.fn(),
  gcalFindFirst: vi.fn(),
  citaUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findFirst: mocks.leadFindFirst, create: mocks.leadCreate },
    contact: { findFirst: mocks.contactFindFirst },
    user: { findMany: mocks.userFindMany },
    configuracion: { findUnique: mocks.configFindUnique },
    googleCalendarIntegration: { findFirst: mocks.gcalFindFirst },
    cita: { update: mocks.citaUpdate },
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
  // Defaults: sin usuario con timezone y sin integración de Google Calendar
  mocks.userFindMany.mockResolvedValue([]);
  mocks.configFindUnique.mockResolvedValue(null);
  mocks.gcalFindFirst.mockResolvedValue(null);
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

  it('normaliza el mensaje interno de continuación sin contaminar el nombre con fecha o tipo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'Agendar una cita con Alejandra Velázquez el 2026-08-14 a las 16:00 por videollamada con email alevvalverde@gmail.com teléfono +34664702631',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('Alejandra Velázquez');
    expect(result.extractedParams.email).toBe('alevvalverde@gmail.com');
    expect(result.extractedParams.telefono).toContain('34664702631');
    expect(result.extractedParams.fecha).toBe('2026-08-14');
    expect(result.extractedParams.hora).toBe('16:00');
  });

  it('multi-turno determinista conserva registrarContacto/email/telefono/empresa del contexto', async () => {
    // Reproduce el bucle: tras confirmar y aportar datos, la ruta determinista
    // volvía a preguntar la confirmación porque se perdía registrarContacto.
    const result = await classifier.classify({
      ...base,
      message: 'Agendar una cita con Alejandra Velázquez el 2026-08-14 a las 16:00 por videollamada',
      pendingIntent: 'agendar_cita',
      collectedEntities: {
        nombre: 'Alejandra Velázquez',
        fecha: '2026-08-14',
        hora: '16:00',
        tipo: 'videollamada',
        email: 'alevvalverde@gmail.com',
        telefono: '+34664702631',
        empresa: 'ARA Works',
        registrarContacto: 'true',
      },
      missingEntities: [],
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.rawResponse).toBe('[determinista]');
    expect(result.extractedParams.registrarContacto).toBe('true');
    expect(result.extractedParams.email).toBe('alevvalverde@gmail.com');
    expect(result.extractedParams.telefono).toContain('34664702631');
    expect(result.extractedParams.empresa).toBe('ARA Works');
    expect(result.extractedParams.nombre).toBe('Alejandra Velázquez');
    expect(result.needsMoreInfo).toBe(false);
  });
});

// ─── 3. Wrapper: auto-registro del lead si no está en el CRM ───────────────

describe('create_booking — auto-registro del lead', () => {
  const fecha = '2026-08-12';
  const hora = '10:00';

  it('lead NO existe sin email real → no inventa datos ni crea lead/cita', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);

    await expect((skills as any).create_booking({
      tenantId: TENANT,
      nombre: 'Juan Pérez',
      telefono: '+34600123456',
      fecha,
      hora,
      registrarContacto: 'true',
    })).rejects.toThrow(/email real|No voy a inventar/i);

    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.createBooking).not.toHaveBeenCalled();
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

  it('con email real y confirmación → crea el lead con los datos aportados', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.leadCreate.mockResolvedValue({ id: 'lead-real-1', email: 'juan@empresa.com' } as any);
    mocks.createBooking.mockResolvedValue({ id: 'cita-1' } as any);

    await (skills as any).create_booking({
      tenantId: TENANT,
      nombre: 'Juan Pérez',
      email: 'juan@empresa.com',
      telefono: '+34600123456',
      empresa: 'Empresa Real',
      fecha,
      hora,
      registrarContacto: 'true',
    });

    expect(mocks.leadCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        nombre: 'Juan Pérez',
        email: 'juan@empresa.com',
        telefono: '+34600123456',
        empresa: 'Empresa Real',
      }),
    }));
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
      registrarContacto: 'true',
    });

    mocks.leadCreate.mockResolvedValue({ id: 'lead-email-1', email: 'maria.garcia@empresa.com' } as any);
    expect(mocks.leadCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'maria.garcia@empresa.com' }),
    }));
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'maria.garcia@empresa.com', nombre: 'maria garcia' }),
    );
  });

  it('sin nombre ni email → error claro (requerido)', async () => {
    await expect(
      (skills as any).create_booking({ tenantId: TENANT, fecha, hora }),
    ).rejects.toThrow(/nombre o email/);
  });

  it('lead NO existe y SIN confirmación → NO auto-registra, pide confirmar', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);

    await expect(
      (skills as any).create_booking({ tenantId: TENANT, nombre: 'Nueva Persona', fecha, hora }),
    ).rejects.toThrow(/Confirma|no está registrada/i);

    expect(mocks.leadCreate).not.toHaveBeenCalled();
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it('nombre con acentos + email real → conserva el nombre y email sin inventar', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.leadCreate.mockResolvedValue({ id: 'lead-real-2' } as any);
    mocks.createBooking.mockResolvedValue({ id: 'cita-2' } as any);

    await (skills as any).create_booking({
      tenantId: TENANT,
      nombre: 'María José Fernández',
      email: 'maria.fernandez@empresa.es',
      fecha,
      hora,
      registrarContacto: 'true',
    });

    expect(mocks.leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'maria.fernandez@empresa.es' }),
      }),
    );
  });
});

// ─── 4. Sincronización con Google Calendar + zona horaria ─────────────────

describe('create_booking — Google Calendar + timezone', () => {
  const fecha = '2026-08-13';
  const hora = '18:00';

  it('con integración activa y tipo videollamada → crea evento en Google Calendar con Meet y actualiza la cita', async () => {
    mocks.leadFindFirst.mockResolvedValue({ id: 'lead-1', nombre: 'Juan Pérez', email: 'juan@x.com' } as any);
    mocks.userFindMany.mockResolvedValue([{ timezone: 'Europe/Madrid' }] as any);
    mocks.gcalFindFirst.mockResolvedValue({ userId: 'gcal-user', calendarId: 'primary' } as any);
    mocks.createBooking.mockResolvedValue({
      id: 'cita-1',
      cita: {
        id: 'cita-1',
        titulo: 'Cita de Seguimiento',
        descripcion: 'Tipo: videollamada',
        fechaHora: new Date('2026-08-13T16:00:00.000Z'),
        duracion: 30,
        linkReunion: null,
        ubicacion: null,
      },
      lead: { id: 'lead-1', nombre: 'Juan Pérez', email: 'juan@x.com' },
    } as any);

    // Mock de createCalendarEvent
    const createCalendarEventMock = vi.fn().mockResolvedValue({
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
    });
    vi.doMock('@/lib/google-calendar', () => ({
      createCalendarEvent: createCalendarEventMock,
    }));
    const { skills: skillsReloaded } = await import('@/lib/skills');

    await (skillsReloaded as any).create_booking({
      tenantId: TENANT,
      nombre: 'Juan Pérez',
      fecha,
      hora,
      tipo: 'videollamada',
    });

    // Buscó la integración activa del tenant
    expect(mocks.gcalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, activo: true } }),
    );
    // Creó el evento en Google Calendar con Meet
    expect(createCalendarEventMock).toHaveBeenCalledWith(
      'gcal-user',
      expect.objectContaining({
        id: 'cita-1',
        generarMeet: true,
        targetCalendarId: 'primary',
        leadEmail: 'juan@x.com',
      }),
    );
    // Actualizó la cita con el link real de Meet
    expect(mocks.citaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cita-1' },
        data: expect.objectContaining({ linkReunion: 'https://meet.google.com/abc-defg-hij' }),
      }),
    );
  });

  it('sin integración activa → no llama a Google Calendar y no falla', async () => {
    mocks.leadFindFirst.mockResolvedValue({ id: 'lead-1', nombre: 'Juan Pérez', email: 'juan@x.com' } as any);
    mocks.gcalFindFirst.mockResolvedValue(null);
    mocks.createBooking.mockResolvedValue({ id: 'cita-1', cita: { id: 'cita-1' } } as any);

    const result = await (skills as any).create_booking({
      tenantId: TENANT,
      nombre: 'Juan Pérez',
      fecha,
      hora,
    });

    expect(mocks.gcalFindFirst).toHaveBeenCalled();
    expect(mocks.citaUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'cita-1', cita: { id: 'cita-1' } });
  });

  it('usa la timezone del usuario del tenant para construir la fecha (18:00 Madrid = 16:00 UTC)', async () => {
    mocks.leadFindFirst.mockResolvedValue({ id: 'lead-1', nombre: 'Juan Pérez', email: 'juan@x.com' } as any);
    mocks.userFindMany.mockResolvedValue([{ timezone: 'Europe/Madrid' }] as any);
    mocks.createBooking.mockResolvedValue({ id: 'cita-1', cita: { id: 'cita-1' } } as any);

    await (skills as any).create_booking({ tenantId: TENANT, nombre: 'Juan Pérez', fecha, hora });

    // 18:00 en Europe/Madrid (agosto, UTC+2) == 16:00 UTC
    const callArgs = mocks.createBooking.mock.calls[0][0];
    expect(callArgs.fechaHora.toISOString()).toBe('2026-08-13T16:00:00.000Z');
  });
});
