// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  calendarSummary: vi.fn(),
  vatReport: vi.fn(),
  irpfReport: vi.fn(),
  modelo115: vi.fn(),
  modelo130: vi.fn(),
  modelo180: vi.fn(),
  modelo347: vi.fn(),
  modelo349: vi.fn(),
  modelo390: vi.fn(),
  file303: vi.fn(),
  file111: vi.fn(),
  file115: vi.fn(),
  file130: vi.fn(),
  file180: vi.fn(),
  file347: vi.fn(),
  file349: vi.fn(),
  file390: vi.fn(),
}));

vi.mock('@/lib/accounting/fiscal-calendar-service', () => ({
  FiscalCalendarService: { getCalendarSummary: mocks.calendarSummary },
}));

vi.mock('@/lib/accounting/tax-service', () => ({
  TaxService: {
    getQuarterlyVatReport: mocks.vatReport,
    getQuarterlyIrpfReport: mocks.irpfReport,
    getQuarterlyModelo115Report: mocks.modelo115,
    getQuarterlyModelo130Report: mocks.modelo130,
    getAnnualModelo180Report: mocks.modelo180,
    getAnnualModelo347Report: mocks.modelo347,
    getQuarterlyModelo349Report: mocks.modelo349,
    getAnnualModelo390Report: mocks.modelo390,
    fileVatReturn: mocks.file303,
    fileIrpfReturn: mocks.file111,
    fileModelo115Return: mocks.file115,
    fileModelo130Return: mocks.file130,
    fileModelo180Return: mocks.file180,
    fileModelo347Return: mocks.file347,
    fileModelo349Return: mocks.file349,
    fileModelo390Return: mocks.file390,
  },
}));

const { financeIntents } = await import('@/lib/agents/intents/finance-intents');
const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const { consultaImpuestosPendientes, resumenModeloImpuesto, marcarImpuestoPresentado } = await import('@/lib/skills/tax-skills');

const TENANT = 'tenant-tax-1';
const classifier = new IntentClassifierAgent();
const base = { userId: 'u1', tenantId: TENANT };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. Schema ──────────────────────────────────────────────────────────────

describe('intents de impuestos — schema', () => {
  it('impuestos_pendientes no exige parámetros', () => {
    const i = financeIntents.find(x => x.name === 'impuestos_pendientes')!;
    expect(i).toBeDefined();
    expect(i.requiredParams).toEqual([]);
  });

  it('resumen_impuesto exige modelo', () => {
    const i = financeIntents.find(x => x.name === 'resumen_impuesto')!;
    expect(i).toBeDefined();
    expect(i.requiredParams).toEqual(['modelo']);
    expect(i.optionalParams).toEqual(expect.arrayContaining(['trimestre', 'anio']));
  });
});

// ─── 2. Clasificador determinista ───────────────────────────────────────────

describe('clasificador — impuestos pendientes', () => {
  it('"qué impuestos tengo que declarar" → impuestos_pendientes (sin LLM)', async () => {
    const result = await classifier.classify({ ...base, message: 'qué impuestos tengo que declarar' });
    expect(result.intent).toBe('impuestos_pendientes');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.needsMoreInfo).toBe(false);
  });

  it('"qué vence este mes" → impuestos_pendientes', async () => {
    const result = await classifier.classify({ ...base, message: 'qué vence este mes' });
    expect(result.intent).toBe('impuestos_pendientes');
  });

  it('"dame mi calendario fiscal" → impuestos_pendientes', async () => {
    const result = await classifier.classify({ ...base, message: 'dame mi calendario fiscal' });
    expect(result.intent).toBe('impuestos_pendientes');
  });

  it('"modelos por presentar" → impuestos_pendientes', async () => {
    const result = await classifier.classify({ ...base, message: 'modelos por presentar' });
    expect(result.intent).toBe('impuestos_pendientes');
  });
});

describe('clasificador — resumen de impuesto', () => {
  it('"modelo 303 del tercer trimestre" → resumen_impuesto con modelo y trimestre', async () => {
    const result = await classifier.classify({ ...base, message: 'dame el modelo 303 del tercer trimestre' });
    expect(result.intent).toBe('resumen_impuesto');
    expect(result.extractedParams.modelo).toBe('303');
    expect(result.extractedParams.trimestre).toBe(3);
  });

  it('"cuánto IVA tengo que pagar este trimestre" → resumen_impuesto (303 por keyword)', async () => {
    const result = await classifier.classify({ ...base, message: 'cuánto IVA tengo que pagar este trimestre' });
    expect(result.intent).toBe('resumen_impuesto');
    expect(result.extractedParams.modelo).toBe('303');
  });

  it('"retenciones de IRPF del segundo trimestre" → resumen_impuesto (111)', async () => {
    const result = await classifier.classify({ ...base, message: 'retenciones de IRPF del segundo trimestre' });
    expect(result.intent).toBe('resumen_impuesto');
    expect(result.extractedParams.modelo).toBe('111');
    expect(result.extractedParams.trimestre).toBe(2);
  });

  it('"modelo 180 del 2026" → resumen_impuesto con año', async () => {
    const result = await classifier.classify({ ...base, message: 'modelo 180 del 2026' });
    expect(result.intent).toBe('resumen_impuesto');
    expect(result.extractedParams.modelo).toBe('180');
    expect(result.extractedParams.anio).toBe('2026');
  });

  it('"modelo 115 de este trimestre" → resumen_impuesto sin trimestre explícito', async () => {
    const result = await classifier.classify({ ...base, message: 'modelo 115 de este trimestre' });
    expect(result.intent).toBe('resumen_impuesto');
    expect(result.extractedParams.modelo).toBe('115');
  });
});

// ─── 3. Skills ──────────────────────────────────────────────────────────────

describe('consultaImpuestosPendientes', () => {
  it('devuelve el resumen del calendario fiscal', async () => {
    mocks.calendarSummary.mockResolvedValue({
      upcomingDeadlines: [{ model: '303', name: 'IVA Trimestral', periodLabel: 'T2 2026', dueDate: new Date('2026-07-20'), daysUntilDue: 5, estimatedAmount: 1200 }],
      overdueDeadlines: [],
      nextDeadline: { model: '303' },
      totalPending: 1,
      totalOverdue: 0,
    });
    const out = await consultaImpuestosPendientes({ tenantId: TENANT });
    expect(mocks.calendarSummary).toHaveBeenCalledWith(TENANT);
    expect(out.upcoming).toHaveLength(1);
    expect(out.upcoming[0].model).toBe('303');
    expect(out.totalPending).toBe(1);
  });
});

describe('resumenModeloImpuesto', () => {
  it('modelo 303 → reporte trimestral de IVA con trimestre por defecto', async () => {
    mocks.vatReport.mockResolvedValue({ year: 2026, quarter: 2, outputVat: { base: 1000, amount: 210 }, inputVat: { base: 500, amount: 105 }, equivalenceSurcharge: { base: 0, amount: 0 }, result: 105 });
    const out = await resumenModeloImpuesto({ tenantId: TENANT, modelo: '303', trimestre: 2, anio: 2026 });
    expect(mocks.vatReport).toHaveBeenCalledWith(TENANT, 2026, 2);
    expect(out.modelo).toBe('303');
    expect(out.report.result).toBe(105);
  });

  it('modelo 111 → retenciones IRPF', async () => {
    mocks.irpfReport.mockResolvedValue({ year: 2026, quarter: 1, retentions: { base: 2000, amount: 300 }, totalRetentions: 300 });
    const out = await resumenModeloImpuesto({ tenantId: TENANT, modelo: '111', trimestre: 1, anio: 2026 });
    expect(mocks.irpfReport).toHaveBeenCalledWith(TENANT, 2026, 1);
    expect(out.report.totalRetentions).toBe(300);
  });

  it('modelo 180 → reporte anual', async () => {
    mocks.modelo180.mockResolvedValue({ year: 2026, totalLandlords: 2, totalRentBase: 10000, totalRetentions: 1900, hasActivity: true });
    const out = await resumenModeloImpuesto({ tenantId: TENANT, modelo: '180', anio: 2026 });
    expect(mocks.modelo180).toHaveBeenCalledWith(TENANT, 2026);
    expect(out.report.totalRetentions).toBe(1900);
    expect(out.trimestre).toBeUndefined();
  });

  it('modelo desconocido → error informativo', async () => {
    await expect(resumenModeloImpuesto({ tenantId: TENANT, modelo: '999' })).rejects.toThrow(/Indica qué impuesto consultar/);
  });
});

describe('marcarImpuestoPresentado', () => {
  it('modelo 303 → fileVatReturn con trimestre/año', async () => {
    mocks.file303.mockResolvedValue({ count: 4 });
    const out = await marcarImpuestoPresentado({ tenantId: TENANT, modelo: '303', trimestre: 3, anio: 2026 });
    expect(mocks.file303).toHaveBeenCalledWith(TENANT, 2026, 3);
    expect(out.actualizados).toBe(4);
    expect(out.trimestre).toBe(3);
  });

  it('modelo 180 → fileModelo180Return sin trimestre', async () => {
    mocks.file180.mockResolvedValue({ count: 2 });
    const out = await marcarImpuestoPresentado({ tenantId: TENANT, modelo: '180', anio: 2026 });
    expect(mocks.file180).toHaveBeenCalledWith(TENANT, 2026, undefined);
    expect(out.trimestre).toBeUndefined();
    expect(out.nombre).toContain('Arrendamientos');
  });

  it('modelo desconocido → error informativo', async () => {
    await expect(marcarImpuestoPresentado({ tenantId: TENANT, modelo: '999' })).rejects.toThrow(/Modelo no reconocido|Indica qué modelo/);
  });
});
