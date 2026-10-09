// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardia del enlace con el ERP (FASE 3.B, última casilla del plan):
 *  - "Sin duplicar entidades": los gastos viven en `Expense` del ERP con su
 *    desglose fiscal (Verifactu: base, IVA, retenciones) y se atribuyen a la
 *    reserva con una FK opcional — no hay una segunda tabla de gastos.
 *  - La API del ERP valida la reserva (existencia + tenant) al imputar y el
 *    listado filtra por reserva.
 *  - Finanzas alimenta `otrosGastos` del módulo puro con los gastos ERP: el
 *    neto y el margen reflejan el coste real. El IVA viaja informativo.
 *  - Aislamiento multi-tenant en ambos lados.
 */

const mocks = vi.hoisted(() => ({
  expense: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  hospitalityReservationItem: { findMany: vi.fn() },
  hospitalityPayment: { findMany: vi.fn(), create: vi.fn() },
  supplier: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn() },
  configuracionFiscalEmisor: { findFirst: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
  create_expense: vi.fn(),
  authenticateRequest: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    expense: mocks.expense,
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
    hospitalityPayment: mocks.hospitalityPayment,
    supplier: mocks.supplier,
    tenant: mocks.tenant,
    configuracionFiscalEmisor: mocks.configuracionFiscalEmisor,
    user: mocks.user,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
  // La ruta del ERP usa withTenantAuth (mismo módulo): envolver authenticateRequest.
  withTenantAuth: (handler: any) => (request: any) => {
    const url = new URL(request.url);
    return handler(request, { ...auth, tenant: auth.tenant, user: auth.user, db: null });
  },
}));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/skills', () => ({
  skills: { create_expense: mocks.create_expense },
}));

/**
 * La conciliación con el pedido de compra tiene sus PROPIAS pruebas
 * (`compras-conciliacion*.test.ts`) y toca modelos que este test no declara
 * (`compra`, `compraItem`…). Aquí se mide la imputación a la reserva de
 * hospitality: sin mockear el servicio, la ruta moría en el paso de la
 * conciliación (500) y no llegaba ni a validar la reserva.
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

import { GET, POST } from '@/app/api/hospitality/finanzas/route';
import { POST as erpPOST, GET as erpGET } from '@/app/api/erp/expenses/route';
import { calcularRentabilidad } from '@/lib/hospitality/finance';

const auth = { valid: true, tenant: { id: 'tenant_a' }, user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } };
const authErp = { ...auth, db: null };
const request = (method: string, body?: unknown, url = 'http://test.local/api/hospitality/finanzas') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('API del ERP — imputar gasto a una reserva de hospitality', () => {
  const erpBody = {
    description: 'Limpieza externa post-estancia',
    amount: '25',
    supplierId: 'sup_1',
    hospitalityReservationId: 'res_a',
    category: 'Limpieza',
  };

  it('acepta hospitalityReservationId y lo pasa al skill', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({ id: 'res_a', externalBookingId: 'BK-1' });
    mocks.user.findUnique.mockResolvedValue({ email: 'a@b.c' });
    mocks.user.findFirst.mockResolvedValue({ id: 'user_a' });
    mocks.expense.findFirst.mockResolvedValue(null); // sin duplicados
    mocks.supplier.findUnique.mockResolvedValue(null);
    mocks.configuracionFiscalEmisor.findFirst.mockResolvedValue(null);
    mocks.create_expense.mockResolvedValue({ id: 'exp_1', status: 'PAID', amount: 25 });

    const res = await erpPOST(request('POST', erpBody, 'http://test.local/api/erp/expenses'), authErp as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    // La validación de la reserva ocurre antes de crear el gasto.
    expect(mocks.hospitalityReservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res_a', tenantId: 'tenant_a' } })
    );
    expect(mocks.create_expense).toHaveBeenCalledWith(
      expect.objectContaining({ hospitalityReservationId: 'res_a' })
    );
    expect(data.id).toBe('exp_1');
  });

  it('rechaza una reserva de OTRO tenant: 404 y sin crear gasto', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(null);

    const res = await erpPOST(request('POST', erpBody, 'http://test.local/api/erp/expenses'), authErp as any);

    expect(res.status).toBe(404);
    expect(mocks.create_expense).not.toHaveBeenCalled();
  });

  it('el listado del ERP filtra por hospitalityReservationId e incluye la reserva', async () => {
    mocks.expense.findMany.mockResolvedValue([]);
    mocks.user.findUnique.mockResolvedValue({ baseLatitude: null, baseLongitude: null });
    // prisma.tenant.findUnique del GET:
    const prismaAny = await import('@/lib/db');
    (prismaAny.prisma as any).tenant = { findUnique: vi.fn().mockResolvedValue(null) };

    await erpGET(request('GET', undefined, 'http://test.local/api/erp/expenses?hospitalityReservationId=res_a'), authErp as any);

    const args = mocks.expense.findMany.mock.calls[0][0];
    expect(args.where.hospitalityReservationId).toBe('res_a');
    expect(args.include.hospitalityReservation).toBeDefined();
  });
});

describe('Finanzas — los gastos ERP entran al cálculo por el módulo puro', () => {
  const reservaConGasto = {
    id: 'res_a',
    tenantId: 'tenant_a',
    externalBookingId: 'BK-1',
    channel: 'Airbnb',
    estado: 'confirmed',
    checkIn: new Date('2026-09-10T15:00:00'),
    checkOut: new Date('2026-09-15T11:00:00'),
    amountAfterTax: 700,
    currency: 'EUR',
    commission: 105,
    propertyId: 'prop_a',
    unitId: 'unit_a',
    guestData: { firstName: 'Ana' },
    items: [{ tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 1, importeUnitario: 700, importeTotal: 700 }],
    payments: [{ importe: 700, estado: 'pagado', metodo: 'stripe' }],
    // Gastos ERP atribuidos con desglose fiscal Verifactu.
    expenses: [
      { id: 'g1', description: 'Limpieza externa', amount: 25, currency: 'EUR', category: 'Limpieza', taxableBase: 20.66, vatRate: 21, vatAmount: 4.34, supplier: { name: 'CleanCo' } },
      { id: 'g2', description: 'Reparación persiana', amount: 40, currency: 'EUR', category: 'Mantenimiento', taxableBase: null, vatRate: null, vatAmount: null, supplier: null },
    ],
    unit: { id: 'unit_a', nombre: 'Suite 1', codigo: 'S1' },
    property: { id: 'prop_a', nombre: 'Hotel Centro' },
  };

  it('neto = bruto - comisión OTA - gastos ERP; margen refleja el coste real', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaConGasto]);

    const res = await GET(request('GET'));
    const data = await res.json();
    const r = data.reservas[0];

    // El cálculo lo hace el módulo puro: 700 - 105 - 65 = 530 (antes del
    // enlace ERP el neto era 595: el margen ahora refleja el coste real).
    expect(r.otrosGastos).toBe(65);
    expect(r.neto).toBe(530);
    expect(r.margenPct).toBeCloseTo((530 / 700) * 100, 2);
    expect(r.estadoCobro).toBe('pagado'); // el cobro no cambia por los gastos

    // El desglose fiscal viaja informativo (IVA soportado, no descuenta).
    expect(r.gastosErp).toHaveLength(2);
    expect(r.gastosErp[0]).toMatchObject({
      descripcion: 'Limpieza externa',
      proveedor: 'CleanCo',
      ivaPct: 21,
      ivaCuota: 4.34,
    });
  });

  it('la rentabilidad con gastos ERP cuadra con el módulo puro (contrato)', () => {
    const rent = calcularRentabilidad({
      lineas: [{ tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 1, importeUnitario: 700, importeTotal: 700 }],
      pagos: [{ importe: 700, estado: 'pagado' }],
      comisionOta: 105,
      otrosGastos: [{ concepto: 'Limpieza externa', importe: 25 }, { concepto: 'Reparación', importe: 40 }],
      moneda: 'EUR',
    });
    expect(rent.bruto).toBe(700);
    expect(rent.otrosGastos).toBe(65);
    expect(rent.neto).toBe(530);
    // Criterio 3 del plan: líneas = bruto = neto + comisiones + gastos.
    expect(rent.neto + rent.comisionOta + rent.otrosGastos).toBe(rent.bruto);
  });

  it('sin gastos ERP, el desglose sigue funcionando (otrosGastos = 0)', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      { ...reservaConGasto, expenses: [] },
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();
    const r = data.reservas[0];

    expect(r.otrosGastos).toBe(0);
    expect(r.neto).toBe(595);
    expect(r.gastosErp).toHaveLength(0);
  });
});

describe('Guardia de diseño — sin entidades duplicadas', () => {
  it('el enlace es una FK opcional en Expense, no una tabla nueva', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const schema = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
    // FK presente en Expense…
    expect(schema).toMatch(/hospitalityReservationId String\?/);
    expect(schema).toMatch(/relation\("ExpenseHospitalityReservation"/);
    // …y NO existe una tabla paralela de gastos de hospitality.
    expect(schema).not.toMatch(/model HospitalityExpense\b/);
    expect(schema).not.toMatch(/model HospitalityUnitExpense\b/);
  });

  it('el impuesto del gasto sigue siendo responsabilidad del ERP (Verifactu), no de hospitality', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const ruta = fs.readFileSync(path.resolve(__dirname, '../app/api/hospitality/finanzas/route.ts'), 'utf8');
    // Finanzas LEE el desglose fiscal del gasto; no recalcula IVA.
    expect(ruta).toContain('vatAmount');
    expect(ruta).not.toMatch(/vatRate\s*\*\s*/);
    expect(ruta).not.toMatch(/\*\s*0\.21/);
  });
});
