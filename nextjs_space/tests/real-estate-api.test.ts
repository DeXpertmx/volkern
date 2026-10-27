/**
 * Tests de Integración — Real Estate API
 *
 * Verifica los endpoints de dashboard-stats, franchise overview,
 * franchise commissions con mocks de Prisma y withTenantAuth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  catalogoItem: { count: vi.fn(), findMany: vi.fn() },
  lead: { count: vi.fn(), findMany: vi.fn() },
  cita: { count: vi.fn() },
  comision: { findMany: vi.fn(), aggregate: vi.fn() },
  deal: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  tenant: { findMany: vi.fn(), findUnique: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));

// La tabla `Tenant` vive en el control plane: la leen `oficinasDeFranquicia`
// (hijas por `parentId`) y `enCadaConexion` (la conexión de cada id).
const mockGlobalPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  globalPrisma: mockGlobalPrisma,
  getTenantDb: vi.fn().mockResolvedValue({}),
  dbContext: { run: vi.fn((_ctx: any, cb: () => any) => cb()) },
  getCurrentTenantId: vi.fn().mockReturnValue('test-tenant-id'),
}));

/**
 * Simula la lectura del control plane: primero las oficinas de la matriz (por
 * `parentId`) y después la conexión de los ids a consultar. Sin `dbUrl`, todo
 * comparte la base global, que es como nacen las oficinas (`SlotManager`).
 */
function simularFranquicia(
  oficinas: Array<{ id: string; nombre: string; moneda?: string; dbUrl?: string | null }> = [],
) {
  const porId = new Map(oficinas.map((o) => [o.id, o]));
  mockGlobalPrisma.tenant.findMany.mockImplementation(async (args: any) => {
    if (args?.where?.parentId) {
      return oficinas.map((o) => ({ id: o.id, nombre: o.nombre, moneda: o.moneda ?? 'EUR' }));
    }
    const ids: string[] = args?.where?.id?.in ?? [];
    return ids.map((id) => ({ id, dbUrl: porId.get(id)?.dbUrl ?? null }));
  });
}

// Mock withTenantAuth
vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: {
          id: 'test-tenant-id',
          nombre: 'Franquicia Central',
          slug: 'franquicia-master',
          plan: 'pro',
          accountType: 'AGENCY',
          moneda: 'EUR',
        },
        user: { id: 'test-user-id', name: 'Admin', email: 'admin@test.com' },
      };
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

vi.mock('@/lib/real-estate/property-helpers', () => ({
  getPropertyStats: vi.fn(),
  parseInmueble: vi.fn().mockReturnValue({
    propertyType: 'Casa',
    operationType: 'venta',
    precioBase: 250000,
    city: 'Madrid',
    bedrooms: 3,
    bathrooms: 2,
    areaM2: 120,
    hasPool: false,
    hasParking: true,
    hasElevator: true,
    hasGarden: false,
  }),
}));

vi.mock('@/lib/real-estate/commission-calculator', () => ({
  getFranchiseGlobalStats: vi.fn(),
  getFranchiseCommissionSummary: vi.fn(),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET as StatsGET } from '@/app/api/real-estate/dashboard-stats/route';
import { GET as OverviewGET } from '@/app/api/real-estate/franchise/overview/route';
import { GET as CommissionsGET } from '@/app/api/real-estate/franchise/commissions/route';
import { getPropertyStats } from '@/lib/real-estate/property-helpers';
import { getFranchiseGlobalStats, getFranchiseCommissionSummary } from '@/lib/real-estate/commission-calculator';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(url: string): Request {
  return new Request(url);
}

// ─── GET /api/real-estate/dashboard-stats ─────────────────────────────────

describe('GET /api/real-estate/dashboard-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe recibir auth context de withTenantAuth', async () => {
    // Verifica que el endpoint está envuelto con withTenantAuth
    // (el mock de withTenantAuth pasa un auth válido y ejecuta el handler)
    const res = await StatsGET(mockRequest('https://volkern.app/api/real-estate/dashboard-stats'));
    // Con auth mock válido pero sin datos mockeados, el handler falla en getPropertyStats
    expect(res.status).toBe(500);
  });

  it('debe retornar estadísticas completas del dashboard', async () => {
    const { globalPrisma } = await import('@/lib/db');
    (globalPrisma.tenant.findUnique as any).mockResolvedValue({ id: 'test-tenant-id', parentId: null });

    (getPropertyStats as any).mockResolvedValue({
      total: 50,
      available: 30,
      reserved: 5,
      sold: 10,
      rented: 5,
      featured: 8,
      avgPrice: 250000,
      avgPricePerM2: 2100,
    });

    mockPrisma.lead.count.mockResolvedValueOnce(12)  // leads this month
      .mockResolvedValueOnce(45);                     // total leads

    mockPrisma.cita.count.mockResolvedValueOnce(3)   // visits pending
      .mockResolvedValueOnce(15);                     // visits completed

    mockPrisma.catalogoItem.findMany.mockResolvedValue([
      {
        id: 'inm-1',
        nombre: 'Ático Centro',
        precioBase: 350000,
        customFieldValues: { zona: 'Madrid Centro', tipo_operacion: 'venta' },
        media: [{ url: 'https://cdn.example.com/img1.jpg', tipo: 'imagen' }],
        fechaCreacion: new Date('2026-06-01'),
      },
      {
        id: 'inm-2',
        nombre: 'Piso Barcelona',
        precioBase: 280000,
        customFieldValues: { zona: 'Barcelona Gracia', tipo_operacion: 'venta' },
        media: [],
        fechaCreacion: new Date('2026-05-15'),
      },
      {
        id: 'inm-3',
        nombre: 'Alquiler Playa',
        precioBase: 1200,
        customFieldValues: { ciudad: 'Valencia', tipo_operacion: 'alquiler' },
        media: [],
        fechaCreacion: new Date('2026-06-10'),
      },
    ]);

    // $queryRawUnsafe ya no se usa — todo se hace con findMany + JS group

    const res = await StatsGET(mockRequest('https://volkern.app/api/real-estate/dashboard-stats'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.stats.total).toBe(50);
    expect(json.stats.avgPrice).toBe(250000);
    expect(json.leads.thisMonth).toBe(12);
    expect(json.visits.pending).toBe(3);
    expect(json.recentProperties).toHaveLength(3);
    expect(json.recentProperties[0].nombre).toBe('Ático Centro');
    expect(json.distribution.byOperation).toHaveLength(2);
    expect(json.distribution.byCity).toHaveLength(3);
  });

  it('debe retornar 500 si getPropertyStats falla', async () => {
    const { globalPrisma } = await import('@/lib/db');
    (globalPrisma.tenant.findUnique as any).mockResolvedValue({ id: 'test-tenant-id', parentId: null });
    (getPropertyStats as any).mockRejectedValueOnce(new Error('DB error'));

    const res = await StatsGET(mockRequest('https://volkern.app/api/real-estate/dashboard-stats'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Error al obtener estadísticas');
  });
});

// ─── GET /api/real-estate/franchise/overview ──────────────────────────────

describe('GET /api/real-estate/franchise/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simularFranquicia();
  });

  it('debe retornar overview completo de la franquicia', async () => {
    (getFranchiseGlobalStats as any).mockResolvedValue({
      totalProperties: 120,
      totalDeals: 45,
      totalLeads: 200,
      totalComisiones: 85000,
      totalComisionesCount: 30,
      childTenants: [
        { id: 'child-1', nombre: 'Oficina Norte', moneda: 'EUR' },
        { id: 'child-2', nombre: 'Oficina Sur', moneda: 'EUR' },
      ],
    });

    (getFranchiseCommissionSummary as any).mockResolvedValue([
      {
        tenantId: 'test-tenant-id',
        tenantNombre: 'Central',
        totalComisiones: 50000,
        pendientes: 20000,
        pagadas: 30000,
        moneda: 'EUR',
        desglose: [],
      },
      {
        tenantId: 'child-1',
        tenantNombre: 'Oficina Norte',
        totalComisiones: 20000,
        pendientes: 5000,
        pagadas: 15000,
        moneda: 'EUR',
        desglose: [],
      },
    ]);

    mockPrisma.catalogoItem.findMany.mockResolvedValue([
      {
        id: 'inm-top',
        nombre: 'Ático Premium',
        precioBase: 500000,
        tenantId: 'child-1',
        customFieldValues: { zona: 'Barcelona' },
        media: [{ url: 'img.jpg', tipo: 'imagen' }],
        fechaCreacion: new Date(),
      },
    ]);

    mockPrisma.lead.findMany.mockResolvedValue([
      {
        id: 'lead-1',
        nombre: 'Juan Pérez',
        email: 'juan@test.com',
        empresa: 'TechCorp',
        tenantId: 'child-1',
        fechaCreacion: new Date(),
      },
    ]);

    mockPrisma.deal.findMany.mockResolvedValue([
      { etapa: 'negociacion', valor: 400000, moneda: 'EUR' },
      { etapa: 'negociacion', valor: 350000, moneda: 'EUR' },
      { etapa: 'cerrado', valor: 450000, moneda: 'EUR' },
    ]);

    const res = await OverviewGET(mockRequest('https://volkern.app/api/real-estate/franchise/overview'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.globalStats.totalProperties).toBe(120);
    expect(json.commissions).toHaveLength(2);
    expect(json.topProperties).toHaveLength(1);
    expect(json.recentLeads).toHaveLength(1);
    expect(json.dealsByStage).toHaveLength(2);
    expect(json.dealsByStage.find((d: any) => d.etapa === 'negociacion').cantidad).toBe(2);
    expect(json.dealsByStage.find((d: any) => d.etapa === 'negociacion').valorTotal).toBe(750000);
  });

  it('debe retornar 500 si getFranchiseGlobalStats falla', async () => {
    (getFranchiseGlobalStats as any).mockRejectedValueOnce(new Error('Query error'));

    const res = await OverviewGET(mockRequest('https://volkern.app/api/real-estate/franchise/overview'));
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/real-estate/franchise/commissions ───────────────────────────

describe('GET /api/real-estate/franchise/commissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    simularFranquicia();
  });

  it('debe retornar lista de comisiones sin filtros', async () => {
    mockPrisma.comision.findMany.mockResolvedValue([
      {
        id: 'com-1',
        dealId: 'deal-1',
        userId: 'user-a',
        montoCalculado: 5000,
        tipo: 'porcentaje_venta',
        porcentaje: 3,
        montoFijo: null,
        moneda: 'EUR',
        estado: 'pendiente',
        fechaCreacion: new Date('2026-06-01'),
        fechaAprobacion: null,
        fechaPago: null,
        usuario: { id: 'user-a', name: 'Ana López', email: 'ana@test.com' },
        deal: { titulo: 'Venta Ático', valor: 200000, valorReal: null, moneda: 'EUR' },
        tenant: { id: 'test-tenant-id', nombre: 'Central' },
      },
    ]);

    const res = await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.totals.total).toBe(5000);
    expect(json.totals.pendientes).toBe(5000);
    expect(json.totals.pagadas).toBe(0);
    expect(json.byAgent).toHaveLength(1);
    expect(json.byAgent[0].agenteNombre).toBe('Ana López');
  });

  it('debe filtrar por agenteId', async () => {
    mockPrisma.comision.findMany.mockResolvedValue([]);

    await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions?agenteId=user-a'));

    expect(mockPrisma.comision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-a',
        }),
      })
    );
  });

  it('debe filtrar por rango de fechas', async () => {
    mockPrisma.comision.findMany.mockResolvedValue([]);

    await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions?desde=2026-01-01&hasta=2026-06-30'));

    const where = (mockPrisma.comision.findMany as any).mock.calls[0][0].where;
    expect(where.fechaCreacion.gte).toBeInstanceOf(Date);
    expect(where.fechaCreacion.lte).toBeInstanceOf(Date);
  });

  it('debe filtrar por estado', async () => {
    mockPrisma.comision.findMany.mockResolvedValue([]);

    await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions?estado=pendiente'));

    expect(mockPrisma.comision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'pendiente' }),
      })
    );
  });

  it('debe incluir hijos cuando incluirHijas=true', async () => {
    simularFranquicia([
      { id: 'child-1', nombre: 'Oficina Norte' },
      { id: 'child-2', nombre: 'Oficina Sur' },
    ]);
    mockPrisma.comision.findMany.mockResolvedValue([]);

    await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions?incluirHijas=true'));

    expect(mockPrisma.comision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: { in: ['test-tenant-id', 'child-1', 'child-2'] },
        }),
      })
    );
  });

  it('debe retornar 500 si hay error de DB', async () => {
    mockGlobalPrisma.tenant.findMany.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions'));
    expect(res.status).toBe(500);
  });

  it('no suma divisas distintas en una sola cifra', async () => {
    simularFranquicia([
      { id: 'oficina-mx', nombre: 'Oficina CDMX', moneda: 'MXN' },
      { id: 'oficina-es', nombre: 'Oficina Madrid', moneda: 'EUR' },
    ]);
    mockPrisma.comision.findMany.mockResolvedValue([
      { id: 'com-mx', dealId: 'd1', userId: 'u1', montoCalculado: 10000, tipo: 'porcentaje_venta',
        porcentaje: 3, montoFijo: null, moneda: 'MXN', estado: 'pendiente', fechaCreacion: new Date(),
        fechaAprobacion: null, fechaPago: null, tenantId: 'test-tenant-id',
        usuario: { id: 'u1', name: 'Ana', email: 'ana@test.com' }, deal: { titulo: 'A', valor: 1, valorReal: null, moneda: 'MXN' } },
      { id: 'com-es', dealId: 'd2', userId: 'u1', montoCalculado: 5000, tipo: 'porcentaje_venta',
        porcentaje: 3, montoFijo: null, moneda: 'EUR', estado: 'pendiente', fechaCreacion: new Date(),
        fechaAprobacion: null, fechaPago: null, tenantId: 'oficina-es',
        usuario: { id: 'u1', name: 'Ana', email: 'ana@test.com' }, deal: { titulo: 'B', valor: 1, valorReal: null, moneda: 'EUR' } },
    ]);

    const res = await CommissionsGET(mockRequest('https://volkern.app/api/real-estate/franchise/commissions'));
    const json = await res.json();

    expect(json.totals.multiDivisa).toBe(true);
    expect(json.totals.total).toBeNull();
    expect(json.totals.porMoneda).toHaveLength(2);
    expect(json.totals.porMoneda.find((t: any) => t.moneda === 'MXN').total).toBe(10000);
    expect(json.totals.porMoneda.find((t: any) => t.moneda === 'EUR').total).toBe(5000);
  });
});
