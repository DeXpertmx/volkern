// @vitest-environment node
//
// Guardia de GET /api/admin/hospitality/holds (métricas por tenant para el
// panel de administración). La ruta solo carga filas y delega el cálculo en el
// módulo puro: estos tests fijan el contrato (auth, ventana, nombres de tenant)
// y que los datos corruptos no rompan la vista.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  prisma: {
    auditLog: { findMany: vi.fn() },
    tenant: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

import { GET } from '@/app/api/admin/hospitality/holds/route';

const DIA = 24 * 60 * 60 * 1000;
const ahora = () => Date.now();
const haceDias = (d: number) => new Date(ahora() - d * DIA);

function filaAudit(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-a',
    metadata: { propertyId: 'prop-1', horasRetencion: 24 },
    fechaCreacion: haceDias(1),
    ...overrides,
  };
}

function pedir(query = '') {
  return GET(new NextRequest(`http://localhost/api/admin/hospitality/holds${query}`));
}

describe('GET /api/admin/hospitality/holds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdminRequest.mockResolvedValue({ ok: true, userId: 'u-1', roleName: 'Superadmin' });
    mocks.prisma.auditLog.findMany.mockResolvedValue([]);
    mocks.prisma.tenant.findMany.mockResolvedValue([]);
  });

  it('sin Superadmin responde 401 y no consulta nada', async () => {
    mocks.isAdminRequest.mockResolvedValue({ ok: false, error: 'Acceso denegado' });

    const res = await pedir();
    expect(res.status).toBe(401);
    expect(mocks.prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('agrega por tenant y pone el nombre de cada uno', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      filaAudit({ tenantId: 'tenant-a', metadata: { propertyId: 'p1', horasRetencion: 24 } }),
      filaAudit({ tenantId: 'tenant-a', metadata: { propertyId: 'p2', horasRetencion: 48 } }),
      filaAudit({ tenantId: 'tenant-b', metadata: { propertyId: 'p1', horasRetencion: 24 } }),
    ]);
    mocks.prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-a', nombre: 'Hotel Sol' },
      { id: 'tenant-b', nombre: 'Loft Centro' },
    ]);

    const res = await pedir();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.total).toBe(3);
    expect(json.ventanaDias).toBe(30);
    expect(json.tenants).toHaveLength(2);
    expect(json.tenants[0]).toMatchObject({
      tenantId: 'tenant-a',
      tenant: 'Hotel Sol',
      caducados: 2,
      propiedadesAfectadas: 2,
      horasRetencionMedia: 36,
    });
    expect(typeof json.tenants[0].ultimoCaducado).toBe('string');
    // Sin nombre en la BD, cae al id (la fila nunca queda sin identificar).
    expect(json.tenants[1].tenant).toBe('Loft Centro');
  });

  it('consulta solo la acción del barrido y la ventana pedida', async () => {
    await pedir('?dias=7');

    const args = mocks.prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.where.accion).toBe('hospitality_hold_expirado');
    const desde: Date = args.where.fechaCreacion.gte;
    expect(Math.abs(desde.getTime() - (ahora() - 7 * DIA))).toBeLessThan(5000);
  });

  it('una ventana inválida cae en el defecto (no rompe ni consulta de más)', async () => {
    const res = await pedir('?dias=9999');
    const json = await res.json();
    expect(json.ventanaDias).toBe(30);
  });

  it('los metadata corruptos cuentan sin propiedad ni ventana, y sin tenant se ignoran', async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([
      filaAudit({ metadata: null }),
      filaAudit({ metadata: 'basura' }),
      filaAudit({ tenantId: null, metadata: { propertyId: 'p1' } }),
    ]);

    const res = await pedir();
    const json = await res.json();

    expect(json.total).toBe(2);
    expect(json.tenants).toHaveLength(1);
    expect(json.tenants[0]).toMatchObject({
      caducados: 2,
      propiedadesAfectadas: 0,
      horasRetencionMedia: null,
    });
    // Los nombres se piden solo para los tenants con actividad (el de tenant
    // nulo no genera fila ni viaja a la consulta de nombres).
    expect(mocks.prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['tenant-a'] } },
      select: { id: true, nombre: true },
    });
  });

  it('sin actividad devuelve un resumen vacío (no un error)', async () => {
    const res = await pedir();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ total: 0, tenants: [], truncado: false });
  });
});
