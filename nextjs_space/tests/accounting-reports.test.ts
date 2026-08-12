import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAccountFindMany = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    accountingAccount: { findMany: mockAccountFindMany },
  },
}));

import { getTrialBalance } from '@/lib/accounting/reports/trial-balance';
import { getPyG } from '@/lib/accounting/reports/pyg';
import { getBalanceSheet } from '@/lib/accounting/reports/balance-sheet';

const TENANT_ID = 'tenant-1';

/**
 * Escenario balanceado (convención de signos del EntryManager:
 * balance = Σ(debe − haber), así que las cuentas de HABER —PASIVO e
 * INGRESO— quedan con balance negativo).
 *
 * Factura de 1.210 € (430 débito 1.210 / 705 haber 1.000 / 477 haber 210)
 * Gasto de 1.210 € con IVA 210 y retención 150
 *   (621 débito 1.000 / 472 débito 210 / 410 haber 1.060 / 4751 haber 150)
 * Aporte de capital: 100 haber 3.000 / 572 débito 3.000
 */
const ACCOUNTS = [
  { code: '100', name: 'Capital social', type: 'PASIVO', balance: -3000 },
  { code: '410', name: 'Acreedores por prestaciones de servicios', type: 'PASIVO', balance: -1060 },
  { code: '430', name: 'Clientes', type: 'ACTIVO', balance: 1210 },
  { code: '472', name: 'H.P. IVA Soportado', type: 'ACTIVO', balance: 210 },
  { code: '4751', name: 'H.P. acreedora por retenciones practicadas', type: 'PASIVO', balance: -150 },
  { code: '477', name: 'H.P. IVA Repercutido', type: 'PASIVO', balance: -210 },
  { code: '572', name: 'Bancos e instituciones de crédito', type: 'ACTIVO', balance: 3000 },
  { code: '621', name: 'Arrendamientos y cánones', type: 'GASTO', balance: 1000 },
  { code: '705', name: 'Prestaciones de servicios', type: 'INGRESO', balance: -1000 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountFindMany.mockResolvedValue(ACCOUNTS);
});

// ============================================================
// GUARDIA DE SCHEMA: el orderBy debe usar solo campos reales del modelo
// (regresión: un `orderBy: { group } as any` pasaba typecheck pero
// reventaba en runtime con "Unknown argument `group`" en producción)
// ============================================================
describe('Guardia de schema — orderBy de los reportes', () => {
  const SCHEMA_FIELDS = ['id', 'tenantId', 'code', 'name', 'type', 'balance'];

  async function getOrderBy(fn: (id: string) => Promise<unknown>) {
    await fn(TENANT_ID);
    return mockAccountFindMany.mock.calls[0][0]?.orderBy;
  }

  it('trial-balance ordena solo por campos válidos del modelo', async () => {
    const orderBy = await getOrderBy(getTrialBalance);
    for (const key of Object.keys(orderBy ?? {})) {
      expect(SCHEMA_FIELDS).toContain(key);
    }
  });

  it('pyg ordena solo por campos válidos del modelo', async () => {
    const orderBy = await getOrderBy(getPyG);
    for (const key of Object.keys(orderBy ?? {})) {
      expect(SCHEMA_FIELDS).toContain(key);
    }
  });

  it('balance-sheet ordena solo por campos válidos del modelo', async () => {
    const orderBy = await getOrderBy(getBalanceSheet);
    for (const key of Object.keys(orderBy ?? {})) {
      expect(SCHEMA_FIELDS).toContain(key);
    }
  });
});

// ============================================================
// BALANCE DE COMPROBACIÓN (Trial Balance)
// ============================================================
describe('Balance de Comprobación — getTrialBalance', () => {
  it('debe estar cuadrado: total Debe === total Haber', async () => {
    const report = await getTrialBalance(TENANT_ID);

    expect(report.totalDebit).toBe(5420);  // 1210 + 210 + 3000 + 1000
    expect(report.totalCredit).toBe(5420); // 3000 + 1060 + 150 + 210 + 1000
    expect(Math.abs(report.totalDebit - report.totalCredit)).toBeLessThan(0.01);
  });

  it('debe clasificar cada cuenta en Debe o Haber según el signo de su saldo', async () => {
    const report = await getTrialBalance(TENANT_ID);
    const byCode = Object.fromEntries(report.rows.map(r => [r.code, r]));

    // Cuentas deudoras (ACTIVO/GASTO) → Debe
    expect(byCode['430']).toMatchObject({ debit: 1210, credit: 0, balance: 1210 });
    expect(byCode['621']).toMatchObject({ debit: 1000, credit: 0, balance: 1000 });
    // Cuentas acreedoras (PASIVO/INGRESO) → Haber
    expect(byCode['705']).toMatchObject({ debit: 0, credit: 1000, balance: -1000 });
    expect(byCode['100']).toMatchObject({ debit: 0, credit: 3000, balance: -3000 });
    expect(byCode['477']).toMatchObject({ debit: 0, credit: 210, balance: -210 });
  });

  it('debe excluir cuentas con saldo cero', async () => {
    mockAccountFindMany.mockResolvedValue([
      { code: '100', name: 'Capital', type: 'PASIVO', balance: 0 },
      { code: '430', name: 'Clientes', type: 'ACTIVO', balance: 0 },
    ]);
    const report = await getTrialBalance(TENANT_ID);
    expect(report.rows).toHaveLength(2);
    expect(report.totalDebit).toBe(0);
    expect(report.totalCredit).toBe(0);
  });
});

// ============================================================
// CUENTA DE RESULTADOS (PyG)
// ============================================================
describe('Cuenta de Resultados — getPyG', () => {
  it('debe reportar ingresos y gastos en positivo y el resultado correcto', async () => {
    const report = await getPyG(TENANT_ID);

    expect(report.totalGastos).toBe(1000);
    expect(report.totalIngresos).toBe(1000); // 705: saldo −1000 → 1.000 positivo
    expect(report.resultadoEjercicio).toBe(0); // 1000 − 1000 = 0
  });

  it('debe mostrar los ingresos en positivo dentro de su sección', async () => {
    const report = await getPyG(TENANT_ID);

    const ingresos = report.sections.find(s => s.label.includes('Ingresos'));
    expect(ingresos).toBeDefined();
    expect(ingresos!.accounts[0]).toMatchObject({ code: '705', balance: 1000 });
    expect(ingresos!.total).toBe(1000);

    const gastos = report.sections.find(s => s.label.includes('Gastos'));
    expect(gastos!.accounts[0]).toMatchObject({ code: '621', balance: 1000 });
    expect(gastos!.total).toBe(1000);
  });

  it('debe calcular beneficio cuando ingresos > gastos', async () => {
    mockAccountFindMany.mockResolvedValue([
      { code: '621', name: 'Arrendamientos', type: 'GASTO', balance: 500 },
      { code: '705', name: 'Prestaciones de servicios', type: 'INGRESO', balance: -3000 },
    ]);
    const report = await getPyG(TENANT_ID);
    expect(report.totalIngresos).toBe(3000);
    expect(report.totalGastos).toBe(500);
    expect(report.resultadoEjercicio).toBe(2500);
  });

  it('debe calcular pérdida cuando gastos > ingresos', async () => {
    mockAccountFindMany.mockResolvedValue([
      { code: '621', name: 'Arrendamientos', type: 'GASTO', balance: 4000 },
      { code: '705', name: 'Prestaciones de servicios', type: 'INGRESO', balance: -1000 },
    ]);
    const report = await getPyG(TENANT_ID);
    expect(report.resultadoEjercicio).toBe(-3000);
  });
});

// ============================================================
// BALANCE DE SITUACIÓN (Balance Sheet)
// ============================================================
describe('Balance de Situación — getBalanceSheet', () => {
  it('debe cuadrar: Total Activo === Total Pasivo + Patrimonio Neto', async () => {
    const report = await getBalanceSheet(TENANT_ID);

    // Activo: 430 (1210) + 472 (210) + 572 (3000) = 4420
    expect(report.activo.total).toBe(4420);
    // Pasivo: 100 (3000) + 410 (1060) + 4751 (150) + 477 (210) = 4420
    expect(report.pasivo.total).toBe(4420);
    expect(Math.abs(report.activo.total - report.pasivo.total)).toBeLessThan(0.01);
  });

  it('debe clasificar Patrimonio Neto (grupo 1) y Pasivo Corriente (grupos 4-5)', async () => {
    const report = await getBalanceSheet(TENANT_ID);

    const patrimonio = report.pasivo.sections.find(s => s.label.includes('Patrimonio Neto'));
    expect(patrimonio).toBeDefined();
    expect(patrimonio!.accounts.map(a => a.code)).toEqual(['100']);
    expect(patrimonio!.total).toBe(3000);

    const corriente = report.pasivo.sections.find(s => s.label.includes('Pasivo Corriente'));
    expect(corriente!.accounts.map(a => a.code).sort()).toEqual(['410', '4751', '477']);
    expect(corriente!.total).toBe(1420); // 1060 + 150 + 210
  });

  it('debe mostrar los importes de pasivo en positivo', async () => {
    const report = await getBalanceSheet(TENANT_ID);
    for (const section of report.pasivo.sections) {
      for (const acc of section.accounts) {
        expect(acc.balance).toBeGreaterThanOrEqual(0);
      }
      expect(section.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('debe dejar vacío el Activo No Corriente si no hay cuentas del grupo 2', async () => {
    const report = await getBalanceSheet(TENANT_ID);
    const noCorriente = report.activo.sections.find(s => s.label.includes('No Corriente'));
    expect(noCorriente!.accounts).toHaveLength(0);
    expect(noCorriente!.total).toBe(0);
  });
});
