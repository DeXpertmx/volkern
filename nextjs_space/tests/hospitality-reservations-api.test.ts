import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del POST /api/hospitality/reservations (alta manual de reservas):
 * validaciones, prevención de overbooking (§16), creación de contacto CRM
 * y push de disponibilidad.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  hospitalityProperty: { findFirst: vi.fn() },
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityReservation: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  contact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));
vi.mock('@/lib/permissions', async () => ({
  // La ruta comprueba permisos: se conserva el `hasPermission` real y solo se
  // sustituye la auditoría, que es lo que estas pruebas quieren aislar.
  ...(await vi.importActual<typeof import('@/lib/permissions')>('@/lib/permissions')),
  logAuditAction: mockAudit
}));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: mockDispatch,
}));

import { GET, POST } from '../app/api/hospitality/reservations/route';

function buildReq(method: string, body?: any, url = 'https://volkern.app/api/hospitality/reservations') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

const AUTH_OK = { valid: true, tenant: { id: 't1', moneda: 'EUR' }, user: { id: 'u1', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } } };

describe('GET /api/hospitality/reservations (filtros)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await GET(buildReq('GET'));
    expect(res.status).toBe(401);
  });

  it('filtra por estado simple', async () => {
    await GET(buildReq('GET', undefined, 'https://volkern.app/api/hospitality/reservations?estado=confirmed'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.estado).toBe('confirmed');
  });

  it('filtra por varios estados separados por coma', async () => {
    await GET(buildReq('GET', undefined, 'https://volkern.app/api/hospitality/reservations?estado=confirmed,checked_in'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.estado).toEqual({ in: ['confirmed', 'checked_in'] });
  });

  it('búsqueda q filtra por referencia y datos de huésped', async () => {
    await GET(buildReq('GET', undefined, 'https://volkern.app/api/hospitality/reservations?q=AB-123'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalBookingId: expect.objectContaining({ contains: 'AB-123' }) }),
      ])
    );
  });
});

describe('POST /api/hospitality/reservations (alta manual)', () => {
  const PROPERTY = { id: 'p1' };
  const UNIT = { id: 'u1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    mockAudit.mockResolvedValue({});
    mockDispatch.mockResolvedValue({ ok: true });
    prisma.hospitalityProperty.findFirst.mockResolvedValue(PROPERTY);
    prisma.hospitalityUnit.findFirst.mockResolvedValue(UNIT);
    prisma.hospitalityReservation.findMany.mockResolvedValue([]); // sin conflictos
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'c-new' });
    prisma.hospitalityReservation.create.mockResolvedValue({
      id: 'r-new',
      externalBookingId: 'MAN-TEST',
      channel: 'Directa',
      propertyId: 'p1',
      estado: 'confirmed',
    });
  });

  const VALID_BODY = {
    propertyId: 'p1',
    unitId: 'u1',
    huespedNombre: 'Ana Torres',
    huespedEmail: 'ana@example.com',
    canal: 'Directa',
    checkin: '2026-09-20',
    checkout: '2026-09-25',
    importe: 8500,
    moneda: 'MXN',
  };

  it('crea reserva con huésped nuevo (contacto creado en CRM) y dispara push', async () => {
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(201);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nombre: 'Ana Torres', email: 'ana@example.com' }),
      })
    );
    expect(prisma.hospitalityReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          propertyId: 'p1',
          unitId: 'u1',
          estado: 'confirmed',
        }),
      })
    );
    expect(mockDispatch).toHaveBeenCalledWith('t1', 'p1', 'reserva_creada', { skipRates: true });
  });

  it('valida: sin propiedad → 400', async () => {
    const res = await POST(buildReq('POST', { ...VALID_BODY, propertyId: undefined }));
    expect(res.status).toBe(400);
  });

  it('valida: checkout <= checkin → 400', async () => {
    const res = await POST(buildReq('POST', { ...VALID_BODY, checkout: '2026-09-15' }));
    expect(res.status).toBe(400);
  });

  it('valida: propiedad de otro tenant → 404', async () => {
    prisma.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('valida: unidad de otra propiedad → 404', async () => {
    prisma.hospitalityUnit.findFirst.mockResolvedValue(null);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('overbooking: unidad ocupada en el rango → 409 sin crear', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'r-conflict',
        externalBookingId: 'BK-777',
        checkIn: new Date('2026-09-22T15:00:00'),
        checkOut: new Date('2026-09-24T11:00:00'),
        estado: 'confirmed',
      },
    ]);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('Conflicto de disponibilidad');
    expect(prisma.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('checkout el mismo día del conflicto NO es overbooking (checkout no ocupa, §8)', async () => {
    // La reserva existente termina exactamente el día del check-in nuevo.
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'r-back-to-back',
        externalBookingId: 'BK-888',
        checkIn: new Date('2026-09-18T15:00:00'),
        checkOut: new Date('2026-09-20T11:00:00'),
        estado: 'confirmed',
      },
    ]);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(201);
  });

  it('reserva sin unidad no valida overbooking y se crea igual', async () => {
    const res = await POST(buildReq('POST', { ...VALID_BODY, unitId: null }));
    expect(res.status).toBe(201);
    expect(prisma.hospitalityReservation.findMany).not.toHaveBeenCalled();
  });

  it('contacto existente por email se reutiliza, no duplica', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'c-existing' });
    await POST(buildReq('POST', VALID_BODY));
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.hospitalityReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactId: 'c-existing' }),
      })
    );
  });

  describe('divisa de la reserva', () => {
    it('sin moneda explícita se crea en la del tenant, no en la del esquema', async () => {
      const { moneda, ...sinMoneda } = VALID_BODY;
      const res = await POST(buildReq('POST', sinMoneda));
      expect(res.status).toBe(201);

      const data = prisma.hospitalityReservation.create.mock.calls[0][0].data;
      expect(data.currency).toBe('EUR');
    });

    it('la moneda explícita gana sobre la del tenant', async () => {
      await POST(buildReq('POST', { ...VALID_BODY, moneda: 'USD' }));

      const data = prisma.hospitalityReservation.create.mock.calls[0][0].data;
      expect(data.currency).toBe('USD');
    });

    it('sin moneda en el tenant conserva el valor del esquema como última red', async () => {
      // La columna no admite nulos: aquí sí es preferible 'MXN' a una cadena vacía.
      mockAuth.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } } });
      const { moneda, ...sinMoneda } = VALID_BODY;
      await POST(buildReq('POST', sinMoneda));

      const data = prisma.hospitalityReservation.create.mock.calls[0][0].data;
      expect(data.currency).toBe('MXN');
    });
  });
});
