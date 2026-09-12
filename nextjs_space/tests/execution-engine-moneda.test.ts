// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El dinero de los mensajes del agente.
 *
 * El motor respondía `Ingresos: 10.000 €` con el euro escrito a mano: un tenant
 * en pesos recibía euros en el chat aunque toda su plataforma estuviera en pesos.
 * Estos casos fijan las tres reglas que lo cierran —la divisa del dato manda, la
 * de la cuenta es el respaldo, y sin ninguna de las dos no se inventa una— y
 * además obligan a que la divisa llegue de verdad por el camino que usa el
 * chatbot, no solo por el formateador.
 */

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  invoiceAggregate: vi.fn(),
  expenseAggregate: vi.fn(),
  employeeFindMany: vi.fn(),
  productionLogFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    invoice: { aggregate: mocks.invoiceAggregate },
    expense: { aggregate: mocks.expenseAggregate },
    employee: { findMany: mocks.employeeFindMany },
    productionLog: { findMany: mocks.productionLogFindMany },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/security/vault', () => ({
  VaultService: { decrypt: vi.fn((s: string) => s.replace(/^enc:/, '')) },
}));

const { ExecutionEngine } = await import('@/lib/agents/execution-engine');
const { monedaDelTenant } = await import('@/lib/agents/moneda-tenant');
await import('@/lib/skills');

const TENANT = 'tenant-1';

/** Mensaje sin la barra de escape que añade el Markdown de Telegram. */
const plano = (mensaje: string) => mensaje.replace(/\\/g, '');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue({ moneda: 'MXN' } as any);
  mocks.invoiceAggregate.mockResolvedValue({ _sum: { monto: 10000 } } as any);
  mocks.expenseAggregate.mockResolvedValue({ _sum: { amount: 2000 } } as any);
  mocks.employeeFindMany.mockResolvedValue([]);
  mocks.productionLogFindMany.mockResolvedValue([]);
});

describe('ExecutionEngine.formatSkillResult — la divisa del dinero', () => {
  it('escribe en la divisa de la cuenta, con su convención', () => {
    const enPesos = plano(
      ExecutionEngine.formatSkillResult(
        'analyze_global_profitability',
        { revenue: 10000, expenses: 2000, margin: '80.00', status: 'SALUDABLE' },
        'MXN'
      )
    );
    expect(enPesos).toContain('$10,000.00');

    const enEuros = plano(
      ExecutionEngine.formatSkillResult(
        'analyze_global_profitability',
        { revenue: 10000, expenses: 2000, margin: '80.00', status: 'SALUDABLE' },
        'EUR'
      )
    );
    // El símbolo va separado por un espacio duro, así que se comprueba en dos
    // partes en vez de con un literal que dependa del tipo de espacio.
    expect(enEuros).toContain('10.000,00');
    expect(enEuros).toContain('€');
  });

  it('la divisa del propio dato gana sobre la de la cuenta', () => {
    const msg = plano(
      ExecutionEngine.formatSkillResult(
        'create_invoice',
        { numero: 'FAC-001', monto: 5000, moneda: 'USD' },
        'MXN'
      )
    );
    expect(msg).toContain('US$');
    expect(msg).not.toContain('$5,000.00');
  });

  it('sin divisa conocida no inventa una: escribe el número sin símbolo', () => {
    const msg = plano(
      ExecutionEngine.formatSkillResult('tax_prospector', {
        region: 'MX',
        estimatedLiability: '2100.00',
      })
    );
    expect(msg).toContain('2100,00');
    expect(msg).not.toContain('€');
    expect(msg).not.toContain('$');
  });

  it('un importe que el skill no trajo se declara «—» y no como cero', () => {
    const msg = plano(
      ExecutionEngine.formatSkillResult(
        'project_financial_forecast',
        { runwayDays: 120 },
        'EUR'
      )
    );
    expect(msg).toContain('Ingreso esperado: —');
    expect(msg).not.toContain('0,00');
  });

  it('los contadores y los porcentajes no se escriben como dinero', () => {
    const msg = plano(
      ExecutionEngine.formatSkillResult(
        'trial_balance',
        {
          report: {
            rows: [{ code: '100', name: 'Caja', debit: 1000, credit: 0 }],
            totalDebit: 1000,
            totalCredit: 1000,
          },
        },
        'MXN'
      )
    );
    expect(msg).toContain('debe $1,000.00');
    expect(msg).toContain('(1 cuentas)');
  });
});

describe('ExecutionEngine.run — la divisa llega al mensaje', () => {
  it('usa la divisa de la cuenta cuando el llamador no la pasa', async () => {
    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'analyze_global_profitability', params: { months: 3 } }] },
      userId: 'user-1',
      tenantId: TENANT,
    });

    const plano_ = plano(result.message);
    expect(plano_).toContain('Rentabilidad global');
    expect(plano_).toContain('$10,000.00');
    expect(plano_).not.toContain('€');
  });

  it('la divisa que pasa el llamador manda sobre la de la base de datos', async () => {
    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'analyze_global_profitability', params: { months: 3 } }] },
      userId: 'user-1',
      tenantId: TENANT,
      moneda: 'EUR',
    });

    const plano_ = plano(result.message);
    expect(plano_).toContain('10.000,00');
    expect(plano_).toContain('€');
    expect(plano_).not.toContain('$10,000.00');
    // Una sola lectura del tenant: la del skill que calcula el resumen. El motor
    // no vuelve a preguntar por una divisa que ya le dieron.
    expect(mocks.tenantFindUnique).toHaveBeenCalledTimes(1);
  });

  it('una cuenta sin divisa declarada recibe el número, pero no una inventada', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ moneda: null } as any);

    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'analyze_global_profitability', params: { months: 3 } }] },
      userId: 'user-1',
      tenantId: TENANT,
    });

    const plano_ = plano(result.message);
    expect(result.error).toBeFalsy();
    // El número con la convención de la plataforma, pero sin símbolo: la divisa
    // de un tenant no se supone, se lee.
    expect(plano_).toContain('10.000,00');
    expect(plano_).not.toContain('€');
    expect(plano_).not.toContain('$');
  });

  it('los importes del skill llegan al mensaje, no un guion', async () => {
    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'analyze_global_profitability', params: { months: 3 } }] },
      userId: 'user-1',
      tenantId: TENANT,
    });

    // El skill devuelve `{ content, data }`: sin desenvolver ese envoltorio el
    // mensaje salía con «Ingresos: —» aunque el dinero estuviera ahí al lado.
    expect(plano(result.message)).not.toContain('Ingresos: —');
    expect(plano(result.message)).not.toContain('Margen: —');
  });
});

describe('monedaDelTenant', () => {
  it('devuelve la divisa de la cuenta', async () => {
    expect(await monedaDelTenant(TENANT)).toBe('MXN');
  });

  it('devuelve vacío cuando la cuenta no declara divisa', async () => {
    mocks.tenantFindUnique.mockResolvedValue({ moneda: null } as any);
    expect(await monedaDelTenant(TENANT)).toBe('');
  });

  it('devuelve vacío, sin lanzar, cuando no hay a quién preguntar', async () => {
    expect(await monedaDelTenant('')).toBe('');
    mocks.tenantFindUnique.mockRejectedValue(new Error('caída'));
    expect(await monedaDelTenant(TENANT)).toBe('');
  });
});
