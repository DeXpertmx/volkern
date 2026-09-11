// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ───────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalitySyncLog: { groupBy: vi.fn(), findMany: vi.fn() },
  hospitalityWebhookEvent: { groupBy: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));

const { getServerSession } = await import('next-auth');
const { GET } = await import('@/app/api/admin/conectividad/propiedades/route');

function req(): any {
  return new Request('https://volkern.app/api/admin/conectividad/propiedades');
}

describe('GET /api/admin/conectividad/propiedades (§29 — estado por propiedad)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue({ user: { id: 'u1' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
    mocks.hospitalityProperty.findMany.mockResolvedValue([]);
    mocks.hospitalitySyncLog.groupBy.mockResolvedValue([]);
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([]);
    mocks.hospitalityWebhookEvent.groupBy.mockResolvedValue([]);
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([]);
  });

  it('sin sesión → 401', async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mocks.hospitalityProperty.findMany).not.toHaveBeenCalled();
  });

  it('rol distinto de Superadmin → 403', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Admin' } });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('cruza sync logs y webhooks por hotelCode y arma el estado por propiedad', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Villa Mar Azul',
        tenantId: 't1',
        tenant: { nombre: 'Demo Real Estate' },
        mappings: [{ externalPropertyId: 'villa-mar-azul', estado: 'activo' }],
      },
      {
        id: 'p2',
        nombre: 'Casa Palmeras',
        tenantId: 't1',
        tenant: { nombre: 'Demo Real Estate' },
        mappings: [],
      },
    ]);
    mocks.hospitalitySyncLog.groupBy.mockResolvedValue([{ propertyId: 'p1', _count: { _all: 2 } }]);
    // Orden desc (el más reciente primero), como lo entrega la consulta real.
    mocks.hospitalitySyncLog.findMany.mockResolvedValue([
      { propertyId: 'p1', tipo: 'reconciliacion', estado: 'exito', httpStatus: 200, errorMensaje: null, fechaCreacion: new Date('2026-09-11T10:00:00Z') },
      { propertyId: 'p1', tipo: 'inventory', estado: 'exito', httpStatus: 200, errorMensaje: null, fechaCreacion: new Date('2026-09-11T09:00:00Z') },
      { propertyId: 'p1', tipo: 'rates', estado: 'error', httpStatus: 502, errorMensaje: 'HTTP 502 del proveedor', fechaCreacion: new Date('2026-09-11T08:00:00Z') },
    ]);
    mocks.hospitalityWebhookEvent.groupBy
      .mockResolvedValueOnce([{ hotelCode: 'villa-mar-azul', _count: { _all: 5 } }])
      .mockResolvedValueOnce([{ hotelCode: 'villa-mar-azul', _count: { _all: 1 } }]);
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      {
        hotelCode: 'villa-mar-azul',
        action: 'book',
        channel: 'airbnb',
        estado: 'procesado',
        errorMensaje: null,
        fechaCreacion: new Date('2026-09-11T10:05:00Z'),
      },
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();

    const p1 = body.propiedades.find((p: any) => p.propertyId === 'p1');
    expect(p1.hotelCode).toBe('villa-mar-azul');
    expect(p1.tenant).toBe('Demo Real Estate');
    expect(p1.ultimoWebhook.action).toBe('book');
    expect(p1.ultimoWebhook.channel).toBe('airbnb');
    // El push más reciente de inventory/rates (no la reconciliación).
    expect(p1.ultimoPush.tipo).toBe('inventory');
    expect(p1.ultimoPush.estado).toBe('exito');
    expect(p1.ultimoFetch.tipo).toBe('reconciliacion');
    // Último error: el de rates (502) con su causa real.
    expect(p1.ultimoError.detalle).toBe('HTTP 502 del proveedor');
    expect(p1.contadorErrores).toBe(2);
    expect(p1.webhooksTotales).toBe(5);
    expect(p1.webhooksFallidos).toBe(1);

    const p2 = body.propiedades.find((p: any) => p.propertyId === 'p2');
    expect(p2.hotelCode).toBeNull();
    expect(p2.mappingEstado).toBe('sin_mapping');
    expect(p2.ultimoWebhook).toBeNull();
    expect(p2.contadorErrores).toBe(0);
  });

  it('sin propiedades → lista vacía sin errores', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.propiedades).toEqual([]);
    expect(typeof body.generadoEn).toBe('string');
  });
});
