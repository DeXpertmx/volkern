import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted)
// ────────────────────────────────────────────────────────────────────────────
const __mockPrisma = vi.hoisted(() => ({
  hospitalityProperty: {
    findMany: vi.fn(),
  },
}));

const __mockRunReconciliation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));

vi.mock('@/lib/hospitality/reconciliation', () => ({
  runReconciliation: (...a: any[]) => __mockRunReconciliation(...a),
}));

describe('runHospitalityReconcileScan (job diario §14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([]);
    __mockRunReconciliation.mockResolvedValue({
      ok: true,
      propiedades: 1,
      fetchFallidos: 0,
      totalFetch: 0,
      creadas: 0,
      actualizadas: 0,
      canceladas: 0,
      sinCambios: 0,
      divergencias: 0,
      errores: [],
    });
  });

  it('sin tenants con mappings activos → no llama a la reconciliación', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([]);

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.success).toBe(true);
    expect(res.tenants).toBe(0);
    expect(res.totalCreadas).toBe(0);
    expect(__mockRunReconciliation).not.toHaveBeenCalled();
  });

  it('reconcilia cada tenant con mapping, siempre conservador (cancelarAusentes:false, dias:30)', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.tenants).toBe(2);
    expect(__mockRunReconciliation).toHaveBeenCalledTimes(2);
    expect(__mockRunReconciliation).toHaveBeenCalledWith({
      tenantId: 't1',
      dias: 30,
      cancelarAusentes: false,
    });
    expect(__mockRunReconciliation).toHaveBeenCalledWith({
      tenantId: 't2',
      dias: 30,
      cancelarAusentes: false,
    });
  });

  it('acumula contadores y reporta errores sin romper el job', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockRunReconciliation
      .mockResolvedValueOnce({
        ok: true,
        propiedades: 1,
        fetchFallidos: 0,
        totalFetch: 4,
        creadas: 2,
        actualizadas: 1,
        canceladas: 0,
        sinCambios: 0,
        divergencias: 3,
        errores: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        propiedades: 1,
        fetchFallidos: 1,
        totalFetch: 0,
        creadas: 0,
        actualizadas: 0,
        canceladas: 0,
        sinCambios: 0,
        divergencias: 0,
        errores: ['[Prop A] HTTP 404'],
      });

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.success).toBe(false);
    expect(res.totalCreadas).toBe(2);
    expect(res.totalActualizadas).toBe(1);
    expect(res.totalDivergencias).toBe(3);
    expect(res.errores).toEqual(['[Prop A] HTTP 404']);
  });

  it('un tenant que lanza no impide reconciliar los demás', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockRunReconciliation
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({
        ok: true,
        propiedades: 1,
        fetchFallidos: 0,
        totalFetch: 0,
        creadas: 1,
        actualizadas: 0,
        canceladas: 0,
        sinCambios: 0,
        divergencias: 0,
        errores: [],
      });

    const { runHospitalityReconcileScan } = await import('@/lib/cron/hospitality-reconcile');
    const res = await runHospitalityReconcileScan();

    expect(res.tenants).toBe(2);
    expect(res.success).toBe(false);
    expect(res.totalCreadas).toBe(1);
    expect(res.errores).toEqual(['DB timeout']);
  });
});
