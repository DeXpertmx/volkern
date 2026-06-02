/**
 * Tests Unitarios — Real Estate Commission Calculator
 *
 * Verifica calculateCommission, createCommissionFromDeal,
 * getFranchiseCommissionSummary, getCommissionByAgent,
 * markCommissionAsPaid y approveCommission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    comision: {
      create: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn(),
    },
    tenant: { findMany: vi.fn() },
    catalogoItem: { count: vi.fn() },
    deal: { count: vi.fn() },
    lead: { count: vi.fn() },
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { prisma } from '@/lib/db';
import {
  calculateCommission,
  createCommissionFromDeal,
  getFranchiseCommissionSummary,
  getCommissionByAgent,
  markCommissionAsPaid,
  approveCommission,
} from '@/lib/real-estate/commission-calculator';
import type { CommissionRule, CommissionInput } from '@/lib/real-estate/commission-calculator';

// ─── calculateCommission ───────────────────────────────────────────────────

describe('calculateCommission', () => {
  const baseInput: CommissionInput = {
    dealId: 'deal-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    valorOperacion: 300000,
    moneda: 'EUR',
    rule: { tipo: 'porcentaje_venta', porcentaje: 3 },
  };

  it('debe calcular 3% sobre precio de venta (default)', () => {
    const result = calculateCommission(baseInput);

    expect(result.montoCalculado).toBe(9000); // 300000 * 3%
    expect(result.splitAgente).toBe(9000); // sin split, todo al agente
    expect(result.splitAgencia).toBe(0);
    expect(result.desglose).toHaveLength(1);
    expect(result.desglose[0]).toContain('3%');
  });

  it('debe usar 3% como default si no se especifica porcentaje', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'porcentaje_venta' },
    });

    expect(result.montoCalculado).toBe(9000);
  });

  it('debe calcular porcentaje_comision correctamente', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'porcentaje_comision', porcentaje: 50 },
    });

    expect(result.montoCalculado).toBe(150000); // 300000 * 50%
    expect(result.desglose[0]).toContain('50%');
  });

  it('debe usar 100% como default para porcentaje_comision', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'porcentaje_comision' },
    });

    expect(result.montoCalculado).toBe(300000);
  });

  it('debe calcular monto_fijo exacto', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'monto_fijo', montoFijo: 5000 },
    });

    expect(result.montoCalculado).toBe(5000);
    expect(result.desglose[0]).toContain('Tarifa fija');
  });

  it('debe retornar 0 si monto_fijo no está definido', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'monto_fijo' },
    });

    expect(result.montoCalculado).toBe(0);
  });

  it('debe calcular comisión escalonada correctamente', () => {
    const result = calculateCommission({
      ...baseInput,
      valorOperacion: 250000,
      rule: {
        tipo: 'escalonada',
        escalones: [
          { desde: 0, hasta: 100000, porcentaje: 5 },
          { desde: 100001, hasta: 500000, porcentaje: 3 },
          { desde: 500001, hasta: 999999999, porcentaje: 2 },
        ],
      },
    });

    expect(result.montoCalculado).toBe(7500); // 250000 * 3% (cae en 2º tramo)
    expect(result.desglose[0]).toContain('100.001');
    expect(result.desglose[0]).toContain('500.000');
  });

  it('debe aplicar último tramo si excede todos los escalones', () => {
    const result = calculateCommission({
      ...baseInput,
      valorOperacion: 600000,
      rule: {
        tipo: 'escalonada',
        escalones: [
          { desde: 0, hasta: 100000, porcentaje: 5 },
          { desde: 100001, hasta: 500000, porcentaje: 3 },
        ],
      },
    });

    expect(result.montoCalculado).toBe(18000); // 600000 * 3% (último escalón)
  });

  it('debe retornar 0 si no hay escalones definidos', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'escalonada', escalones: [] },
    });

    expect(result.montoCalculado).toBe(0);
    expect(result.desglose).toContain('Sin escalones definidos, se usa 0');
  });

  it('debe aplicar splits correctamente', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: {
        tipo: 'porcentaje_venta',
        porcentaje: 5,
        splitAgente: 60,
        splitAgencia: 40,
      },
    });

    const totalComision = 15000; // 300000 * 5%
    expect(result.montoCalculado).toBe(totalComision);
    expect(result.splitAgente).toBe(9000);  // 60% de 15000
    expect(result.splitAgencia).toBe(6000); // 40% de 15000
    expect(result.desglose[1]).toContain('Split');
  });

  it('debe redondear splits a 2 decimales', () => {
    const result = calculateCommission({
      ...baseInput,
      valorOperacion: 123456,
      rule: {
        tipo: 'porcentaje_venta',
        porcentaje: 3.5,
        splitAgente: 33.33,
        splitAgencia: 66.67,
      },
    });

    expect(result.splitAgente).toBe(1440.18); // 123456*3.5%*33.33%
    expect(result.splitAgencia).toBe(2880.78);
  });

  it('no debe incluir split si no están definidos', () => {
    const result = calculateCommission({
      ...baseInput,
      rule: { tipo: 'monto_fijo', montoFijo: 3000 },
    });

    expect(result.splitAgente).toBe(3000);
    expect(result.splitAgencia).toBe(0);
    expect(result.desglose).toHaveLength(1); // solo 1, sin split
  });
});

// ─── createCommissionFromDeal ──────────────────────────────────────────────

describe('createCommissionFromDeal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockDeal = {
    id: 'deal-1',
    tenantId: 'tenant-1',
    titulo: 'Venta Ático Centro',
    valor: 300000,
    valorReal: 290000,
    moneda: 'EUR',
    estado: 'cerrado',
  } as any;

  it('debe crear un registro de comisión en Prisma', async () => {
    (prisma.comision.create as any).mockResolvedValue({
      id: 'com-1',
      tenantId: 'tenant-1',
      dealId: 'deal-1',
      userId: 'user-1',
      tipo: 'porcentaje_venta',
      porcentaje: 3,
      montoCalculado: 8700, // 290000 * 3%
      moneda: 'EUR',
      estado: 'pendiente',
      metodoCalculo: '{}',
    });

    const result = await createCommissionFromDeal(
      mockDeal,
      'user-1',
      { tipo: 'porcentaje_venta', porcentaje: 3 },
    );

    expect(result.id).toBe('com-1');
    expect(result.estado).toBe('pendiente');
    expect(prisma.comision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          dealId: 'deal-1',
          userId: 'user-1',
          tipo: 'porcentaje_venta',
          montoCalculado: expect.any(Number),
          estado: 'pendiente',
        }),
      })
    );
  });

  it('debe usar valorReal si está disponible', async () => {
    (prisma.comision.create as any).mockResolvedValue({ id: 'com-2' });

    await createCommissionFromDeal(
      mockDeal,
      'user-1',
      { tipo: 'porcentaje_venta', porcentaje: 3 },
    );

    // valorReal = 290000 -> comisión = 8700
    const data = (prisma.comision.create as any).mock.calls[0][0].data;
    expect(data.montoCalculado).toBe(8700);
  });

  it('debe usar valor si valorReal no está disponible', async () => {
    const dealSinValorReal = { ...mockDeal, valorReal: null };
    (prisma.comision.create as any).mockResolvedValue({ id: 'com-3' });

    await createCommissionFromDeal(
      dealSinValorReal,
      'user-1',
      { tipo: 'porcentaje_venta', porcentaje: 3 },
    );

    const data = (prisma.comision.create as any).mock.calls[0][0].data;
    expect(data.montoCalculado).toBe(9000); // 300000 * 3%
  });
});

// ─── getFranchiseCommissionSummary ─────────────────────────────────────────

describe('getFranchiseCommissionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe retornar resumen para un solo tenant sin hijos', async () => {
    (prisma.tenant.findMany as any)
      .mockResolvedValue([{ id: 'tenant-1', nombre: 'Oficina Central', moneda: 'EUR' }]);

    (prisma.comision.findMany as any).mockResolvedValue([
      {
        montoCalculado: 5000,
        estado: 'pendiente',
        dealId: 'deal-1',
        deal: { titulo: 'Venta Piso' },
        usuario: { name: 'Ana López', email: 'ana@oficina.com' },
        fechaCreacion: new Date('2026-06-01'),
      },
      {
        montoCalculado: 3000,
        estado: 'pagada',
        dealId: 'deal-2',
        deal: { titulo: 'Alquiler Garaje' },
        usuario: { name: 'Carlos Ruiz', email: 'carlos@oficina.com' },
        fechaCreacion: new Date('2026-05-15'),
      },
    ]);

    const result = await getFranchiseCommissionSummary('tenant-1');

    expect(result).toHaveLength(1);
    expect(result[0].tenantNombre).toBe('Oficina Central');
    expect(result[0].totalComisiones).toBe(8000);
    expect(result[0].pendientes).toBe(5000);
    expect(result[0].pagadas).toBe(3000);
    expect(result[0].desglose).toHaveLength(2);
  });

  it('debe incluir sub-tenants cuando includeChildren es true', async () => {
    (prisma.tenant.findMany as any)
      .mockResolvedValueOnce([{ id: 'child-1', nombre: 'Oficina Norte' }])  // hijos
      .mockResolvedValueOnce([
        { id: 'tenant-1', nombre: 'Central', moneda: 'EUR' },
        { id: 'child-1', nombre: 'Oficina Norte', moneda: 'EUR' },
      ]);

    (prisma.comision.findMany as any).mockResolvedValue([]);

    const result = await getFranchiseCommissionSummary('tenant-1', true);

    expect(result).toHaveLength(2); // central + child
    expect(result[0].tenantId).toBe('tenant-1');
    expect(result[1].tenantId).toBe('child-1');
  });
});

// ─── getCommissionByAgent ──────────────────────────────────────────────────

describe('getCommissionByAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe agrupar comisiones por agente', async () => {
    (prisma.comision.findMany as any).mockResolvedValue([
      {
        userId: 'user-a',
        montoCalculado: 5000,
        estado: 'pendiente',
        usuario: { id: 'user-a', name: 'Ana', email: 'ana@test.com' },
        deal: { titulo: 'Deal A', valor: 200000 },
        fechaCreacion: new Date(),
      },
      {
        userId: 'user-b',
        montoCalculado: 8000,
        estado: 'pagada',
        usuario: { id: 'user-b', name: 'Bob', email: 'bob@test.com' },
        deal: { titulo: 'Deal B', valor: 300000 },
        fechaCreacion: new Date(),
      },
      {
        userId: 'user-a',
        montoCalculado: 2000,
        estado: 'pagada',
        usuario: { id: 'user-a', name: 'Ana', email: 'ana@test.com' },
        deal: { titulo: 'Deal C', valor: 100000 },
        fechaCreacion: new Date(),
      },
    ]);

    const result = await getCommissionByAgent('tenant-1');

    // Debería tener 2 agentes
    expect(result).toHaveLength(2);

    // Ana (user-a) total: 7000, pendientes: 5000, pagadas: 2000
    const ana = result.find(r => r.agenteId === 'user-a')!;
    expect(ana.totalComisiones).toBe(7000);
    expect(ana.pendientes).toBe(5000);
    expect(ana.pagadas).toBe(2000);
    expect(ana.cantidad).toBe(2);

    // Bob (user-b) total: 8000
    const bob = result.find(r => r.agenteId === 'user-b')!;
    expect(bob.totalComisiones).toBe(8000);
    expect(bob.pendientes).toBe(0);
    expect(bob.pagadas).toBe(8000);
    expect(bob.cantidad).toBe(1);
  });

  it('debe ordenar por total descendente', async () => {
    (prisma.comision.findMany as any).mockResolvedValue([
      {
        userId: 'user-a',
        montoCalculado: 3000,
        estado: 'pendiente',
        usuario: { id: 'user-a', name: 'Ana', email: 'a@t.com' },
        deal: { titulo: 'D1', valor: 100000 },
        fechaCreacion: new Date(),
      },
      {
        userId: 'user-b',
        montoCalculado: 10000,
        estado: 'pagada',
        usuario: { id: 'user-b', name: 'Bob', email: 'b@t.com' },
        deal: { titulo: 'D2', valor: 500000 },
        fechaCreacion: new Date(),
      },
    ]);

    const result = await getCommissionByAgent('tenant-1');

    expect(result[0].agenteId).toBe('user-b'); // 10000 > 3000
    expect(result[1].agenteId).toBe('user-a');
  });

  it('debe aplicar filtros de fecha', async () => {
    (prisma.comision.findMany as any).mockResolvedValue([]);

    const desde = new Date('2026-01-01');
    const hasta = new Date('2026-06-30');

    await getCommissionByAgent('tenant-1', desde, hasta);

    expect(prisma.comision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          fechaCreacion: {
            gte: desde,
            lte: hasta,
          },
        }),
      })
    );
  });
});

// ─── markCommissionAsPaid & approveCommission ──────────────────────────────

describe('markCommissionAsPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe marcar comisión como pagada con referencia', async () => {
    (prisma.comision.update as any).mockResolvedValue({
      id: 'com-1',
      estado: 'pagada',
      fechaPago: new Date(),
      referenciaPago: 'TRF-2026-001',
    });

    const result = await markCommissionAsPaid('com-1', 'TRF-2026-001');

    expect(result.estado).toBe('pagada');
    expect(prisma.comision.update).toHaveBeenCalledWith({
      where: { id: 'com-1' },
      data: expect.objectContaining({
        estado: 'pagada',
        fechaPago: expect.any(Date),
        referenciaPago: 'TRF-2026-001',
      }),
    });
  });
});

describe('approveCommission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe marcar comisión como aprobada', async () => {
    (prisma.comision.update as any).mockResolvedValue({
      id: 'com-1',
      estado: 'aprobada',
      fechaAprobacion: new Date(),
    });

    const result = await approveCommission('com-1');

    expect(result.estado).toBe('aprobada');
    expect(prisma.comision.update).toHaveBeenCalledWith({
      where: { id: 'com-1' },
      data: expect.objectContaining({
        estado: 'aprobada',
        fechaAprobacion: expect.any(Date),
      }),
    });
  });
});
