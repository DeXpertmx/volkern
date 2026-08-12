import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks para el pipeline completo ──────────────────
const mockExpenseFindUnique = vi.hoisted(() => vi.fn());
const mockExpenseFindMany = vi.hoisted(() => vi.fn());
const mockInvoiceFindUnique = vi.hoisted(() => vi.fn());
const mockPayrollFindUnique = vi.hoisted(() => vi.fn());
const mockPayrollEsFindUnique = vi.hoisted(() => vi.fn());
const mockEntryFindFirst = vi.hoisted(() => vi.fn());
const mockEntryCreate = vi.hoisted(() => vi.fn());
const mockAccountUpdate = vi.hoisted(() => vi.fn());
const mockAccountFindMany = vi.hoisted(() => vi.fn());
const mockTaxRecordFindMany = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => {
  const prisma: any = {
    accountingEntry: {
      findFirst: mockEntryFindFirst,
      create: mockEntryCreate,
      findMany: vi.fn(),
    },
    accountingAccount: {
      update: mockAccountUpdate,
      findMany: mockAccountFindMany,
    },
    expense: {
      findUnique: mockExpenseFindUnique,
      findMany: mockExpenseFindMany,
    },
    invoice: { findUnique: mockInvoiceFindUnique },
    payrollRecord: { findUnique: mockPayrollFindUnique },
    payrollRecordES: { findUnique: mockPayrollEsFindUnique },
    taxRecord: { findMany: mockTaxRecordFindMany },
    auditLog: { create: vi.fn() },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma };
});

import { AccountingEventMapper } from '@/lib/accounting/event-mapper';
import { TaxService } from '@/lib/accounting/tax-service';
import { initializeAccountingListeners } from '@/lib/accounting/accounting-listener';
import { eventBus } from '@/lib/skills/event-bus';
import { EVENTS } from '@/lib/types/events';

const TENANT_ID = 'tenant-1';

const ACCOUNTS = [
  { id: 'a430', code: '430' },
  { id: 'a705', code: '705' },
  { id: 'a477', code: '477' },
  { id: 'a472', code: '472' },
  { id: 'a410', code: '410' },
  { id: 'a4751', code: '4751' },
  { id: 'a640', code: '640' },
  { id: 'a476', code: '476' },
  { id: 'a572', code: '572' },
  { id: 'a621', code: '621' },
  { id: 'a623', code: '623' },
  { id: 'a629', code: '629' },
];

function createdEntryData() {
  return mockEntryCreate.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccountFindMany.mockResolvedValue(ACCOUNTS);
  mockEntryFindFirst.mockResolvedValue(null); // sin asiento previo ni hash previo
  mockEntryCreate.mockImplementation(async ({ data }) => ({ id: 'entry-1', ...data, lines: [], taxImpact: [] }));
  mockAccountUpdate.mockResolvedValue({});
});

// ============================================================
// 1. GASTO con IVA + IRPF → Modelo 303 (IVA soportado) + Modelo 111 (retención)
// ============================================================
describe('Gasto con IVA y retención → 303 + 111', () => {
  it('mapExpenseToEntry crea el asiento balanceado con IVA soportado y retención IRPF', async () => {
    mockExpenseFindUnique.mockResolvedValue({
      id: 'exp-1',
      tenantId: TENANT_ID,
      supplierId: 'sup-1',
      description: 'Honorarios asesor fiscal',
      amount: 1210,
      category: 'profesional',
      date: new Date('2026-02-10'),
      createdAt: new Date('2026-02-10'),
      taxableBase: 1000,
      vatRate: 21,
      vatAmount: 210,
      metadata: { irpfRate: 15, irpfAmount: 150 },
      supplier: { id: 'sup-1', name: 'Asesor S.L.', taxId: 'B12345678' },
    });

    await AccountingEventMapper.mapExpenseToEntry('exp-1');

    const data = createdEntryData();
    // Debe (base + IVA) = Haber (pago proveedor + retención)
    expect(data.lines.create).toEqual([
      { accountId: 'a623', debit: 1000, credit: 0 },
      { accountId: 'a472', debit: 210, credit: 0 },
      { accountId: 'a410', debit: 0, credit: 1060 }, // 1210 − 150 de retención
      { accountId: 'a4751', debit: 0, credit: 150 },
    ]);
    expect(data.reference).toBe('exp-1');

    const impacts = data.taxImpact.create;
    expect(impacts).toHaveLength(2);
    expect(impacts.find((i: any) => i.type === 'IVA_SOPORTADO')).toMatchObject({
      baseAmount: 1000, taxRate: 21, taxAmount: 210, periodMonth: 2, periodYear: 2026,
    });
    expect(impacts.find((i: any) => i.type === 'IRPF_RETENCION')).toMatchObject({
      baseAmount: 1000, taxRate: 15, taxAmount: 150, periodMonth: 2, periodYear: 2026,
    });
  });

  it('el Modelo 303 reporta el IVA soportado del gasto', async () => {
    mockTaxRecordFindMany.mockResolvedValue([
      { id: 'tr-vat', type: 'IVA_SOPORTADO', baseAmount: 1000, taxAmount: 210, periodMonth: 2, periodYear: 2026, isFiled: false, entry: { id: 'e1', date: new Date('2026-02-10') } },
    ]);

    const report = await TaxService.getQuarterlyVatReport(TENANT_ID, 2026, 1);

    expect(report.inputVat.base).toBe(1000);
    expect(report.inputVat.amount).toBe(210);
    expect(report.result).toBe(-210);
  });

  it('el Modelo 111 reporta la retención IRPF del gasto', async () => {
    mockTaxRecordFindMany.mockResolvedValue([
      { id: 'tr-irpf', type: 'IRPF_RETENCION', baseAmount: 1000, taxAmount: 150, periodMonth: 2, periodYear: 2026, isFiled: false, entry: { id: 'e1', date: new Date('2026-02-10') } },
    ]);

    const report = await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);

    expect(report.retentions.base).toBe(1000);
    expect(report.totalRetentions).toBe(150);
  });

  it('es idempotente: no crea un segundo asiento si el gasto ya está contabilizado', async () => {
    mockExpenseFindUnique.mockResolvedValue({
      id: 'exp-1',
      tenantId: TENANT_ID,
      supplierId: 'sup-1',
      description: 'Gasto',
      amount: 1210,
      category: 'profesional',
      date: new Date('2026-02-10'),
      createdAt: new Date('2026-02-10'),
      taxableBase: 1000,
      vatRate: 21,
      vatAmount: 210,
      metadata: { irpfRate: 15, irpfAmount: 150 },
      supplier: { id: 'sup-1', name: 'Asesor S.L.', taxId: 'B12345678' },
    });

    await AccountingEventMapper.mapExpenseToEntry('exp-1');
    expect(mockEntryCreate).toHaveBeenCalledTimes(1);

    // Ya existe un asiento con reference=exp-1 → se corta antes de crear
    mockEntryFindFirst.mockResolvedValue({ id: 'existing' });
    await AccountingEventMapper.mapExpenseToEntry('exp-1');
    expect(mockEntryCreate).toHaveBeenCalledTimes(1);
  });

  it('sin desglose Verifactu estima IVA 21% desde el total', async () => {
    mockExpenseFindUnique.mockResolvedValue({
      id: 'exp-2',
      tenantId: TENANT_ID,
      supplierId: 'sup-1',
      description: 'Gasto simple',
      amount: 1210,
      category: 'otros',
      date: new Date('2026-02-10'),
      createdAt: new Date('2026-02-10'),
      taxableBase: null,
      vatRate: null,
      vatAmount: null,
      metadata: {},
      supplier: { id: 'sup-1', name: 'Proveedor', taxId: 'B12345678' },
    });

    await AccountingEventMapper.mapExpenseToEntry('exp-2');

    const data = createdEntryData();
    const impacts = data.taxImpact.create;
    expect(impacts.find((i: any) => i.type === 'IVA_SOPORTADO')).toMatchObject({
      baseAmount: 1000, taxRate: 21, taxAmount: 210,
    });
    expect(impacts.find((i: any) => i.type === 'IRPF_RETENCION')).toBeUndefined();
  });
});

// ============================================================
// 2. FACTURA emitida → Modelo 303 (IVA repercutido)
// ============================================================
describe('Factura emitida → 303', () => {
  it('mapInvoiceToEntry crea IVA_REPERCUTIDO y el 303 lo reporta', async () => {
    mockInvoiceFindUnique.mockResolvedValue({
      id: 'inv-1',
      tenantId: TENANT_ID,
      numero: 'FAC-2026-001',
      monto: 1210,
      estado: 'emitida',
      fechaEmision: new Date('2026-01-15'),
      ordenVenta: null,
    });

    await AccountingEventMapper.mapInvoiceToEntry('inv-1');

    const data = createdEntryData();
    const impact = data.taxImpact.create[0];
    expect(impact.type).toBe('IVA_REPERCUTIDO');
    expect(impact.baseAmount).toBeCloseTo(1000, 2);
    expect(impact.taxRate).toBe(21);
    expect(impact.taxAmount).toBeCloseTo(210, 2);
    expect(impact.periodMonth).toBe(1);
    expect(impact.periodYear).toBe(2026);

    // El Modelo 303 reporta el IVA repercutido
    mockTaxRecordFindMany.mockResolvedValue([
      { id: 'tr-out', type: 'IVA_REPERCUTIDO', baseAmount: 1000, taxAmount: 210, periodMonth: 1, periodYear: 2026, isFiled: false, entry: { id: 'e1', date: new Date('2026-01-15') } },
    ]);
    const report = await TaxService.getQuarterlyVatReport(TENANT_ID, 2026, 1);
    expect(report.outputVat.amount).toBe(210);
    expect(report.result).toBe(210);
  });
});

// ============================================================
// 3. GASTO de alquiler con retención → Modelo 115 + 180
// ============================================================
describe('Gasto de alquiler con retención → 115 + 180', () => {
  const rentExpense = {
    id: 'rent-1',
    tenantId: TENANT_ID,
    supplierId: 'sup-rent',
    description: 'Alquiler local oficina',
    amount: 1210,
    category: 'alquiler',
    date: new Date('2026-02-10'),
    createdAt: new Date('2026-02-10'),
    taxableBase: 1000,
    vatRate: 21,
    vatAmount: 210,
    metadata: { irpfRate: 19, irpfAmount: 190 },
    supplier: { id: 'sup-rent', name: 'Inmobiliaria Ruiz S.L.', taxId: 'B12345678' },
  };

  it('el Modelo 115 reporta la renta y la retención del trimestre', async () => {
    mockExpenseFindMany.mockResolvedValue([rentExpense]);

    const report = await TaxService.getQuarterlyModelo115Report(TENANT_ID, 2026, 1);

    expect(report.hasActivity).toBe(true);
    expect(report.totalRentBase).toBe(1000);
    expect(report.totalRetentions).toBe(190);
    expect(report.details[0].supplierName).toBe('Inmobiliaria Ruiz S.L.');
    expect(report.details[0].retentionAmount).toBe(190);
  });

  it('el Modelo 180 consolida el trimestre por arrendador', async () => {
    mockExpenseFindMany
      .mockResolvedValueOnce([rentExpense])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    const report = await TaxService.getAnnualModelo180Report(TENANT_ID, 2026);

    expect(report.hasActivity).toBe(true);
    expect(report.totalLandlords).toBe(1);
    expect(report.totalRentBase).toBe(1000);
    expect(report.totalRetentions).toBe(190);
    expect(report.quarters[0].totalRetentions).toBe(190);
  });
});

// ============================================================
// 4. NÓMINA → Modelo 111 (retención IRPF)
// ============================================================
describe('Nómina → 111', () => {
  it('mapPayrollEsToEntry crea IRPF_RETENCION desde el registro sellado (ES)', async () => {
    mockPayrollEsFindUnique.mockResolvedValue({
      id: 'pay-es-1',
      tenantId: TENANT_ID,
      period: '2026-02',
      grossTotal: 2500,
      netTotal: 1975,
      socialSecurityWorker: 150,
      irpfTotal: 375,
    });

    await AccountingEventMapper.mapPayrollEsToEntry('pay-es-1');

    const data = createdEntryData();
    expect(data.lines.create).toEqual([
      { accountId: 'a640', debit: 2500, credit: 0 },
      { accountId: 'a4751', debit: 0, credit: 375 },
      { accountId: 'a476', debit: 0, credit: 150 },
      { accountId: 'a572', debit: 0, credit: 1975 },
    ]);
    expect(data.taxImpact.create[0]).toMatchObject({
      type: 'IRPF_RETENCION',
      baseAmount: 2500,
      taxRate: 15,
      taxAmount: 375,
      periodMonth: 2,
      periodYear: 2026,
    });

    // El Modelo 111 reporta la retención de la nómina
    mockTaxRecordFindMany.mockResolvedValue([
      { id: 'tr-pay', type: 'IRPF_RETENCION', baseAmount: 2500, taxAmount: 375, periodMonth: 2, periodYear: 2026, isFiled: false, entry: { id: 'e1', date: new Date('2026-02-28') } },
    ]);
    const report = await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);
    expect(report.totalRetentions).toBe(375);
  });

  it('mapPayrollToEntry (legacy) crea IRPF_RETENCION desde metadata', async () => {
    mockPayrollFindUnique.mockResolvedValue({
      id: 'pay-1',
      tenantId: TENANT_ID,
      month: 2,
      year: 2026,
      metadata: { grossAmount: 3000, irpfRate: 15, irpfAmount: 450, ssEmployee: 180, netAmount: 2370 },
    });

    await AccountingEventMapper.mapPayrollToEntry('pay-1');

    const data = createdEntryData();
    expect(data.taxImpact.create[0]).toMatchObject({
      type: 'IRPF_RETENCION',
      baseAmount: 3000,
      taxRate: 15,
      taxAmount: 450,
      periodMonth: 2,
      periodYear: 2026,
    });
  });
});

// ============================================================
// 5. WIRING: el listener de contabilidad reacciona a EXPENSE_CREATED
// ============================================================
describe('Listener de contabilidad → gasto contabilizado automáticamente', () => {
  it('al emitirse EXPENSE_CREATED se invoca mapExpenseToEntry', async () => {
    const spy = vi.spyOn(AccountingEventMapper, 'mapExpenseToEntry').mockResolvedValue({ id: 'entry-x' } as any);

    initializeAccountingListeners();
    eventBus.emitEvent(EVENTS.EXPENSE_CREATED, {
      tenantId: TENANT_ID,
      expenseId: 'exp-1',
      monto: 1210,
      categoria: 'profesional',
      source: 'app',
    });

    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith('exp-1'));
    spy.mockRestore();
  });
});
