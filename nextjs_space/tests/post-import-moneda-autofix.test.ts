/**
 * Tests vitest del helper `lib/insurance/post-import-moneda-autofix.ts`.
 *
 * Estrategia: mockeamos `globalPrisma` para simular el estado del tenant y
 * las pólizas recién importadas. Verificamos:
 *   1. La decisión correcta según composición del batch + tenant.moneda.
 *   2. Las escrituras a BD (tenant.update + auditLog.create) sólo cuando
 *      corresponde (cambio), o ninguna escritura cuando no corresponde.
 *   3. El mensaje humano y los campos de trazabilidad (reason, source, distribution).
 *
 * Cubre todos los branches: already-correct, batch-empty, mixed-currency,
 * empty-distribution, dry-run-suggested, auto-fix-applied.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma ANTES de importar el helper (las llamadas se resuelven en import time)
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  globalPrisma: {
    tenant: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    auditLog: {
      create: mockAuditCreate,
    },
  },
}));

// Importamos DESPUÉS del mock.
const { maybeAutoFixTenantCurrencyAfterImport } = await import(
  '../lib/insurance/post-import-moneda-autofix'
);

const TENANT_ID = 'tenant-test-id';

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockAuditCreate.mockReset();
  // Defaults para que la mayoría de tests sólo necesiten sobreescribir lo específico.
  mockFindUnique.mockResolvedValue({
    id: TENANT_ID,
    slug: 'test-tenant',
    moneda: 'MXN', // default conservador (escenario típico del autofix)
  });
  mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
  mockAuditCreate.mockResolvedValue({ id: 'audit-1' });
});

describe('maybeAutoFixTenantCurrencyAfterImport — casos de no-decisión (noop)', () => {
  it('1) tenant.moneda="EUR" → already-correct, no escribe nada', async () => {
    mockFindUnique.mockResolvedValue({
      id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR',
    });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'EUR' }, { moneda: 'EUR' }],
    );
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('already-correct');
    expect(result.previousMoneda).toBe('EUR');
    expect(result.appliedMoneda).toBeUndefined();
    expect(result.mensaje).toContain('ya tiene moneda EUR');
    // No debe haber escrito nada
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('2) tenant.moneda="USD" → already-correct aunque batch sea MXN', async () => {
    mockFindUnique.mockResolvedValue({
      id: TENANT_ID, slug: 'test-tenant', moneda: 'USD',
    });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'MXN' }],
    );
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('already-correct');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('3) batch vacío (0 filas) → batch-empty, noop', async () => {
    const result = await maybeAutoFixTenantCurrencyAfterImport(TENANT_ID, []);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('batch-empty');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('4) batch por debajo del minBatchSize → noop', async () => {
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'EUR' }],
      { minBatchSize: 5 },
    );
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('batch-empty');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('5) mixto (EUR + USD) → mixed-currency, noop conservador', async () => {
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'EUR' }, { moneda: 'EUR' }, { moneda: 'USD' }],
    );
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('mixed-currency');
    expect(result.previousMoneda).toBe('MXN');
    expect(result.suggestedMoneda).toBe('MXN');
    expect(result.mensaje.toLowerCase()).toContain('no aplica');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('6) batch con todas las pólizas en MXN → suggestedMoneda=MXN, noop', async () => {
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'MXN' }, { moneda: 'MXN' }, { moneda: 'MXN' }],
    );
    expect(result.changed).toBe(false);
    // El resolver sugiere MXN (que ES el fallback default) → no auto-fixeamos
    expect(result.suggestedMoneda).toBe('MXN');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('maybeAutoFixTenantCurrencyAfterImport — casos de auto-fix', () => {
  it('7) batch 100% EUR → auto-fix MXN → EUR', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'EUR' }, { moneda: 'EUR' }, { moneda: 'EUR' }, { moneda: 'EUR' }],
      { source: 'system:auto-import-bulk-csv' }, // mismo source que usa app/api/insurance/importar
    );
    expect(result.changed).toBe(true);
    expect(result.reason).toBe('auto-fix-applied');
    expect(result.previousMoneda).toBe('MXN');
    expect(result.appliedMoneda).toBe('EUR');
    expect(result.resolverSource).toBe('auto-from-polizas');
    expect(result.distribution).toEqual({ EUR: 4 });
    // Verificamos escrituras: tenant.update + auditLog.create
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { moneda: 'EUR' },
    });
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditCall = mockAuditCreate.mock.calls[0][0].data;
    expect(auditCall.accion).toBe('actualizar');
    expect(auditCall.entidad).toBe('tenant');
    expect(auditCall.entidadId).toBe(TENANT_ID);
    expect(auditCall.descripcion).toContain('Auto-set desde primer import');
    expect(auditCall.descripcion).toContain('MXN');
    expect(auditCall.descripcion).toContain('EUR');
    expect(auditCall.descripcion).toContain('4 pólizas importadas');
    expect(auditCall.descripcion).toContain('auto-import-bulk-csv');
    expect(auditCall.cambiosAntes).toEqual({ moneda: 'MXN' });
    expect(auditCall.cambiosDespues).toEqual({ moneda: 'EUR' });
    // Timestamp de aplicación presente
    expect(result.aplicadoAt).toBeDefined();
  });

  it('8) batch 100% USD → auto-fix MXN → USD', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'USD' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'USD' }, { moneda: 'USD' }, { moneda: 'USD' }],
    );
    expect(result.changed).toBe(true);
    expect(result.appliedMoneda).toBe('USD');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { moneda: 'USD' },
    });
  });

  it('9) batch 100% GBP → auto-fix MXN → GBP', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'GBP' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'GBP' }, { moneda: 'GBP' }],
    );
    expect(result.changed).toBe(true);
    expect(result.appliedMoneda).toBe('GBP');
  });

  it('10) batch con 1 sola póliza en EUR → auto-fix (minBatchSize=1 por default)', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'EUR' }],
    );
    expect(result.changed).toBe(true);
    expect(result.appliedMoneda).toBe('EUR');
  });

  it('11) monedas no soportadas en el batch se filtran (defensivo)', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [
        { moneda: 'EUR' },
        { moneda: 'EUR' },
        { moneda: 'XYZ' }, // descartada por el resolver
      ] as any,
    );
    // El resolver filtra XYZ y deja EUR-only → auto-fix
    expect(result.changed).toBe(true);
    expect(result.appliedMoneda).toBe('EUR');
    expect(result.distribution).toEqual({ EUR: 2, XYZ: 1 }); // raw se preserva
  });

  it('12) monedas en minúsculas se normalizan antes del resolver', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'eur' }, { moneda: 'EUR' }, { moneda: 'eur' }],
    );
    expect(result.changed).toBe(true);
    expect(result.appliedMoneda).toBe('EUR');
    expect(result.distribution).toEqual({ EUR: 3 });
  });
});

describe('maybeAutoFixTenantCurrencyAfterImport — dry-run', () => {
  it('13) dryRun=true con batch warranting auto-fix → reporta pero no escribe', async () => {
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'EUR' }, { moneda: 'EUR' }, { moneda: 'EUR' }],
      { dryRun: true },
    );
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('dry-run-suggested');
    expect(result.previousMoneda).toBe('MXN');
    expect(result.suggestedMoneda).toBe('EUR');
    expect(result.appliedMoneda).toBeUndefined();
    expect(result.mensaje).toContain('DRY-RUN');
    expect(result.mensaje).toContain('MXN → EUR');
    // Verify: NO escribió nada
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('maybeAutoFixTenantCurrencyAfterImport — audit log diferenciador', () => {
  it('14) el audit log distingue auto-fix de cambios manuales (texto incluye source)', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'EUR' }, { moneda: 'EUR' }],
      { source: 'system:test-suite' },
    );
    const auditCall = mockAuditCreate.mock.calls[0][0].data;
    expect(auditCall.descripcion).toContain('system:test-suite');
    expect(auditCall.descripcion).toContain('Cooldown de 24h saltado');
  });

  it('15) si auditLog falla, tenant.moneda sigue actualizado (no rollback)', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    mockAuditCreate.mockRejectedValue(new Error('audit log table is locked'));
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID, [{ moneda: 'EUR' }],
    );
    // Aún así, el cambio está aplicado y reported
    expect(result.changed).toBe(true);
    expect(result.appliedMoneda).toBe('EUR');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    consoleWarnSpy.mockRestore();
  });
});

describe('maybeAutoFixTenantCurrencyAfterImport — respuesta payload para la UI', () => {
  it('16) el payload completo incluye reason, distribution, mensaje y resolution trazable', async () => {
    mockUpdate.mockResolvedValue({ id: TENANT_ID, slug: 'test-tenant', moneda: 'EUR' });
    const result = await maybeAutoFixTenantCurrencyAfterImport(
      TENANT_ID,
      [{ moneda: 'EUR' }, { moneda: 'EUR' }, { moneda: 'EUR' }, { moneda: 'EUR' }],
    );
    expect(result).toMatchObject({
      changed: true,
      reason: 'auto-fix-applied',
      previousMoneda: 'MXN',
      suggestedMoneda: 'EUR',
      appliedMoneda: 'EUR',
      resolverSource: 'auto-from-polizas',
      distribution: { EUR: 4 },
    });
    expect(result.resolution).toBeDefined();
    expect(result.resolution.moneda).toBe('EUR');
    expect(result.resolution.source).toBe('auto-from-polizas');
    expect(result.resolution.mensaje).toContain('EUR');
    // Format ISO timestamp
    expect(result.aplicadoAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
