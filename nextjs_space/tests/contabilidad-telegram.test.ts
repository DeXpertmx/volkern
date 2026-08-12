// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  balanceSheet: vi.fn(),
  pyg: vi.fn(),
  trialBalance: vi.fn(),
}));

vi.mock('@/lib/accounting/reports/balance-sheet', () => ({
  getBalanceSheet: mocks.balanceSheet,
}));

vi.mock('@/lib/accounting/reports/pyg', () => ({
  getPyG: mocks.pyg,
}));

vi.mock('@/lib/accounting/reports/trial-balance', () => ({
  getTrialBalance: mocks.trialBalance,
}));

const { financeIntents } = await import('@/lib/agents/intents/finance-intents');
const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const {
  informeBalance,
  informeCuentaResultados,
  informeBalanceComprobacion,
} = await import('@/lib/skills/accounting-skills');

const TENANT = 'tenant-contab-1';
const classifier = new IntentClassifierAgent();
const base = { userId: 'u1', tenantId: TENANT };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. Schema ──────────────────────────────────────────────────────────────

describe('intents de contabilidad — schema', () => {
  it('balance_general, cuenta_resultados y balance_comprobacion sin parámetros requeridos', () => {
    for (const name of ['balance_general', 'cuenta_resultados', 'balance_comprobacion']) {
      const i = financeIntents.find(x => x.name === name)!;
      expect(i).toBeDefined();
      expect(i.requiredParams).toEqual([]);
    }
  });

  it('marcar_impuesto_presentado exige modelo', () => {
    const i = financeIntents.find(x => x.name === 'marcar_impuesto_presentado')!;
    expect(i).toBeDefined();
    expect(i.requiredParams).toEqual(['modelo']);
  });
});

// ─── 2. Clasificador determinista ───────────────────────────────────────────

describe('clasificador — contabilidad', () => {
  it('"dame el balance general" → balance_general', async () => {
    const result = await classifier.classify({ ...base, message: 'dame el balance general' });
    expect(result.intent).toBe('balance_general');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('"cómo está mi balance de situación" → balance_general', async () => {
    const result = await classifier.classify({ ...base, message: 'cómo está mi balance de situación' });
    expect(result.intent).toBe('balance_general');
  });

  it('"dame el balance de comprobación" → balance_comprobacion (no balance_general)', async () => {
    const result = await classifier.classify({ ...base, message: 'dame el balance de comprobación' });
    expect(result.intent).toBe('balance_comprobacion');
  });

  it('"la comprobación de sumas y saldos" → balance_comprobacion', async () => {
    const result = await classifier.classify({ ...base, message: 'la comprobación de sumas y saldos' });
    expect(result.intent).toBe('balance_comprobacion');
  });

  it('"dame la cuenta de resultados" → cuenta_resultados', async () => {
    const result = await classifier.classify({ ...base, message: 'dame la cuenta de resultados' });
    expect(result.intent).toBe('cuenta_resultados');
  });

  it('"cuánto gané este mes" → cuenta_resultados', async () => {
    const result = await classifier.classify({ ...base, message: 'cuánto gané este mes' });
    expect(result.intent).toBe('cuenta_resultados');
  });
});

describe('clasificador — marcar impuesto como presentado', () => {
  it('"marca como presentado el modelo 303 del tercer trimestre" → marcar_impuesto_presentado', async () => {
    const result = await classifier.classify({ ...base, message: 'marca como presentado el modelo 303 del tercer trimestre' });
    expect(result.intent).toBe('marcar_impuesto_presentado');
    expect(result.extractedParams.modelo).toBe('303');
    expect(result.extractedParams.trimestre).toBe(3);
  });

  it('"presenté el modelo 111 del trimestre" → marcar_impuesto_presentado', async () => {
    const result = await classifier.classify({ ...base, message: 'presenté el modelo 111 del trimestre' });
    expect(result.intent).toBe('marcar_impuesto_presentado');
    expect(result.extractedParams.modelo).toBe('111');
  });

  it('"marca presentada la declaración del 115" → marcar_impuesto_presentado (sin la palabra modelo)', async () => {
    const result = await classifier.classify({ ...base, message: 'marca presentada la declaración del 115' });
    expect(result.intent).toBe('marcar_impuesto_presentado');
    expect(result.extractedParams.modelo).toBe('115');
  });
});

// ─── 3. Skills ──────────────────────────────────────────────────────────────

describe('skills de contabilidad', () => {
  it('informeBalance delega en getBalanceSheet', async () => {
    mocks.balanceSheet.mockResolvedValue({
      activo: { sections: [{ label: 'A) Activo No Corriente', accounts: [], total: 1000 }], total: 1000 },
      pasivo: { sections: [{ label: 'A) Patrimonio Neto', accounts: [], total: 1000 }], total: 1000 },
    });
    const out = await informeBalance({ tenantId: TENANT });
    expect(mocks.balanceSheet).toHaveBeenCalledWith(TENANT);
    expect(out.report.activo.total).toBe(1000);
    expect(out.tipo).toBe('balance');
  });

  it('informeCuentaResultados delega en getPyG', async () => {
    mocks.pyg.mockResolvedValue({ sections: [], totalGastos: 400, totalIngresos: 1200, resultadoEjercicio: 800 });
    const out = await informeCuentaResultados({ tenantId: TENANT });
    expect(mocks.pyg).toHaveBeenCalledWith(TENANT);
    expect(out.report.resultadoEjercicio).toBe(800);
  });

  it('informeBalanceComprobacion delega en getTrialBalance', async () => {
    mocks.trialBalance.mockResolvedValue({ rows: [{ code: '572', name: 'Bancos', debit: 500, credit: 0 }], totalDebit: 500, totalCredit: 500 });
    const out = await informeBalanceComprobacion({ tenantId: TENANT });
    expect(mocks.trialBalance).toHaveBeenCalledWith(TENANT);
    expect(out.report.totalDebit).toBe(500);
  });
});
