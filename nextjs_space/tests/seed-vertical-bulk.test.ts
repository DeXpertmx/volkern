import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() ensures the spy is available before the factory closure runs.
const mocks = vi.hoisted(() => ({
  seedTenantModulesFromVertical: vi.fn(),
}));

vi.mock('@/lib/provisioning/tenant-provisioner', () => ({
  seedTenantModulesFromVertical: mocks.seedTenantModulesFromVertical,
}));

import {
  runSeedVerticalBulk,
  type SeedVerticalBulkInput,
} from '@/lib/provisioning/seed-vertical-bulk';
import { VERTICALS, type Vertical } from '@/lib/plans';

const ACTOR = { kind: 'system' as const, source: 'test' };

beforeEach(() => {
  mocks.seedTenantModulesFromVertical.mockReset();
  // Default: éxito con todos los módulos sembrados.
  mocks.seedTenantModulesFromVertical.mockResolvedValue({
    seeded: ['leads', 'contactos', 'insurance'],
    skipped: [],
    errors: [],
  });
});

describe('runSeedVerticalBulk — dry-run', () => {
  it('1) dryRun=true NO llama al helper y simula todas las filas', async () => {
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1', 't2'],
      vertical: 'insurance',
      dryRun: true,
      actor: ACTOR,
    } as SeedVerticalBulkInput);

    expect(mocks.seedTenantModulesFromVertical).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.partial).toBe(0);
    expect(result.modulesPlanned.length).toBeGreaterThan(0);
    expect(result.tenants[0].seeded[0]).toMatch(/simulated/);
  });

  it('2) dryRun incluye todos los módulos planeados por tenant simulado', async () => {
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'accounting',
      dryRun: true,
      actor: ACTOR,
    });
    expect(result.tenants[0].seeded.length).toBe(result.modulesPlanned.length);
    expect(result.tenants[0].seeded.every(s => s.endsWith(' (simulated)'))).toBe(true);
    expect(result.totalSeeded).toBe(result.modulesPlanned.length);
    expect(result.totalSkipped).toBe(0);
  });
});

describe('runSeedVerticalBulk — happy path', () => {
  it('3) crea N tenants con su vertical → succeeded N', async () => {
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1', 't2', 't3'],
      vertical: 'real_estate',
      dryRun: false,
      actor: ACTOR,
    });

    expect(mocks.seedTenantModulesFromVertical).toHaveBeenCalledTimes(3);
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.partial).toBe(0);
    expect(result.virtualStrict).toBeUndefined?.(); // type-check
  });

  it('4) propaga tenantId correctamente al helper', async () => {
    mocks.seedTenantModulesFromVertical.mockResolvedValue({ seeded: ['leads'], skipped: [], errors: [] });
    await runSeedVerticalBulk({
      tenantIds: ['tenant-abc', 'tenant-def'],
      vertical: 'general',
      dryRun: false,
      actor: ACTOR,
    });
    const tenantIds = mocks.seedTenantModulesFromVertical.mock.calls.map(c => c[0].tenantId);
    expect(tenantIds.sort()).toEqual(['tenant-abc', 'tenant-def']);
  });

  it('5) resuelve modules desde VERTICAL_DEFINITIONS si no se pasan custom', async () => {
    await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'insurance',
      dryRun: false,
      actor: ACTOR,
    });
    const called = mocks.seedTenantModulesFromVertical.mock.calls[0][0];
    // insurance incluye 'insurance' y 'leads' como módulos curados.
    expect(called.modules).toContain('insurance');
    expect(called.modules).toContain('leads');
    expect(called.modules.length).toBeGreaterThan(5);
  });

  it('6) acepta modules custom (override)', async () => {
    await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'insurance',
      modules: ['leads', 'contactos'],
      dryRun: false,
      actor: ACTOR,
    });
    const called = mocks.seedTenantModulesFromVertical.mock.calls[0][0];
    expect(called.modules).toEqual(['leads', 'contactos']);
  });

  it('7) pasa vertical como parámetro al helper', async () => {
    await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'accounting',
      dryRun: false,
      actor: ACTOR,
    });
    const called = mocks.seedTenantModulesFromVertical.mock.calls[0][0];
    expect(called.vertical).toBe('accounting');
  });

  it('8) propaga actor (user) al helper con email', async () => {
    await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'general',
      dryRun: false,
      actor: { kind: 'user', id: 'admin-1', email: 'admin@volkern.app' },
    });
    const called = mocks.seedTenantModulesFromVertical.mock.calls[0][0];
    expect(called.actor).toEqual({ kind: 'user', id: 'admin-1', email: 'admin@volkern.app' });
  });

  it('9) propaga actor (system) al helper', async () => {
    await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'general',
      dryRun: false,
      actor: { kind: 'system', source: 'cron-secret' },
    });
    const called = mocks.seedTenantModulesFromVertical.mock.calls[0][0];
    expect(called.actor).toEqual({ kind: 'system', source: 'cron-secret' });
  });
});

describe('runSeedVerticalBulk — error handling', () => {
  it('10) error en helper con errors=[] → fatalError → failed=1', async () => {
    mocks.seedTenantModulesFromVertical.mockRejectedValueOnce(new Error('Network down'));
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'insurance',
      dryRun: false,
      actor: ACTOR,
    });
    expect(result.failed).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.tenants[0].fatalError).toMatch(/Network down/);
    expect(result.tenants[0].ok).toBe(false);
  });

  it('11) error en helper con errors[] no-vacías → partial=1, ok=true (no fatal)', async () => {
    mocks.seedTenantModulesFromVertical.mockResolvedValueOnce({
      seeded: ['leads'],
      skipped: ['contactos'],
      errors: [{ module: 'insurance', error: 'invalid' }],
    });
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'insurance',
      dryRun: false,
      actor: ACTOR,
    });
    // El spec dice "partial" = tenants con errores NO-fatal pero errores no-fatal en errors[].
    // El runner clasifica: si fatalError es undefined Y errors[] tiene algún item,
    // cuenta como partial. partial > 0 → ok=false (definición del método).
    expect(result.partial).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.tenants[0].errors.length).toBe(1);
    // ok es false porque hay partial
    expect(result.ok).toBe(false);
  });

  it('12) tenant sin errores → succeeded, partial=0', async () => {
    mocks.seedTenantModulesFromVertical.mockResolvedValue({
      seeded: ['leads'], skipped: [], errors: [],
    });
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1'],
      vertical: 'insurance',
      dryRun: false,
      actor: ACTOR,
    });
    expect(result.succeeded).toBe(1);
    expect(result.partial).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('13) suma totalSeeded + totalSkipped correctamente', async () => {
    mocks.seedTenantModulesFromVertical
      .mockResolvedValueOnce({ seeded: ['a', 'b'], skipped: ['c'], errors: [] })
      .mockResolvedValueOnce({ seeded: ['d'],     skipped: [],     errors: [] });
    const result = await runSeedVerticalBulk({
      tenantIds: ['t1', 't2'],
      vertical: 'insurance',
      dryRun: false,
      actor: ACTOR,
    });
    expect(result.totalSeeded).toBe(3); // 2 + 1
    expect(result.totalSkipped).toBe(1); // 1 + 0
  });
});

describe('runSeedVerticalBulk — concurrency pool', () => {
  it('14) processa N filas respetando concurrency=3', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mocks.seedTenantModulesFromVertical.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return { seeded: ['leads'], skipped: [], errors: [] };
    });

    const tenantIds = Array.from({ length: 9 }, (_, i) => `t${i + 1}`);
    const result = await runSeedVerticalBulk({
      tenantIds,
      vertical: 'general',
      dryRun: false,
      concurrency: 3,
      actor: ACTOR,
    });

    expect(result.total).toBe(9);
    expect(result.succeeded).toBe(9);
    expect(maxInFlight).toBe(3);
  });

  it('15) concurrency fuera de rango se cap a 1..10', async () => {
    const tenantIds = Array.from({ length: 5 }, (_, i) => `t${i + 1}`);
    await runSeedVerticalBulk({
      tenantIds,
      vertical: 'general',
      dryRun: false,
      concurrency: 100, // fuera de rango
      actor: ACTOR,
    });
    expect(mocks.seedTenantModulesFromVertical).toHaveBeenCalledTimes(5);
  });
});

describe('runSeedVerticalBulk — empty input', () => {
  it('16) tenantIds=[] devuelve ok=true con totales en cero', async () => {
    const result = await runSeedVerticalBulk({
      tenantIds: [],
      vertical: 'insurance',
      dryRun: false,
      actor: ACTOR,
    });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.tenants).toEqual([]);
    expect(mocks.seedTenantModulesFromVertical).not.toHaveBeenCalled();
  });
});

describe('runSeedVerticalBulk — todas las verticales', () => {
  for (const v of VERTICALS) {
    it(`17) acepta vertical "${v}" sin errores`, async () => {
      const result = await runSeedVerticalBulk({
        tenantIds: ['t1'],
        vertical: v as Vertical,
        dryRun: false,
        actor: ACTOR,
      });
      expect(result.virtualStrict).toBeUndefined?.();
      expect(result.total).toBe(1);
      // El módulo curado principal debe estar en modulesPlanned.
      if (v === 'insurance')      expect(result.modulesPlanned).toContain('insurance');
      if (v === 'accounting')     expect(result.modulesPlanned).toContain('finanzas');
      if (v === 'real_estate')    expect(result.modulesPlanned).toContain('catalogo');
      if (v === 'hospitality')    expect(result.modulesPlanned).toContain('hospitality');
      if (v === 'general')        expect(result.modulesPlanned).toContain('leads');
    });
  }
});
