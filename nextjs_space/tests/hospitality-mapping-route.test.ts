// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityProperty: { findFirst: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  connectivityMapping: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  testConnectivityConnection: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/hospitality/connectivity', () => ({
  testConnectivityConnection: mocks.testConnectivityConnection,
}));

const { POST } = await import('@/app/api/hospitality/onboarding/mapping/route');

const CATALOGO = {
  ok: true,
  property: {
    hotel_name: 'Villa Mar Azul',
    rooms: [{ room_id: 'penthouse', room_name: 'Penthouse', rateplans: [{ rateplan_id: 'penthouse-ep' }] }],
  },
};

function reqConBody(body: unknown) {
  return new Request('https://volkern.app/api/hospitality/onboarding/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } });
  mocks.hospitalityProperty.findFirst.mockResolvedValue({ id: 'p1', nombre: 'Villa Mar Azul' });
  mocks.hospitalityUnit.findMany.mockResolvedValue([{ id: 'unit_free', nombre: 'Penthouse' }]);
  mocks.connectivityMapping.findFirst.mockResolvedValue(null);
  mocks.connectivityMapping.findMany.mockResolvedValue([]);
  mocks.connectivityMapping.update.mockResolvedValue({ id: 'map_previo' });
  mocks.connectivityMapping.upsert.mockResolvedValue({ id: 'map_1' });
  mocks.testConnectivityConnection.mockResolvedValue(CATALOGO);
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('POST /api/hospitality/onboarding/mapping', () => {
  it('sin autenticación → 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'API key no proporcionada' });
    const res = await POST(reqConBody({ propertyId: 'p1', hotelCode: 'sandbox-pms', asignaciones: [] }));
    expect(res.status).toBe(401);
  });

  it('guardar los vínculos confirma el vínculo automático como revisado', async () => {
    const res = await POST(
      reqConBody({
        propertyId: 'p1',
        hotelCode: 'sandbox-pms',
        asignaciones: [{ unitId: 'unit_free', roomCode: 'penthouse', rateplanCode: 'penthouse-ep' }],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const upsert = mocks.connectivityMapping.upsert.mock.calls[0][0];
    // El `update` reescribe el metadata: ya no es un vínculo del sistema.
    expect(upsert.update.metadata).toMatchObject({ origen: 'manual', confirmadoPor: 'u1' });
    expect(upsert.update.metadata.confirmadoEn).toBeTruthy();
    expect(upsert.create.metadata).toMatchObject({ origen: 'manual', confirmadoPor: 'u1' });
  });

  it('rechaza una habitación que no existe en el proveedor', async () => {
    const res = await POST(
      reqConBody({
        propertyId: 'p1',
        hotelCode: 'sandbox-pms',
        asignaciones: [{ unitId: 'unit_free', roomCode: 'inventada', rateplanCode: null }],
      })
    );
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.error).toContain('inventada');
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });
});
