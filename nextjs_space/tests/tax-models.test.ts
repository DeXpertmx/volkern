import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks for all Prisma models used by TaxService ──────
const mockTaxRecordFindMany = vi.hoisted(() => vi.fn());
const mockTaxRecordCount = vi.hoisted(() => vi.fn());
const mockTaxRecordUpdateMany = vi.hoisted(() => vi.fn());
const mockAccountingEntryFindMany = vi.hoisted(() => vi.fn());
const mockInvoiceFindMany = vi.hoisted(() => vi.fn());
const mockExpenseFindMany = vi.hoisted(() => vi.fn());
const mockPerfilFiscalClienteFindMany = vi.hoisted(() => vi.fn());
const mockSupplierFindMany = vi.hoisted(() => vi.fn());
const mockAuditLogCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    taxRecord: {
      findMany: mockTaxRecordFindMany,
      count: mockTaxRecordCount,
      updateMany: mockTaxRecordUpdateMany,
    },
    accountingEntry: {
      findMany: mockAccountingEntryFindMany,
    },
    invoice: {
      findMany: mockInvoiceFindMany,
    },
    expense: {
      findMany: mockExpenseFindMany,
    },
    perfilFiscalCliente: {
      findMany: mockPerfilFiscalClienteFindMany,
    },
    supplier: {
      findMany: mockSupplierFindMany,
    },
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

import { TaxService } from '@/lib/accounting/tax-service';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

// ============================================================
// Helpers
// ============================================================
function makeTaxRecord(overrides: Partial<any> = {}) {
  return {
    id: 'tr-1',
    tenantId: TENANT_ID,
    entryId: 'entry-1',
    type: 'IRPF_RETENCION',
    baseAmount: 1000,
    taxRate: 15,
    taxAmount: 150,
    periodMonth: 2,
    periodYear: 2026,
    isFiled: false,
    entry: { id: 'entry-1', date: new Date('2026-02-15'), description: 'Factura 2026-001' },
    ...overrides,
  };
}

function makeAccountingEntry(overrides: Partial<any> = {}) {
  return {
    id: 'entry-1',
    tenantId: TENANT_ID,
    date: new Date('2026-02-15'),
    description: 'Entry 1',
    status: 'POSTED',
    lines: [
      { id: 'line-1', debit: 0, credit: 5000, account: { code: '705', name: 'Prestaciones de servicios', type: 'INGRESO' } },
      { id: 'line-2', debit: 0, credit: 1050, account: { code: '477', name: 'IVA Repercutido', type: 'PASIVO' } },
      { id: 'line-3', debit: 6000, credit: 0, account: { code: '430', name: 'Clientes', type: 'ACTIVO' } },
    ],
    ...overrides,
  };
}

function makeExpenseEntry(overrides: Partial<any> = {}) {
  return {
    id: 'entry-2',
    tenantId: TENANT_ID,
    date: new Date('2026-02-20'),
    description: 'Expense 1',
    status: 'POSTED',
    lines: [
      { id: 'line-4', debit: 1200, credit: 0, account: { code: '629', name: 'Otros servicios', type: 'GASTO' } },
      { id: 'line-5', debit: 252, credit: 0, account: { code: '472', name: 'IVA Soportado', type: 'ACTIVO' } },
      { id: 'line-6', debit: 0, credit: 1452, account: { code: '410', name: 'Acreedores', type: 'PASIVO' } },
    ],
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<any> = {}) {
  return {
    id: 'inv-1',
    tenantId: TENANT_ID,
    contactId: 'contact-1',
    numero: 'FAC-2026-001',
    monto: 6000,
    fechaEmision: new Date('2026-02-15'),
    contact: {
      id: 'contact-1',
      nombre: 'Cliente UE S.L.',
      perfilFiscal: {
        idFiscal: 'DE123456789',
        idIntracomunitario: 'DE123456789',
        country: 'DE',
      },
    },
    ...overrides,
  };
}

function makeExpense(overrides: Partial<any> = {}) {
  return {
    id: 'exp-1',
    tenantId: TENANT_ID,
    supplierId: 'supplier-1',
    description: 'Servicio hosting Alemania',
    amount: 1500,
    date: new Date('2026-02-20'),
    supplier: { id: 'supplier-1', name: 'Proveedor DE GmbH', taxId: 'DE987654321', active: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// MODELO 111 — IRPF Retenciones
// ============================================================
describe('Modelo 111 — getQuarterlyIrpfReport', () => {
  it('debe retornar reporte vacío cuando no hay registros IRPF', async () => {
    mockTaxRecordFindMany.mockResolvedValue([]);

    const report = await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);

    expect(report.year).toBe(2026);
    expect(report.quarter).toBe(1);
    expect(report.totalRetentions).toBe(0);
    expect(report.retentions.base).toBe(0);
    expect(report.retentions.amount).toBe(0);
    expect(report.details).toEqual([]);
  });

  it('debe sumar correctamente las retenciones del trimestre', async () => {
    mockTaxRecordFindMany.mockResolvedValue([
      makeTaxRecord({ id: 'tr-1', baseAmount: 1000, taxAmount: 150, periodMonth: 1 }),
      makeTaxRecord({ id: 'tr-2', baseAmount: 2000, taxAmount: 300, periodMonth: 2 }),
      makeTaxRecord({ id: 'tr-3', baseAmount: 1500, taxAmount: 225, periodMonth: 3 }),
    ]);

    const report = await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);

    expect(report.totalRetentions).toBe(675); // 150 + 300 + 225
    expect(report.retentions.base).toBe(4500); // 1000 + 2000 + 1500
    expect(report.retentions.amount).toBe(675);
    expect(report.details).toHaveLength(3);
  });

  it('debe filtrar solo IRPF_RETENCION ignorando otros tipos', async () => {
    mockTaxRecordFindMany.mockResolvedValue([
      makeTaxRecord({ id: 'tr-1', type: 'IRPF_RETENCION', baseAmount: 1000, taxAmount: 150 }),
    ]);

    const report = await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);

    expect(report.totalRetentions).toBe(150);
    expect(report.details).toHaveLength(1);
    // Verificar que el query filtra por IRPF_RETENCION
    expect(mockTaxRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'IRPF_RETENCION',
        }),
      })
    );
  });

  it('debe incluir entry en los detalles', async () => {
    mockTaxRecordFindMany.mockResolvedValue([
      makeTaxRecord({ entry: { id: 'e1', date: new Date('2026-01-15'), description: 'Factura test' } }),
    ]);

    const report = await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);

    expect(report.details[0].entry.description).toBe('Factura test');
  });
});

describe('Modelo 111 — fileIrpfReturn', () => {
  it('debe marcar registros como presentados', async () => {
    mockTaxRecordUpdateMany.mockResolvedValue({ count: 3 });

    const result = await TaxService.fileIrpfReturn(TENANT_ID, 2026, 1);

    expect(mockTaxRecordUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          type: 'IRPF_RETENCION',
          isFiled: false,
        }),
        data: { isFiled: true },
      })
    );
  });
});

// ============================================================
// MODELO 130 — IRPF Pago Fraccionado
// ============================================================
describe('Modelo 130 — getQuarterlyModelo130Report', () => {
  it('debe retornar hasActivity=false cuando no hay asientos', async () => {
    mockAccountingEntryFindMany.mockResolvedValue([]);

    const report = await TaxService.getQuarterlyModelo130Report(TENANT_ID, 2026, 1);

    expect(report.hasActivity).toBe(false);
    expect(report.totalIncome).toBe(0);
    expect(report.totalExpenses).toBe(0);
    expect(report.resultToPay).toBe(0);
  });

  it('debe calcular (ingresos - gastos) * 0.20 correctamente', async () => {
    mockAccountingEntryFindMany.mockResolvedValue([
      makeAccountingEntry(),
      makeExpenseEntry(),
    ]);

    const report = await TaxService.getQuarterlyModelo130Report(TENANT_ID, 2026, 1);

    expect(report.totalIncome).toBe(5000);  // 705 credit
    expect(report.totalExpenses).toBe(1200); // 629 debit
    expect(report.netBase).toBe(3800);       // 5000 - 1200
    expect(report.paymentRate).toBe(0.20);
    expect(report.resultToPay).toBe(760);    // 3800 * 0.20
    expect(report.hasActivity).toBe(true);
  });

  it('debe ignorar asientos VOIDED', async () => {
    mockAccountingEntryFindMany.mockResolvedValue([]);

    const report = await TaxService.getQuarterlyModelo130Report(TENANT_ID, 2026, 1);

    expect(mockAccountingEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'VOIDED' },
        }),
      })
    );
  });

  it('debe retornar 0 si netBase es negativo (no procede pago)', async () => {
    mockAccountingEntryFindMany.mockResolvedValue([
      makeAccountingEntry({ lines: [{ id: 'l1', debit: 0, credit: 1000, account: { code: '705', name: 'Ingresos', type: 'INGRESO' } }] }),
      makeExpenseEntry({ lines: [{ id: 'l2', debit: 5000, credit: 0, account: { code: '629', name: 'Gastos', type: 'GASTO' } }] }),
    ]);

    const report = await TaxService.getQuarterlyModelo130Report(TENANT_ID, 2026, 1);

    expect(report.netBase).toBe(-4000);
    expect(report.resultToPay).toBe(0);
    expect(report.hasActivity).toBe(true);
  });

  it('debe agrupar detalles por cuenta contable', async () => {
    mockAccountingEntryFindMany.mockResolvedValue([
      makeAccountingEntry(),
    ]);

    const report = await TaxService.getQuarterlyModelo130Report(TENANT_ID, 2026, 1);

    expect(report.details.incomeAccounts).toHaveLength(1);
    expect(report.details.incomeAccounts[0].code).toBe('705');
    expect(report.details.incomeAccounts[0].amount).toBe(5000);
  });
});

describe('Modelo 130 — fileModelo130Return', () => {
  it('debe crear auditLog con accion MODELO_130_FILED', async () => {
    mockAuditLogCreate.mockResolvedValue({ id: 'log-1' });

    await TaxService.fileModelo130Return(TENANT_ID, 2026, 1, USER_ID);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        usuarioId: USER_ID,
        accion: 'MODELO_130_FILED',
        entidad: 'MODELO_130',
        entidadId: '2026_Q1',
        metadata: expect.objectContaining({ year: 2026, quarter: 1 }),
      },
    });
  });
});

// ============================================================
// MODELO 347 — Operaciones con Terceros
// ============================================================
const THRESHOLD = 3005.06;

describe('Modelo 347 — getAnnualModelo347Report', () => {
  it('debe retornar hasOperations=false cuando no hay facturas ni gastos', async () => {
    mockInvoiceFindMany.mockResolvedValue([]);
    mockExpenseFindMany.mockResolvedValue([]);

    const report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);

    expect(report.hasOperations).toBe(false);
    expect(report.totalOperations).toBe(0);
    expect(report.totalAmount).toBe(0);
  });

  it('debe incluir clientes cuya facturación supere el umbral', async () => {
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: 6000, contact: { id: 'c1', nombre: 'Cliente A', perfilFiscal: { idFiscal: 'B12345678', idIntracomunitario: null, country: 'ES' } } }),
    ]);
    mockExpenseFindMany.mockResolvedValue([]);

    const report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);

    expect(report.hasOperations).toBe(true);
    expect(report.totalClientAmount).toBe(6000);
    expect(report.operations).toHaveLength(1);
    expect(report.operations[0].counterpartyName).toBe('Cliente A');
    expect(report.operations[0].operationType).toBe('CLIENT');
  });

  it('debe filtrar clientes por debajo del umbral', async () => {
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: 1000, contact: { id: 'c1', nombre: 'Cliente Pequeño', perfilFiscal: { idFiscal: 'B87654321', idIntracomunitario: null, country: 'ES' } } }),
    ]);
    mockExpenseFindMany.mockResolvedValue([]);

    const report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);

    expect(report.totalOperations).toBe(0);
    expect(report.hasOperations).toBe(false);
  });

  it('debe incluir proveedores cuya facturación supere el umbral', async () => {
    mockInvoiceFindMany.mockResolvedValue([]);
    mockExpenseFindMany.mockResolvedValue([
      makeExpense({ amount: 4000, supplier: { id: 's1', name: 'Proveedor Grande', taxId: 'F12345678' } }),
    ]);

    const report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);

    expect(report.totalSupplierAmount).toBe(4000);
    expect(report.operations).toHaveLength(1);
    expect(report.operations[0].counterpartyName).toBe('Proveedor Grande');
    expect(report.operations[0].operationType).toBe('SUPPLIER');
  });

  it('debe combinar y ordenar clientes y proveedores por importe descendente', async () => {
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: 10000, contact: { id: 'c1', nombre: 'Gran Cliente', perfilFiscal: { idFiscal: 'A12345678', idIntracomunitario: null, country: 'ES' } } }),
    ]);
    mockExpenseFindMany.mockResolvedValue([
      makeExpense({ amount: 5000, supplier: { id: 's1', name: 'Proveedor Medio', taxId: 'B87654321' } }),
    ]);

    const report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);

    expect(report.operations).toHaveLength(2);
    expect(report.operations[0].totalAmount).toBeGreaterThanOrEqual(report.operations[1].totalAmount);
  });

  it('debe agregar múltiples facturas del mismo cliente', async () => {
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: 2000, contactId: 'c1', contact: { id: 'c1', nombre: 'Cliente A', perfilFiscal: { idFiscal: 'B12345678', idIntracomunitario: null, country: 'ES' } } }),
      makeInvoice({ id: 'inv-2', monto: 1500, contactId: 'c1', numero: 'FAC-2026-002', contact: { id: 'c1', nombre: 'Cliente A', perfilFiscal: { idFiscal: 'B12345678', idIntracomunitario: null, country: 'ES' } } }),
    ]);
    mockExpenseFindMany.mockResolvedValue([]);

    const report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);

    expect(report.totalClientAmount).toBe(3500);
    expect(report.operations[0].invoiceCount).toBe(2);
  });

  it('debe aplicar el umbral correcto de 3.005,06€', async () => {
    // Justo por encima del umbral
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: THRESHOLD + 0.01, contact: { id: 'c1', nombre: 'Justo Encima', perfilFiscal: { idFiscal: 'B12345678', idIntracomunitario: null, country: 'ES' } } }),
    ]);
    mockExpenseFindMany.mockResolvedValue([]);

    let report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);
    expect(report.totalOperations).toBe(1);

    // Justo por debajo del umbral
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: THRESHOLD - 0.01, contact: { id: 'c1', nombre: 'Justo Debajo', perfilFiscal: { idFiscal: 'B12345678', idIntracomunitario: null, country: 'ES' } } }),
    ]);

    report = await TaxService.getAnnualModelo347Report(TENANT_ID, 2026);
    expect(report.totalOperations).toBe(0);
  });
});

describe('Modelo 347 — fileModelo347Return', () => {
  it('debe crear auditLog anual sin quarter', async () => {
    mockAuditLogCreate.mockResolvedValue({ id: 'log-1' });

    await TaxService.fileModelo347Return(TENANT_ID, 2026, USER_ID);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        usuarioId: USER_ID,
        accion: 'MODELO_347_FILED',
        entidad: 'MODELO_347',
        entidadId: '2026',
        metadata: expect.objectContaining({ year: 2026 }),
      },
    });
  });
});

// ============================================================
// MODELO 349 — IVA Intracomunitario
// ============================================================
describe('Modelo 349 — getQuarterlyModelo349Report', () => {
  it('debe retornar hasOperations=false cuando no hay perfiles UE', async () => {
    mockPerfilFiscalClienteFindMany.mockResolvedValue([]);
    mockSupplierFindMany.mockResolvedValue([]);

    const report = await TaxService.getQuarterlyModelo349Report(TENANT_ID, 2026, 1);

    expect(report.hasOperations).toBe(false);
    expect(report.deliveryCount).toBe(0);
    expect(report.acquisitionCount).toBe(0);
  });

  it('debe detectar entregas a clientes UE con ID intracomunitario', async () => {
    mockPerfilFiscalClienteFindMany.mockResolvedValue([
      { contactId: 'contact-1', country: 'DE', idIntracomunitario: 'DE123456789', idFiscal: 'DE123456789' },
    ]);
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice(),
    ]);
    mockSupplierFindMany.mockResolvedValue([]);

    const report = await TaxService.getQuarterlyModelo349Report(TENANT_ID, 2026, 1);

    expect(report.hasOperations).toBe(true);
    expect(report.deliveryCount).toBe(1);
    expect(report.totalDeliveries).toBe(6000);
    expect(report.deliveries[0].clientCountry).toBe('DE');
    expect(report.deliveries[0].clientVatId).toBe('DE123456789');
  });

  it('debe ignorar perfiles UE sin idIntracomunitario', async () => {
    mockPerfilFiscalClienteFindMany.mockResolvedValue([]);
    mockInvoiceFindMany.mockResolvedValue([]);
    mockSupplierFindMany.mockResolvedValue([]);

    // Solo perfiles sin idIntracomunitario no deberían ser detectados
    mockPerfilFiscalClienteFindMany.mockResolvedValue([
      { contactId: 'contact-2', country: 'FR', idIntracomunitario: null, idFiscal: 'FR12345678901' },
    ]);

    const report = await TaxService.getQuarterlyModelo349Report(TENANT_ID, 2026, 1);

    expect(report.hasOperations).toBe(false);
  });

  it('debe detectar adquisiciones de proveedores UE por prefijo NIF', async () => {
    mockPerfilFiscalClienteFindMany.mockResolvedValue([]);
    mockSupplierFindMany.mockResolvedValue([
      { id: 'supplier-1', name: 'Proveedor DE GmbH', taxId: 'DE987654321', active: true },
    ]);
    mockExpenseFindMany.mockResolvedValue([
      makeExpense(),
    ]);

    const report = await TaxService.getQuarterlyModelo349Report(TENANT_ID, 2026, 1);

    expect(report.hasOperations).toBe(true);
    expect(report.acquisitionCount).toBe(1);
    expect(report.totalAcquisitions).toBe(1500);
    expect(report.acquisitions[0].supplierCountry).toBe('DE');
  });

  it('debe detectar operaciones mixtas (entregas + adquisiciones)', async () => {
    mockPerfilFiscalClienteFindMany.mockResolvedValue([
      { contactId: 'contact-1', country: 'FR', idIntracomunitario: 'FR12345678901', idFiscal: 'FR12345678901' },
    ]);
    mockInvoiceFindMany.mockResolvedValue([
      makeInvoice({ monto: 3000, contact: { id: 'contact-1', nombre: 'Cliente FR', perfilFiscal: null } }),
    ]);
    mockSupplierFindMany.mockResolvedValue([
      { id: 'supplier-1', name: 'Proveedor IT', taxId: 'IT12345678901', active: true },
    ]);
    mockExpenseFindMany.mockResolvedValue([
      makeExpense({ amount: 2000 }),
    ]);

    const report = await TaxService.getQuarterlyModelo349Report(TENANT_ID, 2026, 1);

    expect(report.deliveryCount).toBe(1);
    expect(report.acquisitionCount).toBe(1);
    expect(report.totalDeliveries).toBe(3000);
    expect(report.totalAcquisitions).toBe(2000);
  });
});

describe('Modelo 349 — fileModelo349Return', () => {
  it('debe crear auditLog con quarter incluido', async () => {
    mockAuditLogCreate.mockResolvedValue({ id: 'log-1' });

    await TaxService.fileModelo349Return(TENANT_ID, 2026, 2, USER_ID);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        usuarioId: USER_ID,
        accion: 'MODELO_349_FILED',
        entidad: 'MODELO_349',
        entidadId: '2026_Q2',
        metadata: expect.objectContaining({ year: 2026, quarter: 2 }),
      },
    });
  });
});

// ============================================================
// MODELO 390 — IVA Anual (Consolidación 4T)
// ============================================================
describe('Modelo 390 — getAnnualModelo390Report', () => {
  it('debe retornar hasActivity=false cuando no hay registros IVA', async () => {
    mockTaxRecordFindMany.mockResolvedValue([]);
    mockTaxRecordCount.mockResolvedValue(0);

    const report = await TaxService.getAnnualModelo390Report(TENANT_ID, 2026);

    expect(report.hasActivity).toBe(false);
    expect(report.annualOutputVatAmount).toBe(0);
    expect(report.annualInputVatAmount).toBe(0);
    expect(report.quarters).toHaveLength(4);
    expect(report.quartersFiled).toBe(4); // Sin registros → todos "presentados"
  });

  it('debe consolidar 4 trimestres correctamente', async () => {
    // Q1: output=1000, input=600, result=400
    // Q2: output=1200, input=700, result=500
    // Q3: output=800,  input=400, result=400
    // Q4: output=1500, input=900, result=600
    mockTaxRecordFindMany
      .mockResolvedValueOnce([
        { id: 't1', type: 'IVA_REPERCUTIDO', baseAmount: 5000, taxAmount: 1000, entry: null },
        { id: 't2', type: 'IVA_SOPORTADO', baseAmount: 3000, taxAmount: 600, entry: null },
      ])
      .mockResolvedValueOnce([
        { id: 't3', type: 'IVA_REPERCUTIDO', baseAmount: 6000, taxAmount: 1200, entry: null },
        { id: 't4', type: 'IVA_SOPORTADO', baseAmount: 3500, taxAmount: 700, entry: null },
      ])
      .mockResolvedValueOnce([
        { id: 't5', type: 'IVA_REPERCUTIDO', baseAmount: 4000, taxAmount: 800, entry: null },
        { id: 't6', type: 'IVA_SOPORTADO', baseAmount: 2000, taxAmount: 400, entry: null },
      ])
      .mockResolvedValueOnce([
        { id: 't7', type: 'IVA_REPERCUTIDO', baseAmount: 7500, taxAmount: 1500, entry: null },
        { id: 't8', type: 'IVA_SOPORTADO', baseAmount: 4500, taxAmount: 900, entry: null },
      ]);
    mockTaxRecordCount.mockResolvedValue(0); // Todos presentados

    const report = await TaxService.getAnnualModelo390Report(TENANT_ID, 2026);

    expect(report.hasActivity).toBe(true);
    expect(report.annualOutputVatAmount).toBe(4500);  // 1000+1200+800+1500
    expect(report.annualInputVatAmount).toBe(2600);   // 600+700+400+900
    expect(report.annualResult).toBe(1900);             // 4500-2600
    expect(report.annualOutputVatBase).toBe(22500);    // 5000+6000+4000+7500
    expect(report.annualInputVatBase).toBe(13000);     // 3000+3500+2000+4500
    expect(report.quartersFiled).toBe(4);
    expect(report.quarters).toHaveLength(4);
  });

  it('debe detectar trimestres no presentados', async () => {
    // Q1: unfiledCount=1 (no presentado), Q2-Q4: unfiledCount=0
    mockTaxRecordFindMany.mockResolvedValue([]);
    mockTaxRecordCount
      .mockResolvedValueOnce(1)  // Q1 unfiled = 1 → isFiled = false
      .mockResolvedValueOnce(0)  // Q2 unfiled = 0 → isFiled = true
      .mockResolvedValueOnce(0)  // Q3 unfiled = 0 → isFiled = true
      .mockResolvedValueOnce(0); // Q4 unfiled = 0 → isFiled = true

    const report = await TaxService.getAnnualModelo390Report(TENANT_ID, 2026);

    expect(report.quartersFiled).toBe(3);
    expect(report.quarters[0].isFiled).toBe(false);
    expect(report.quarters[1].isFiled).toBe(true);
    expect(report.quarters[2].isFiled).toBe(true);
    expect(report.quarters[3].isFiled).toBe(true);
  });
});

describe('Modelo 390 — fileModelo390Return', () => {
  it('debe crear auditLog anual sin quarter', async () => {
    mockAuditLogCreate.mockResolvedValue({ id: 'log-1' });

    await TaxService.fileModelo390Return(TENANT_ID, 2026, USER_ID);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        usuarioId: USER_ID,
        accion: 'MODELO_390_FILED',
        entidad: 'MODELO_390',
        entidadId: '2026',
        metadata: expect.objectContaining({ year: 2026 }),
      },
    });
  });
});

// ============================================================
// COMMON — Edge cases y data integrity
// ============================================================
describe('Common — Edge cases across all models', () => {
  it('getMonthsForQuarter debe rechazar trimestre inválido', async () => {
    // Esto prueba el método privado getMonthsForQuarter indirectamente
    // a través de getQuarterlyVatReport que lo usa
    mockTaxRecordFindMany.mockResolvedValue([]);
    
    // Trimestres válidos funcionan
    await expect(TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1)).resolves.toBeDefined();
    await expect(TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 4)).resolves.toBeDefined();
    
    // Trimestre inválido lanza error (getMonthsForQuarter lanza antes de Prisma)
    await expect(TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 5)).rejects.toThrow();
  });

  it('debe manejar userId vacío en fileModelo130Return', async () => {
    mockAuditLogCreate.mockResolvedValue({ id: 'log-1' });

    await TaxService.fileModelo130Return(TENANT_ID, 2026, 1);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: '',
      }),
    });
  });

  it('debe filtrar correctamente por tenantId en todos los métodos', async () => {
    mockTaxRecordFindMany.mockResolvedValue([]);
    mockAccountingEntryFindMany.mockResolvedValue([]);
    mockInvoiceFindMany.mockResolvedValue([]);
    mockExpenseFindMany.mockResolvedValue([]);
    mockPerfilFiscalClienteFindMany.mockResolvedValue([]);
    mockSupplierFindMany.mockResolvedValue([]);

    // Todos los métodos deben filtrar por tenantId
    await TaxService.getQuarterlyIrpfReport(TENANT_ID, 2026, 1);
    expect(mockTaxRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_ID }) })
    );

    await TaxService.getQuarterlyModelo130Report(TENANT_ID, 2026, 1);
    expect(mockAccountingEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_ID }) })
    );
  });
});
