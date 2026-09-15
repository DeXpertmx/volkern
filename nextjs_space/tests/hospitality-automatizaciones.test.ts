import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests de Automatizaciones de Hospitality (plan maestro §22):
 *   - GET/POST /api/hospitality/automatizaciones
 *   - PATCH/DELETE /api/hospitality/automatizaciones/[id]
 *   - POST /api/hospitality/automatizaciones/[id]/test (dispara el engine)
 *   - Emisores de eventos publican en el EventBus con los triggers correctos
 */

const mockAuth = vi.hoisted(() => vi.fn());
const mockProcessEvent = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  automationRule: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  automationLog: { findMany: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));
vi.mock('@/lib/marketing/automation/rule-engine', () => ({
  AutomationRuleEngine: { processEvent: (...a: any[]) => mockProcessEvent(...a) },
}));

import { GET, POST } from '../app/api/hospitality/automatizaciones/route';
import { PATCH, DELETE } from '../app/api/hospitality/automatizaciones/[id]/route';
import { POST as POSTTest } from '../app/api/hospitality/automatizaciones/[id]/test/route';
import { EVENTS } from '../lib/types/events';
import { HOSPITALITY_TRIGGERS } from '../app/api/hospitality/automatizaciones/route';

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } } };

function buildReq(body?: any, url = 'https://volkern.app/api/hospitality/automatizaciones') {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

function makeRegla(overrides: any = {}) {
  return {
    id: 'ar1',
    tenantId: 't1',
    name: 'Crear tarea al reservar',
    description: null,
    triggerType: EVENTS.HOSPITALITY_RESERVATION_CREATED,
    conditions: {},
    actions: [{ type: 'CREATE_HOSPITALITY_TASK', titulo: 'Preparar habitación' }],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GET /api/hospitality/automatizaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('requiere autenticación', async () => {
    mockAuth.mockResolvedValueOnce({ valid: false, error: 'No autorizado' });
    const res = await GET(buildReq());
    expect(res.status).toBe(401);
  });

  it('lista solo reglas de Hospitality del tenant', async () => {
    prisma.automationRule.findMany.mockResolvedValue([makeRegla()]);
    prisma.automationLog.findMany.mockResolvedValue([]);
    const res = await GET(buildReq(undefined, 'https://volkern.app/api/hospitality/automatizaciones?activas=true'));
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.total).toBe(1);
    expect(prisma.automationRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', triggerType: { in: HOSPITALITY_TRIGGERS }, isActive: true }),
      })
    );
  });
});

describe('POST /api/hospitality/automatizaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('valida name, triggerType y acciones', async () => {
    const r1 = await POST(buildReq({ triggerType: EVENTS.HOSPITALITY_RESERVATION_CREATED, actions: [{ type: 'CREATE_HOSPITALITY_TASK' }] }));
    expect(r1.status).toBe(400);

    const r2 = await POST(buildReq({ name: 'X', triggerType: 'evento_inexistente', actions: [{ type: 'CREATE_HOSPITALITY_TASK' }] }));
    expect(r2.status).toBe(400);

    const r3 = await POST(buildReq({ name: 'X', triggerType: EVENTS.HOSPITALITY_RESERVATION_CREATED, actions: [] }));
    expect(r3.status).toBe(400);

    const r4 = await POST(buildReq({ name: 'X', triggerType: EVENTS.HOSPITALITY_RESERVATION_CREATED, actions: [{ type: 'HACK' }] }));
    expect(r4.status).toBe(400);
  });

  it('crea la regla en el tenant', async () => {
    prisma.automationRule.create.mockResolvedValue(makeRegla());
    const res = await POST(
      buildReq({
        name: 'Crear tarea al reservar',
        triggerType: EVENTS.HOSPITALITY_RESERVATION_CREATED,
        actions: [{ type: 'CREATE_HOSPITALITY_TASK', titulo: 'Preparar' }],
      })
    );
    const d = await res.json();
    expect(res.status).toBe(201);
    expect(prisma.automationRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 't1', triggerType: EVENTS.HOSPITALITY_RESERVATION_CREATED, isActive: true }),
      })
    );
  });
});

describe('PATCH/DELETE /api/hospitality/automatizaciones/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('404 si la regla no es de Hospitality o de otro tenant', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(null);
    const res = await PATCH(buildReq({ isActive: false }, 'https://volkern.app/api/hospitality/automatizaciones/otra'), {
      params: Promise.resolve({ id: 'otra' }),
    });
    expect(res.status).toBe(404);
  });

  it('actualiza la regla (activa/inactiva, acciones)', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(makeRegla());
    prisma.automationRule.update.mockResolvedValue(makeRegla({ isActive: false }));
    const res = await PATCH(buildReq({ isActive: false }, 'https://volkern.app/api/hospitality/automatizaciones/ar1'), {
      params: Promise.resolve({ id: 'ar1' }),
    });
    expect(res.status).toBe(200);
    expect(prisma.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
    );
  });

  it('rechaza acciones inválidas en PATCH', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(makeRegla());
    const res = await PATCH(buildReq({ actions: [] }, 'https://volkern.app/api/hospitality/automatizaciones/ar1'), {
      params: Promise.resolve({ id: 'ar1' }),
    });
    expect(res.status).toBe(400);
  });

  it('elimina solo reglas del tenant', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(makeRegla());
    prisma.automationRule.delete.mockResolvedValue({});
    const res = await DELETE(buildReq(undefined, 'https://volkern.app/api/hospitality/automatizaciones/ar1'), {
      params: Promise.resolve({ id: 'ar1' }),
    });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
  });
});

describe('POST /api/hospitality/automatizaciones/[id]/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
  });

  it('404 si la regla no existe en el tenant', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(null);
    const res = await POSTTest(buildReq({}, 'https://volkern.app/api/hospitality/automatizaciones/xx/test'), {
      params: Promise.resolve({ id: 'xx' }),
    });
    expect(res.status).toBe(404);
  });

  it('dispara el engine con la reserva más reciente como contexto', async () => {
    prisma.automationRule.findFirst.mockResolvedValue(makeRegla());
    prisma.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'hres_x',
      propertyId: 'hprop_1',
      unitId: 'hunit_1',
      contactId: null,
      channel: 'Airbnb',
      externalBookingId: 'BK-1',
      estado: 'confirmed',
      checkIn: new Date('2026-10-15T00:00:00Z'),
      checkOut: new Date('2026-10-18T00:00:00Z'),
      guestData: { nombre: 'María García' },
    });
    mockProcessEvent.mockResolvedValue({ matched: 1 });

    const res = await POSTTest(buildReq({}, 'https://volkern.app/api/hospitality/automatizaciones/ar1/test'), {
      params: Promise.resolve({ id: 'ar1' }),
    });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(mockProcessEvent).toHaveBeenCalledWith(
      EVENTS.HOSPITALITY_RESERVATION_CREATED,
      expect.objectContaining({ tenantId: 't1', reservationId: 'hres_x', channel: 'Airbnb' })
    );
  });
});

describe('Triggers de Hospitality en EVENTS', () => {
  it('todos los triggers de la API existen en EVENTS', () => {
    const expected = [
      'HOSPITALITY_RESERVATION_CREATED',
      'HOSPITALITY_RESERVATION_MODIFIED',
      'HOSPITALITY_RESERVATION_CANCELLED',
      'HOSPITALITY_RESERVATION_CHECKED_IN',
      'HOSPITALITY_RESERVATION_CHECKED_OUT',
      'HOSPITALITY_CHECKIN_DUE',
      'HOSPITALITY_CLEANING_COMPLETED',
      'HOSPITALITY_MAINTENANCE_CREATED',
      'HOSPITALITY_MAINTENANCE_COMPLETED',
    ];
    for (const k of expected) {
      expect((EVENTS as Record<string, string>)[k]).toBeTruthy();
    }
    // Y que la lista de triggers coincide con los eventos reales
    for (const t of HOSPITALITY_TRIGGERS) {
      expect(Object.values(EVENTS)).toContain(t);
    }
  });
});