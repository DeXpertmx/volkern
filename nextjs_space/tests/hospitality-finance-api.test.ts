import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityReservation: { findMany: vi.fn(), findFirst: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityReservationItem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  hospitalityPayment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  hospitalityCleaningTask: { groupBy: vi.fn() },
  hospitalityMaintenanceTask: { groupBy: vi.fn() },
  authenticateRequest: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityProperty: mocks.hospitalityProperty,
    hospitalityUnit: mocks.hospitalityUnit,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
    hospitalityPayment: mocks.hospitalityPayment,
    hospitalityCleaningTask: mocks.hospitalityCleaningTask,
    hospitalityMaintenanceTask: mocks.hospitalityMaintenanceTask,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', async () => ({
  // La ruta comprueba permisos: se conserva el `hasPermission` real y solo se
  // sustituye la auditoría, que es lo que estas pruebas quieren aislar.
  ...(await vi.importActual<typeof import('@/lib/permissions')>('@/lib/permissions')),
  logAuditAction: mocks.logAuditAction
}));

import { GET as finanzasGET } from '@/app/api/hospitality/finanzas/route';
import { GET as reportesGET } from '@/app/api/hospitality/reportes/route';
import { GET as itemsGET, POST as itemsPOST } from '@/app/api/hospitality/reservations/[id]/items/route';
import {
  DELETE as itemDELETE,
  PATCH as itemPATCH,
} from '@/app/api/hospitality/reservations/[id]/items/[itemId]/route';
import { GET as pagosGET, POST as pagosPOST } from '@/app/api/hospitality/reservations/[id]/payments/route';
import {
  DELETE as pagoDELETE,
  PATCH as pagoPATCH,
} from '@/app/api/hospitality/reservations/[id]/payments/[paymentId]/route';

// El tenant trae su moneda de reporte: es la fuente autoritativa del respaldo.
const auth = { valid: true, tenant: { id: 'tenant_a', moneda: 'EUR' }, user: { id: 'user_a', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } } };

const request = (method: string, body?: unknown, url = 'http://test.local/api/hospitality') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

/** Reserva tal como la devuelve el `select` del cargador compartido. */
const reservaFila = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  propertyId: 'p1',
  unitId: 'u1',
  channel: 'Airbnb',
  estado: 'confirmed',
  checkIn: new Date('2026-10-10T15:00:00'),
  checkOut: new Date('2026-10-15T11:00:00'),
  bookedOn: null,
  amountAfterTax: 660,
  currency: 'EUR',
  commission: 105,
  guestData: { firstName: 'María', lastName: 'García' },
  unit: { nombre: 'APT 1' },
  property: { nombre: 'Centro' },
  contact: null,
  items: [],
  payments: [{ importe: 300, estado: 'pagado', metodo: 'stripe' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.hospitalityReservation.findMany.mockResolvedValue([reservaFila()]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([{ id: 'p1', nombre: 'Centro' }]);
  mocks.hospitalityUnit.findMany.mockResolvedValue([
    { id: 'u1', propertyId: 'p1', estado: 'available' },
  ]);
  mocks.hospitalityCleaningTask.groupBy.mockResolvedValue([{ estado: 'completed', _count: { _all: 2 } }]);
  mocks.hospitalityMaintenanceTask.groupBy.mockResolvedValue([]);
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('GET /api/hospitality/finanzas', () => {
  it('exige sesión válida', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'No autorizado' });
    const res = await finanzasGET(request('GET'));
    expect(res.status).toBe(401);
  });

  // Aquí vivía el contrato de la OTRA implementación de Finanzas (totales del
  // período, `estadosCobro`, informe en CSV, una sola divisa por informe). Tras
  // el cruce sobrevive la implementación de la pantalla y del esquema —
  // `reservas` + `resumen` por moneda —, y sus reglas (bruto desde las líneas,
  // comisión, cobrado, pendiente y estado de cobro derivado) están guardadas
  // sobre el contrato vigente en `hospitality-finanzas-api.test.ts`.

  it('aísla por tenant: la consulta lleva el tenant de la sesión', async () => {
    await finanzasGET(request('GET'));
    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant_a');
  });

  it('no escribe nada al leer', async () => {
    await finanzasGET(request('GET'));
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
    expect(mocks.hospitalityPayment.update).not.toHaveBeenCalled();
  });
});

describe('la moneda sale del dato, no del valor por defecto del esquema', () => {
  // El esquema trae 'MXN' en todos los campos de moneda. Si alguna capa lo
  // usara como constante, un tenant español vería pesos sin que nadie lo note.
  it('Finanzas informa la divisa de cada reserva cuando es EUR', async () => {
    const res = await finanzasGET(request('GET'));
    const data = await res.json();
    expect(data.reservas[0].moneda).toBe('EUR');
    expect(data.resumen.porMoneda.EUR.bruto).toBe(660);
  });

  it('Finanzas informa MXN si la reserva está en pesos: no está fijada a euros', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaFila({ currency: 'MXN' })]);
    const res = await finanzasGET(request('GET'));
    const data = await res.json();
    expect(data.reservas[0].moneda).toBe('MXN');
    expect(data.resumen.porMoneda.MXN.bruto).toBe(660);
  });

  it('Reportes informa la divisa de las reservas', async () => {
    const res = await reportesGET(
      request('GET', undefined, 'http://test.local/api/hospitality/reportes?desde=2026-10-10&hasta=2026-10-12')
    );
    const data = await res.json();
    expect(data.moneda).toBe('EUR');
    expect(data.financiero.totales.bruto).toBe(660);
  });

  it('con divisas mezcladas el informe elige la predominante, no la primera fila', async () => {
    // La primera reserva está en pesos y las otras dos en euros: informar la
    // primera fila escribiría el informe entero en la divisa equivocada. En
    // Finanzas no hay una divisa de informe que elegir (agrupa por moneda en
    // `resumen.porMoneda`); la elección es del informe de Reportes.
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reservaFila({ id: 'r1', currency: 'MXN' }),
      reservaFila({ id: 'r2', currency: 'EUR' }),
      reservaFila({ id: 'r3', currency: 'EUR' }),
    ]);

    const fin = await (await finanzasGET(request('GET'))).json();
    expect(fin.reservas[0].moneda).toBe('MXN');
    expect(Object.keys(fin.resumen.porMoneda).sort()).toEqual(['EUR', 'MXN']);
    expect(fin.resumen.porMoneda.EUR.reservas).toBe(2);

    const rep = await (
      await reportesGET(
        request('GET', undefined, 'http://test.local/api/hospitality/reportes?desde=2026-10-10&hasta=2026-10-12')
      )
    ).json();
    expect(rep.moneda).toBe('EUR');
  });

  it('sin reservas cae a la moneda del tenant, no al valor por defecto del esquema', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);

    const rep = await (
      await reportesGET(
        request('GET', undefined, 'http://test.local/api/hospitality/reportes?desde=2026-10-10&hasta=2026-10-12')
      )
    ).json();
    expect(rep.moneda).toBe('EUR');
  });

  it('si el tenant no tiene moneda, informa la ausencia en lugar de inventarla', async () => {
    // Un tenant sin moneda no puede caer a 'MXN': el valor del esquema no es una
    // decisión del negocio y mostrarlo sería inventar el dato.
    mocks.authenticateRequest.mockResolvedValue({
      valid: true,
      tenant: { id: 'tenant_sin_moneda' },
      user: { id: 'user_a', role: { id: 'role_admin', nombre: 'Admin', permisos: { all: true } } },
    });
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);

    const rep = await (
      await reportesGET(
        request('GET', undefined, 'http://test.local/api/hospitality/reportes?desde=2026-10-10&hasta=2026-10-12')
      )
    ).json();    expect(rep.moneda).toBe('');
  });



  it('el dato de las reservas gana sobre la moneda del tenant', async () => {
    // El respaldo es para cuando no hay dato, no para reescribir lo que ya hay.
    mocks.hospitalityReservation.findMany.mockResolvedValue([reservaFila({ currency: 'MXN' })]);

    const fin = await (await finanzasGET(request('GET'))).json();
    expect(fin.reservas[0].moneda).toBe('MXN');
    expect(fin.resumen.porMoneda.MXN).toBeDefined();
  });
});

describe('GET /api/hospitality/reportes', () => {
  it('exige sesión válida', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'No autorizado' });
    const res = await reportesGET(request('GET'));
    expect(res.status).toBe(401);
  });

  it('devuelve operación, ventas, finanzas y propiedades sin escribir', async () => {
    const res = await reportesGET(
      request('GET', undefined, 'http://test.local/api/hospitality/reportes?desde=2026-10-10&hasta=2026-10-12')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.operacion.nochesDisponibles).toBe(3); // 1 unidad × 3 noches
    expect(data.operacion.nochesOcupadas).toBe(3);
    expect(data.operacion.adr).toBe(220);
    expect(data.operacion.revpar).toBe(220);
    expect(data.ventas.canales).toHaveLength(1);
    expect(data.financiero.totales.bruto).toBe(660);
    expect(data.propiedades[0].nombre).toBe('Centro');
    expect(data.operaciones.limpieza.completed).toBe(2);

    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('excluye del inventario las unidades fuera de servicio', async () => {
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      { id: 'u1', propertyId: 'p1', estado: 'available' },
      { id: 'u2', propertyId: 'p1', estado: 'out_of_service' },
    ]);
    const res = await reportesGET(
      request('GET', undefined, 'http://test.local/api/hospitality/reportes?desde=2026-10-10&hasta=2026-10-12')
    );
    const data = await res.json();
    expect(data.operacion.unidades).toBe(1);
    expect(data.operacion.nochesDisponibles).toBe(3);
  });
});

describe('POST /api/hospitality/reservations/[id]/items', () => {
  beforeEach(() => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'r1',
      externalBookingId: 'B-1',
      propertyId: 'p1',
      unitId: 'u1',
      currency: 'EUR',
    });
  });

  it('rechaza un tipo de línea que no existe', async () => {
    const res = await itemsPOST(
      request('POST', { tipo: 'inventado', concepto: 'X', importeUnitario: 10 }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    expect(res.status).toBe(400);
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('rechaza importes que no suman nada', async () => {
    const res = await itemsPOST(
      request('POST', { tipo: 'extra', concepto: 'Parking', importeUnitario: 0 }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    expect(res.status).toBe(400);
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('calcula el total como cantidad por importe unitario', async () => {
    mocks.hospitalityReservationItem.create.mockImplementation(async ({ data }: any) => ({
      id: 'item_1',
      ...data,
    }));
    const res = await itemsPOST(
      request(
        'POST',
        { tipo: 'limpieza', concepto: 'Limpieza final', cantidad: 1, importeUnitario: 60 },
        'http://test.local/x'
      ),
      ctx({ id: 'r1' })
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.item.importeTotal).toBe(60);
    expect(mocks.hospitalityReservationItem.create.mock.calls[0][0].data.tenantId).toBe('tenant_a');
  });

  it('no deja tocar una reserva de otro tenant', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue(null);
    const res = await itemsPOST(
      request('POST', { tipo: 'extra', concepto: 'X', importeUnitario: 10 }, 'http://test.local/x'),
      ctx({ id: 'r_de_otro' })
    );
    expect(res.status).toBe(404);
    expect(mocks.hospitalityReservationItem.create).not.toHaveBeenCalled();
  });

  it('la búsqueda de la reserva va filtrada por tenant', async () => {
    await itemsPOST(
      request('POST', { tipo: 'extra', concepto: 'X', importeUnitario: 10 }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    expect(mocks.hospitalityReservation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'r1',
      tenantId: 'tenant_a',
    });
  });
});

describe('rutas de línea por id', () => {
  it('no edita una línea de otro tenant', async () => {
    mocks.hospitalityReservationItem.findFirst.mockResolvedValue(null);
    const res = await itemPATCH(
      request('PATCH', { importeUnitario: 99 }, 'http://test.local/x'),
      ctx({ id: 'r1', itemId: 'item_ajeno' })
    );
    expect(res.status).toBe(404);
    expect(mocks.hospitalityReservationItem.update).not.toHaveBeenCalled();
  });

  it('no borra una línea de otro tenant', async () => {
    mocks.hospitalityReservationItem.findFirst.mockResolvedValue(null);
    const res = await itemDELETE(request('DELETE', undefined, 'http://test.local/x'), ctx({ id: 'r1', itemId: 'item_ajeno' }));
    expect(res.status).toBe(404);
    expect(mocks.hospitalityReservationItem.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/hospitality/reservations/[id]/payments', () => {
  beforeEach(() => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({
      id: 'r1',
      externalBookingId: 'B-1',
      propertyId: 'p1',
      unitId: 'u1',
      currency: 'EUR',
      amountAfterTax: 660,
      commission: 105,
    });
    mocks.hospitalityPayment.create.mockImplementation(async ({ data }: any) => ({ id: 'pay_1', ...data }));
  });

  it('rechaza importes no positivos', async () => {
    const res = await pagosPOST(
      request('POST', { importe: 0 }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    expect(res.status).toBe(400);
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('rechaza un método de pago desconocido', async () => {
    const res = await pagosPOST(
      request('POST', { importe: 100, metodo: 'bitcoin' }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    expect(res.status).toBe(400);
    expect(mocks.hospitalityPayment.create).not.toHaveBeenCalled();
  });

  it('registra el pago con el tenant de la sesión y sella la fecha al cobrar', async () => {
    const res = await pagosPOST(
      request('POST', { importe: 300, metodo: 'transferencia' }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    const data = await res.json();
    const creado = mocks.hospitalityPayment.create.mock.calls[0][0].data;

    expect(res.status).toBe(201);
    expect(data.pago.estado).toBe('pagado');
    expect(creado.tenantId).toBe('tenant_a');
    expect(creado.importe).toBe(300);
    expect(creado.fechaPago).toBeInstanceOf(Date);
  });

  it('un pago pendiente no sella fecha de cobro', async () => {
    await pagosPOST(
      request('POST', { importe: 300, estado: 'pendiente' }, 'http://test.local/x'),
      ctx({ id: 'r1' })
    );
    expect(mocks.hospitalityPayment.create.mock.calls[0][0].data.fechaPago).toBeNull();
  });
});

describe('PATCH /api/hospitality/reservations/[id]/payments/[paymentId]', () => {
  it('no marca como reembolsado un pago de otro tenant', async () => {
    mocks.hospitalityPayment.findFirst.mockResolvedValue(null);
    const res = await pagoPATCH(
      request('PATCH', { estado: 'reembolsado' }, 'http://test.local/x'),
      ctx({ id: 'r1', paymentId: 'pay_ajeno' })
    );
    expect(res.status).toBe(404);
    expect(mocks.hospitalityPayment.update).not.toHaveBeenCalled();
  });

  it('rechaza un estado de pago inválido', async () => {
    mocks.hospitalityPayment.findFirst.mockResolvedValue({
      id: 'pay_1',
      importe: 300,
      estado: 'pagado',
      fechaPago: new Date(),
    });
    const res = await pagoPATCH(
      request('PATCH', { estado: 'cobrado' }, 'http://test.local/x'),
      ctx({ id: 'r1', paymentId: 'pay_1' })
    );
    expect(res.status).toBe(400);
    expect(mocks.hospitalityPayment.update).not.toHaveBeenCalled();
  });

  it('marca el reembolso y conserva la fecha del cobro original', async () => {
    const fechaCobro = new Date('2026-10-01T10:00:00');
    mocks.hospitalityPayment.findFirst.mockResolvedValue({
      id: 'pay_1',
      importe: 300,
      estado: 'pagado',
      fechaPago: fechaCobro,
    });
    mocks.hospitalityPayment.update.mockImplementation(async ({ data }: any) => ({
      id: 'pay_1',
      importe: 300,
      moneda: 'EUR',
      metodo: 'stripe',
      fechaPago: fechaCobro,
      ...data,
    }));

    const res = await pagoPATCH(
      request('PATCH', { estado: 'reembolsado' }, 'http://test.local/x'),
      ctx({ id: 'r1', paymentId: 'pay_1' })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.pago.estado).toBe('reembolsado');
    expect(mocks.hospitalityPayment.update.mock.calls[0][0].data.fechaPago).toBeUndefined();
  });
});

describe('GET de líneas y pagos', () => {
  beforeEach(() => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({ id: 'r1' });
  });

  it('lista las líneas por tenant', async () => {
    mocks.hospitalityReservationItem.findMany.mockResolvedValue([]);
    const res = await itemsGET(request('GET', undefined, 'http://test.local/x'), ctx({ id: 'r1' }));
    expect(res.status).toBe(200);
    expect(mocks.hospitalityReservationItem.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant_a',
      reservationId: 'r1',
    });
  });

  it('devuelve el cobrado derivado de los pagos', async () => {
    mocks.hospitalityPayment.findMany.mockResolvedValue([
      { importe: 300, estado: 'pagado' },
      { importe: 100, estado: 'reembolsado' },
    ]);
    mocks.hospitalityReservationItem.findMany.mockResolvedValue([
      { tipo: 'alojamiento', concepto: 'A', cantidad: 1, importeUnitario: 660, importeTotal: 660 },
    ]);

    const res = await pagosGET(request('GET', undefined, 'http://test.local/x'), ctx({ id: 'r1' }));
    const data = await res.json();
    expect(data.cobrado).toBe(200);
    expect(data.totalLineas).toBe(660);
  });
});

describe('borrado de pagos', () => {
  it('no borra un pago de otro tenant', async () => {
    mocks.hospitalityPayment.findFirst.mockResolvedValue(null);
    const res = await pagoDELETE(
      request('DELETE', undefined, 'http://test.local/x'),
      ctx({ id: 'r1', paymentId: 'pay_ajeno' })
    );
    expect(res.status).toBe(404);
    expect(mocks.hospitalityPayment.delete).not.toHaveBeenCalled();
  });
});
