// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardia de la FASE 3.B (Finanzas de hospitality).
 *
 * Reglas del plan que protege:
 * 1. TODO el cálculo (bruto, desglose, comisiones, neto, margen, cobrado,
 *    pendiente y estado de cobro) sale del módulo puro `lib/hospitality/finance.ts`.
 *    La API no puede llevar aritmética por su cuenta (sería una segunda verdad).
 * 2. El estado de cobro se DERIVA de los pagos; nunca se guarda ni se adivina.
 * 3. Aislamiento multi-tenant en lecturas y en la creación de pagos.
 * 4. Una reserva de canal sin líneas no pierde rentabilidad: se usa
 *    `lineasDesdeImporteExterno` con `amountAfterTax`.
 * 5. Las canceladas / no-show no aportan ingreso al desglose.
 */

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn(), findFirst: vi.fn() },
  hospitalityReservationItem: { findMany: vi.fn() },
  hospitalityPayment: { findMany: vi.fn(), create: vi.fn() },
  authenticateRequest: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
    hospitalityPayment: mocks.hospitalityPayment,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));

// El módulo puro NO se mockea: es la unidad bajo contrato. Si la API dejara de
// llamarlo, la aserción "el cálculo vive en el módulo puro" falla.
import { GET, POST } from '@/app/api/hospitality/finanzas/route';
import { calcularRentabilidad, lineasDesdeImporteExterno } from '@/lib/hospitality/finance';

const auth = {
  valid: true,
  tenant: { id: 'tenant_a' },
  user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
};

const request = (method: string, body?: unknown, url = 'http://test.local/api/hospitality/finanzas') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const reserva = (overrides: Record<string, unknown> = {}) => ({
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
  guestData: { firstName: 'Ana', lastName: 'García' },
  items: [
    { tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 1, importeUnitario: 600, importeTotal: 600 },
    { tipo: 'limpieza', concepto: 'Limpieza', cantidad: 1, importeUnitario: 60, importeTotal: 60 },
    { tipo: 'extra', concepto: 'Cuna', cantidad: 1, importeUnitario: 40, importeTotal: 40 },
  ],
  payments: [{ importe: 700, estado: 'pagado', metodo: 'stripe' }],
  // Gastos ERP atribuidos (enlace FASE 3.B); vacío por defecto.
  expenses: [],
  unit: { id: 'unit_a', nombre: 'Suite 1', codigo: 'S1' },
  property: { id: 'prop_a', nombre: 'Hotel Centro' },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('GET /api/hospitality/finanzas — desglose vía módulo puro', () => {
  it('calcula bruto, neto, margen y cobrado con el ejemplo del plan (€700 → €595, 85%)', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reserva()]);

    const res = await GET(request('GET'));
    const data = await res.json();

    const r = data.reservas[0];
    // Bruto = 600 + 60 + 40 (líneas, NO el amountAfterTax de la OTA).
    expect(r.bruto).toBe(700);
    expect(r.comisionOta).toBe(105);
    expect(r.neto).toBe(595);
    expect(r.margenPct).toBeCloseTo(85, 2);
    expect(r.cobrado).toBe(700);
    expect(r.pendiente).toBe(0);
    expect(r.estadoCobro).toBe('pagado');
    // El desglose por tipo también viene del módulo puro.
    expect(r.desglose).toEqual({ alojamiento: 600, limpieza: 60, extra: 40, otro: 0, penalizacion: 0 });
  });

  it('una reserva sin líneas deriva la línea única desde amountAfterTax', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ items: [], amountAfterTax: 480, commission: null }),
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();

    const r = data.reservas[0];
    expect(r.bruto).toBe(480);
    expect(r.comisionOta).toBe(0);
    expect(r.neto).toBe(480);
  });

  it('el estado de cobro se deriva de los pagos: parcial y sobrepagado', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({ payments: [{ importe: 200, estado: 'pagado', metodo: 'efectivo' }] }),
      reserva({ id: 'res_b', payments: [{ importe: 800, estado: 'pagado', metodo: 'stripe' }] }),
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();

    expect(data.reservas[0].estadoCobro).toBe('parcial');
    expect(data.reservas[0].pendiente).toBe(500);
    expect(data.reservas[1].estadoCobro).toBe('sobrepagado');
    expect(data.reservas[1].pendiente).toBe(0);
  });

  it('excluye canceladas y no-show del desglose de ingresos de alojamiento', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);

    await GET(request('GET'));

    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    // La regla de «produce» sale del vocabulario compartido, no de una lista
    // local, y el no-show sigue fuera del ingreso de alojamiento.
    const filtroProduccion = where.AND.find((f: any) => f.OR?.some((o: any) => o.estado));
    const estados = filtroProduccion.OR.find((o: any) => o.estado).estado.in;
    expect(estados).toEqual(expect.arrayContaining(['confirmed']));
    expect(estados).not.toContain('cancelled');
    expect(estados).not.toContain('no_show');
  });

  it('una reserva sin producción SÍ entra si tiene penalización emitida (es un cargo, no producción)', async () => {
    // Sin esto, el no-show quedaba fuera de Finanzas: su bruto es 0 y el importe
    // vive en `penalizacion`, así que el cargo no se podía ni ver ni cobrar.
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({
        id: 'res_noshow',
        estado: 'no_show',
        amountAfterTax: 700,
        // Sin comisión: el cargo de un no-show no la devenga.
        commission: 0,
        items: [
          { tipo: 'penalizacion', concepto: 'Penalización por no-show · 1 noche', cantidad: 1, importeUnitario: 140, importeTotal: 140 },
        ],
        payments: [],
      }),
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();

    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    const filtroProduccion = where.AND.find((f: any) => f.OR?.some((o: any) => o.estado));
    const alternativaPenalizacion = filtroProduccion.OR.find((o: any) => o.items);
    expect(alternativaPenalizacion.items.some.tipo).toBe('penalizacion');

    // Y la fila se calcula con el módulo puro: bruto 0 (no es alojamiento),
    // la penalización en su propio campo, y pendiente de cobro.
    const fila = data.reservas.find((r: any) => r.id === 'res_noshow');
    expect(fila.bruto).toBe(0);
    expect(fila.penalizacion).toBe(140);
    expect(fila.neto).toBe(140);
    expect(fila.pendiente).toBe(140);
    expect(fila.estadoCobro).toBe('pendiente');

    // El resumen la agrega aparte del bruto: no infla el ingreso por alojamiento.
    expect(data.resumen.porMoneda.EUR.penalizacion).toBe(140);
    expect(data.resumen.porMoneda.EUR.bruto).toBe(0);
  });

  it('las penalizaciones cobradas entran al neto del período sin tocar el bruto', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({
        id: 'res_noshow',
        estado: 'no_show',
        commission: 0,
        items: [
          { tipo: 'penalizacion', concepto: 'Penalización', cantidad: 1, importeUnitario: 140, importeTotal: 140 },
        ],
        payments: [{ importe: 140, estado: 'pagado', metodo: 'efectivo' }],
      }),
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();
    const m = data.resumen.porMoneda.EUR;

    expect(m.bruto).toBe(0);
    expect(m.neto).toBe(140);
    expect(m.cobrado).toBe(140);
    expect(m.pendiente).toBe(0);
    expect(m.penalizacion).toBe(140);
  });

  it('filtra siempre por tenant y admite filtros de propiedad y cobro', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);

    await GET(request('GET', undefined, 'http://test.local/api/hospitality/finanzas?propertyId=prop_a&estadoCobro=pendiente'));

    const args = mocks.hospitalityReservation.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant_a');
    expect(args.where.propertyId).toBe('prop_a');
  });

  it('los gastos ERP atribuidos entran a otrosGastos y viajan con su IVA (enlace ERP)', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva({
        expenses: [
          { id: 'g1', description: 'Limpieza', amount: 25, currency: 'EUR', category: 'Limpieza', taxableBase: 20.66, vatRate: 21, vatAmount: 4.34, supplier: { name: 'CleanCo' } },
        ],
      }),
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();
    const r = data.reservas[0];

    // Neto con coste real: 700 - 105 - 25 = 570.
    expect(r.otrosGastos).toBe(25);
    expect(r.neto).toBe(570);
    expect(r.gastosErp[0]).toMatchObject({ descripcion: 'Limpieza', ivaPct: 21, ivaCuota: 4.34, proveedor: 'CleanCo' });
  });

  it('resume por moneda y por canal', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reserva(),
      reserva({ id: 'res_b', channel: 'Booking.com', commission: 0, items: [], amountAfterTax: 300, payments: [] }),
    ]);

    const res = await GET(request('GET'));
    const data = await res.json();

    const moneda = data.resumen.porMoneda['EUR'];
    expect(moneda.reservas).toBe(2);
    expect(moneda.bruto).toBe(1000); // 700 + 300
    expect(moneda.neto).toBe(895); // 595 + 300
    expect(moneda.cobrado).toBe(700);
    expect(moneda.pendiente).toBe(300);

    expect(data.resumen.porCanal['Airbnb'].reservas).toBe(1);
    expect(data.resumen.porCanal['Booking.com'].reservas).toBe(1);
    expect(data.resumen.porEstadoCobro.pagado).toBe(1);
    expect(data.resumen.porEstadoCobro.pendiente).toBe(1);
  });

  it('rechaza peticiones sin sesión válida', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'sin sesión' });

    const res = await GET(request('GET'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/hospitality/finanzas — registro de pago', () => {
  it('registra el pago en la reserva del tenant y devuelve el estado de cobro re-derivado', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'res_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      currency: 'EUR',
      externalBookingId: 'BK-1',
      amountAfterTax: 700,
    });
    mocks.hospitalityPayment.create.mockResolvedValue({
      id: 'pay_a', importe: 300, moneda: 'EUR', metodo: 'transferencia', estado: 'pagado',
    });
    mocks.hospitalityReservationItem.findMany.mockResolvedValue([]);
    mocks.hospitalityPayment.findMany.mockResolvedValue([
      { importe: 300, estado: 'pagado', metodo: 'transferencia' },
    ]);

    const res = await POST(request('POST', { reservationId: 'res_a', importe: 300, metodo: 'transferencia' }));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(mocks.hospitalityPayment.create).toHaveBeenCalledTimes(1);
    const created = mocks.hospitalityPayment.create.mock.calls[0][0].data;
    expect(created.tenantId).toBe('tenant_a');
    expect(created.importe).toBe(300);
    expect(created.estado).toBe('pagado');
    // La reserva sin líneas usa amountAfterTax como objetivo → 300 de 700 = parcial.
    expect(data.estadoCobro).toBe('parcial');
    expect(data.cobrado).toBe(300);
    expect(data.pendiente).toBe(400);
  });

  it('rechaza reservas de otro tenant (aislamiento multi-tenant)', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(null);

    const res = await POST(request('POST', { reservationId: 'res_ajena', importe: 100 }));

    expect(res.status).toBe(404);
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('valida importe, método y estado antes de tocar la base', async () => {
    const casos = [
      { body: { reservationId: 'res_a', importe: 0 }, fragmento: 'importe' },
      { body: { reservationId: 'res_a', importe: -5 }, fragmento: 'importe' },
      { body: { reservationId: 'res_a', importe: 100, metodo: 'paypal' }, fragmento: 'Método' },
      { body: { reservationId: 'res_a', importe: 100, estado: 'inventado' }, fragmento: 'Estado' },
    ];
    for (const { body } of casos) {
      const res = await POST(request('POST', body));
      expect(res.status).toBe(400);
    }
    expect(mocks.hospitalityReservation.findFirst).not.toHaveBeenCalled();
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('un pago pendiente no cobra nada (regla del módulo puro)', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'res_a', propertyId: 'prop_a', unitId: 'unit_a', currency: 'EUR',
      externalBookingId: 'BK-1', amountAfterTax: 700,
    });
    mocks.hospitalityPayment.create.mockResolvedValue({ id: 'pay_b', importe: 700, moneda: 'EUR', metodo: 'stripe', estado: 'pendiente' });
    mocks.hospitalityReservationItem.findMany.mockResolvedValue([]);
    mocks.hospitalityPayment.findMany.mockResolvedValue([{ importe: 700, estado: 'pendiente', metodo: 'stripe' }]);

    const res = await POST(request('POST', { reservationId: 'res_a', importe: 700, estado: 'pendiente', metodo: 'stripe' }));
    const data = await res.json();

    expect(data.estadoCobro).toBe('pendiente');
    expect(data.cobrado).toBe(0);
  });
});

describe('Contrato con el módulo puro (FASE 3.B → lib/hospitality/finance.ts)', () => {
  it('el ejemplo del plan cuadra con calcularRentabilidad (el criterio 3: líneas = bruto = neto + comisiones)', () => {
    const rent = calcularRentabilidad({
      lineas: [
        { tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 1, importeUnitario: 600, importeTotal: 600 },
        { tipo: 'limpieza', concepto: 'Limpieza', cantidad: 1, importeUnitario: 60, importeTotal: 60 },
        { tipo: 'extra', concepto: 'Extras', cantidad: 1, importeUnitario: 40, importeTotal: 40 },
      ],
      pagos: [{ importe: 700, estado: 'pagado' }],
      comisionOta: 105,
      moneda: 'EUR',
    });
    expect(rent.bruto).toBe(700);
    expect(rent.neto).toBe(595);
    expect(rent.cobrado).toBe(700);
    expect(rent.estadoCobro).toBe('pagado');
  });

  it('la API importa el módulo puro y no reimplementa el cálculo', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fuente = fs.readFileSync(
      path.resolve(__dirname, '../app/api/hospitality/finanzas/route.ts'),
      'utf8'
    );
    expect(fuente).toContain("from '@/lib/hospitality/finance'");
    expect(fuente).toContain('calcularRentabilidad(');
    expect(fuente).toContain('lineasDesdeImporteExterno(');
    // Sin aritmética de ingresos en la API: el neto/margen no se recalculan aquí.
    expect(fuente).not.toMatch(/neto\s*=\s*.*bruto\s*-/);
    expect(fuente).not.toMatch(/margen\s*=\s*\(/);
  });
});

describe('lineasDesdeImporteExterno (usada por la API)', () => {
  it('construye una única línea de alojamiento desde el importe externo', () => {
    const lineas = lineasDesdeImporteExterno(480);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].tipo).toBe('alojamiento');
    expect(lineas[0].importeTotal).toBe(480);
    expect(lineasDesdeImporteExterno(0)).toHaveLength(0);
    expect(lineasDesdeImporteExterno(-5)).toHaveLength(0);
  });
});
