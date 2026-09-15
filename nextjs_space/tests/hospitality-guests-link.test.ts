import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del endpoint de vinculación manual de huésped → contacto del CRM:
 *   POST /api/hospitality/guests/link  (plan maestro §20)
 *
 * El endpoint NO es lectura pura: actualiza reservas con contactId. Es un POST.
 */

const mockAuth = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  hospitalityReservation: { updateMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));

import { POST } from '../app/api/hospitality/guests/link/route';

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } } };
const CONTACTO = { id: 'c1', nombre: 'María García', email: 'maria@x.com', telefono: '+52' };

function buildReq(body: any, url = 'https://volkern.app/api/hospitality/guests/link') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('POST /api/hospitality/guests/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.contact.findFirst.mockResolvedValue(CONTACTO);
    prisma.hospitalityReservation.updateMany.mockResolvedValue({ count: 2 });
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await POST(buildReq({ guestKey: 'email:x@y.com', contactId: 'c1' }));
    expect(res.status).toBe(401);
  });

  it('valida que guestKey y contactId sean obligatorios', async () => {
    const res = await POST(buildReq({ contactId: 'c1' }));
    expect(res.status).toBe(400);
    const res2 = await POST(buildReq({ guestKey: 'email:x@y.com' }));
    expect(res2.status).toBe(400);
  });

  it('rechaza contacto de otro tenant (aislamiento)', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    const res = await POST(buildReq({ guestKey: 'email:x@y.com', contactId: 'c-otro-tenant' }));
    expect(res.status).toBe(404);
    expect(prisma.contact.findFirst.mock.calls[0][0].where.tenantId).toBe('t1');
  });

  it('rechaza guestKey que ya es contact: (ya vinculado)', async () => {
    const res = await POST(buildReq({ guestKey: 'contact:c1', contactId: 'c2' }));
    expect(res.status).toBe(400);
    expect(prisma.hospitalityReservation.updateMany).not.toHaveBeenCalled();
  });

  it('vincula por email: localiza reservas sin contacto con ese guestData.email', async () => {
    const res = await POST(buildReq({ guestKey: 'email:ana@x.com', contactId: 'c1' }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.vinculadas).toBe(2);
    const where = prisma.hospitalityReservation.updateMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.contactId).toBeNull();
    const data = prisma.hospitalityReservation.updateMany.mock.calls[0][0].data;
    expect(data.contactId).toBe('c1');
    expect(data.guestData.nombre).toBe('María García');
  });

  it('vincula por teléfono', async () => {
    await POST(buildReq({ guestKey: 'phone:+529991234567', contactId: 'c1' }));
    const where = prisma.hospitalityReservation.updateMany.mock.calls[0][0].where;
    expect(where.OR.length).toBeGreaterThanOrEqual(2); // phone y telefono
  });

  it('vincula por anon: (reserva concreta sin datos)', async () => {
    const res = await POST(buildReq({ guestKey: 'anon:r-xyz', contactId: 'c1' }));
    expect(res.status).toBe(200);
    const where = prisma.hospitalityReservation.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe('r-xyz');
  });

  it('guestKey desconocida → 400 sin escribir', async () => {
    const res = await POST(buildReq({ guestKey: 'foo:bar', contactId: 'c1' }));
    expect(res.status).toBe(400);
    expect(prisma.hospitalityReservation.updateMany).not.toHaveBeenCalled();
  });

  it('vincula por reservationIds exactos (sin depender del matching)', async () => {
    const res = await POST(buildReq({
      guestKey: 'name:pedro ruiz',
      contactId: 'c1',
      reservationIds: ['r-a', 'r-b'],
    }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.vinculadas).toBe(2);
    const where = prisma.hospitalityReservation.updateMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ['r-a', 'r-b'] });
    expect(where.tenantId).toBe('t1');
    const data = prisma.hospitalityReservation.updateMany.mock.calls[0][0].data;
    expect(data.contactId).toBe('c1');
    expect(data.guestData.nombre).toBe('María García');
  });

  it('valida que al menos guestKey o reservationIds estén presentes', async () => {
    const res = await POST(buildReq({ contactId: 'c1' }));
    expect(res.status).toBe(400);
    const res2 = await POST(buildReq({ reservationIds: [], contactId: 'c1' }));
    expect(res2.status).toBe(400);
  });
});