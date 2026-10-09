import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * La divisa de las escrituras de ERP sale del tenant.
 *
 * Gastos y nómina hacían `body.currency || 'EUR'`: cuando el usuario no elegía
 * divisa, el registro nacía en euros porque `'EUR'` es el valor por defecto de la
 * columna (`Expense.currency`, `Project.currency`, `PayrollRecord.currency`), no
 * una decisión de negocio. Un tenant con la moneda en pesos guardaba sus gastos y
 * sus nóminas en euros.
 *
 * Ahora la cadena es la de la plataforma (`monedaEscritura`): lo que el usuario
 * eligió, si no la moneda de reporte del tenant (`Tenant.moneda`), y solo si no
 * hay ninguna de las dos, el mínimo que el esquema exige.
 */

const { prismaMock, createExpenseMock, tenantHolder } = vi.hoisted(() => ({
  tenantHolder: { moneda: 'USD' as string | null },
  createExpenseMock: vi.fn(),
  prismaMock: {
    expense: { findFirst: vi.fn() },
    configuracionFiscalEmisor: { findFirst: vi.fn() },
    payrollRecord: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('@/lib/skills', () => ({
  skills: { create_expense: (...args: any[]) => createExpenseMock(...args) },
}));

/**
 * La conciliación con el pedido de compra tiene sus PROPIAS pruebas
 * (`compras-conciliacion*.test.ts`) y toca modelos que este test no declara
 * (`compra`, `compraItem`, `supplier`…). Aquí se mide la DIVISA con la que se
 * escribe el gasto: sin mockear el servicio, la ruta moría en el paso de la
 * conciliación (500) y nunca llegaba al skill, así que la comprobación no
 * llegaba a ejercerse.
 *
 * El resultado es «ningún pedido candidato»: el camino que sigue al skill.
 */
vi.mock('@/lib/compras/service', () => ({
  ErrorCompra: class ErrorCompra extends Error {
    codigo = 'OTRO' as const;
  },
  statusDeErrorCompra: () => 400,
  conciliarFacturaConCompra: vi.fn(),
  sugerirConciliacionParaFactura: vi.fn().mockResolvedValue({
    emparejamiento: { estado: 'ninguna' },
    candidatos: [],
  }),
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: Request) =>
    handler(request, {
      valid: true,
      tenant: { id: 'tenant-1', moneda: tenantHolder.moneda },
      user: { id: 'user-1' },
      db: { user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }) } },
    }),
}));

import { POST as crearGasto } from '@/app/api/erp/expenses/route';
import { POST as crearNomina } from '@/app/api/erp/finance/payroll/route';

function peticion(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const peticionDeGasto = (extra: Record<string, unknown> = {}) =>
  peticion('https://volkern.app/api/erp/expenses', {
    description: 'Material de obra',
    amount: '100',
    supplierId: 'sup-1',
    ...extra,
  });

const peticionDeNomina = (extra: Record<string, unknown> = {}) =>
  peticion('https://volkern.app/api/erp/finance/payroll', {
    employeeName: 'Ana Pérez',
    amount: '2000',
    period: '2026-09',
    ...extra,
  });

describe('ERP: la divisa de las escrituras sale del tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantHolder.moneda = 'USD';
    prismaMock.expense.findFirst.mockResolvedValue(null);
    prismaMock.configuracionFiscalEmisor.findFirst.mockResolvedValue(null);
    createExpenseMock.mockResolvedValue({ id: 'exp-1' });
    prismaMock.payrollRecord.create.mockResolvedValue({ id: 'pay-1' });
  });

  it('un gasto sin divisa toma la moneda del tenant', async () => {
    await crearGasto(peticionDeGasto(), undefined as any);

    expect(createExpenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD' }),
    );
  });

  it('la divisa que elige el usuario gana sobre la del tenant', async () => {
    await crearGasto(peticionDeGasto({ currency: 'EUR' }), undefined as any);

    expect(createExpenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'EUR' }),
    );
  });

  it('una nómina sin divisa toma la moneda del tenant', async () => {
    await crearNomina(peticionDeNomina(), undefined as any);

    expect(prismaMock.payrollRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD' }),
      }),
    );
  });

  it('una nómina con divisa indicada la respeta', async () => {
    await crearNomina(peticionDeNomina({ currency: 'EUR' }), undefined as any);

    expect(prismaMock.payrollRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'EUR' }),
      }),
    );
  });

  it('sin moneda en el tenant cae al mínimo del esquema, no a EUR', async () => {
    tenantHolder.moneda = null;

    await crearGasto(peticionDeGasto(), undefined as any);

    expect(createExpenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'MXN' }),
    );
  });
});
