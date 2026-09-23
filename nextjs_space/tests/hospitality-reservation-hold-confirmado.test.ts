// @vitest-environment node
//
// Guardia de la CONFIRMACIÓN de un hold por el operador
// (PATCH /api/hospitality/reservations/[id]).
//
// Un `pending` que pasa a `confirmed` es la decisión que rescata el hold: es el
// otro desenlace del ciclo que el barrido audita como caducado. Si esa traza no
// se escribiera, la tasa de abandono de Reportes contaría solo los abandonos y
// siempre daría 100% — la métrica miente hacia arriba.
//
// Aquí NO se mockea el módulo de la traza: se ejercita el real contra un
// `prisma.auditLog` mockeado, que es el contrato que le importa a la métrica.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logAuditAction: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
  aplicarPenalizacionNoShow: vi.fn(),
  hospitalityReservation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityProperty: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityUnit: mocks.hospitalityUnit,
    hospitalityProperty: mocks.hospitalityProperty,
    auditLog: mocks.auditLog,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.auth }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: mocks.dispatchConnectivityPush,
}));
vi.mock('@/lib/hospitality/penalizaciones', () => ({
  aplicarPenalizacionNoShow: mocks.aplicarPenalizacionNoShow,
}));

import { PATCH } from '@/app/api/hospitality/reservations/[id]/route';
import { ACCION_AUDIT_HOLD_CONFIRMADO } from '@/lib/hospitality/holds';

const AUTH_OK = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };

function reserva(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res_1',
    unitId: 'unit_1',
    channel: 'airbnb',
    checkIn: new Date('2026-09-20T15:00:00'),
    checkOut: new Date('2026-09-25T11:00:00'),
    estado: 'pending',
    amountAfterTax: 5000,
    currency: 'MXN',
    specialRequests: null,
    propertyId: 'prop_1',
    ...overrides,
  };
}

function patch(body: Record<string, unknown>) {
  const req = new Request('http://test.local/api/hospitality/reservations/res_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(req as never, { params: { id: 'res_1' } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(AUTH_OK);
  mocks.logAuditAction.mockResolvedValue({});
  mocks.dispatchConnectivityPush.mockResolvedValue({ ok: true });
  mocks.auditLog.create.mockResolvedValue({ id: 'audit_1' });
  mocks.hospitalityReservation.findFirst.mockResolvedValue(reserva());
  mocks.hospitalityReservation.update.mockResolvedValue({ ...reserva(), estado: 'confirmed' });
  mocks.hospitalityUnit.findFirst.mockResolvedValue({ id: 'unit_1', propertyId: 'prop_1' });
  mocks.hospitalityProperty.findFirst.mockResolvedValue({ politicaSalidaAnticipada: 'B' });
});

describe('PATCH reserva — hold confirmado por el operador', () => {
  it('confirmar un pending deja la traza del rescate (origen operador)', async () => {
    const res = await patch({ estado: 'confirmed' });
    expect(res.status).toBe(200);

    const { data } = mocks.auditLog.create.mock.calls[0][0];
    expect(data.accion).toBe(ACCION_AUDIT_HOLD_CONFIRMADO);
    expect(data.tenantId).toBe('tenant_a');
    expect(data.entidadId).toBe('res_1');
    expect(data.metadata).toMatchObject({
      reservationId: 'res_1',
      propertyId: 'prop_1',
      channel: 'airbnb',
      origen: 'operador',
    });
  });

  it('editar otros campos NO escribe la traza (no se infla el denominador)', async () => {
    await patch({ notas: 'Llega tarde' });
    expect(mocks.auditLog.create).not.toHaveBeenCalled();
  });

  it('confirmar una reserva que ya estaba confirmada no vuelve a contar', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(reserva({ estado: 'confirmed' }));
    await patch({ estado: 'confirmed' });
    expect(mocks.auditLog.create).not.toHaveBeenCalled();
  });

  it('un estado distinto de confirmed no es un rescate de hold', async () => {
    await patch({ estado: 'checked_in' });
    expect(mocks.auditLog.create).not.toHaveBeenCalled();
  });

  it('si la traza falla, la confirmación sigue en pie (200 y estado guardado)', async () => {
    // La reserva ya se confirmó: no poder auditar no puede revertir la decisión.
    mocks.auditLog.create.mockRejectedValue(new Error('BD caída'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await patch({ estado: 'confirmed' });

    expect(res.status).toBe(200);
    expect(mocks.hospitalityReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'confirmed' }) })
    );
    error.mockRestore();
  });

  it('sin sesión: 401 y sin traza', async () => {
    mocks.auth.mockResolvedValue({ valid: false, error: 'sin sesión' });
    const res = await patch({ estado: 'confirmed' });
    expect(res.status).toBe(401);
    expect(mocks.auditLog.create).not.toHaveBeenCalled();
  });
});
