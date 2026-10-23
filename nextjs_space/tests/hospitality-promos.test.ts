/**
 * Códigos promocionales — módulo puro, precio y reserva directa.
 *
 * Lo que se protege:
 * 1. El descuento sale del alojamiento y nunca deja la estancia en negativo.
 * 2. No se aplica a extras ni a tarifas adicionales (solo alojamiento).
 * 3. Un código inactivo, fuera de fechas, con estancia corta o agotado NO
 *    descuenta, y la reserva sigue pudiéndose hacer sin él.
 * 4. El consumo del código se hace en la base con guarda atómica (no dos veces
 *    la misma plaza de `maxUsos`), y si se agota se cae la reserva entera.
 * 5. El desglose explica el descuento con una línea en negativo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityReservation: { findUnique: vi.fn(), create: vi.fn() },
  hospitalityReservationItem: { createMany: vi.fn() },
  hospitalityExtra: { findMany: vi.fn() },
  hospitalityFee: { findMany: vi.fn() },
  hospitalityPromoCode: { findUnique: vi.fn() },
  hospitalityPromoConsulta: { updateMany: vi.fn() },
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  loadAvailabilityContext: vi.fn(),
  upsertGuest: vi.fn(),
  emitReservationCreated: vi.fn(),
  dispararComunicacionReserva: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
  asegurarTokenCheckin: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityUnit: mocks.hospitalityUnit,
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
    hospitalityExtra: mocks.hospitalityExtra,
    hospitalityFee: mocks.hospitalityFee,
    hospitalityPromoCode: mocks.hospitalityPromoCode,
    $queryRaw: mocks.queryRaw,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: mocks.queryRaw,
        $executeRaw: mocks.executeRaw,
        hospitalityReservation: mocks.hospitalityReservation,
        hospitalityReservationItem: mocks.hospitalityReservationItem,
        hospitalityPromoConsulta: mocks.hospitalityPromoConsulta,
      }),
  },
}));
vi.mock('@/lib/hospitality/availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/availability')>()),
  loadAvailabilityContext: mocks.loadAvailabilityContext,
}));
vi.mock('@/lib/hospitality/reservations', () => ({ upsertGuest: mocks.upsertGuest }));
vi.mock('@/lib/hospitality/events', () => ({ emitReservationCreated: mocks.emitReservationCreated }));
vi.mock('@/lib/hospitality/comunicaciones', () => ({
  dispararComunicacionReserva: mocks.dispararComunicacionReserva,
}));
vi.mock('@/lib/hospitality/sync', () => ({ dispatchConnectivityPush: mocks.dispatchConnectivityPush }));
vi.mock('@/lib/hospitality/checkin-service', () => ({
  asegurarTokenCheckin: mocks.asegurarTokenCheckin,
  enlaceCheckin: (token: string, idioma?: string) => `https://app.test/checkin/${token}?lang=${idioma || 'es'}`,
}));

import {
  codigoValido,
  descuentoDePromocion,
  evaluarPromocion,
  filaDeDescuento,
  normalizarCodigo,
  type Promocion,
} from '@/lib/hospitality/booking-promos';
import { cotizarEstancia } from '@/lib/hospitality/pricing';
import { crearReservaDirecta, type EntradaReservaDirecta } from '@/lib/hospitality/booking-engine';

const PROMO: Promocion = {
  codigo: 'VERANO2027',
  tipo: 'porcentaje',
  valor: 10,
  moneda: 'MXN',
  desde: null,
  hasta: null,
  minNoches: 1,
  maxUsos: null,
  usos: 0,
  activo: true,
};

describe('normalizarCodigo / codigoValido', () => {
  it('acepta el código como lo escribe el huésped', () => {
    expect(normalizarCodigo('  verano 2027 ')).toBe('VERANO2027');
    expect(normalizarCodigo('a-b_c')).toBe('A-B_C');
    expect(normalizarCodigo(123)).toBe('');
  });

  it('rechaza códigos que no se pueden dictar', () => {
    expect(codigoValido('AB')).toBe(false);
    expect(codigoValido('VERANO 2027')).toBe(false);
    expect(codigoValido('VERANO-2027')).toBe(true);
  });
});

describe('descuentoDePromocion', () => {
  it('porcentaje sobre el alojamiento', () => {
    expect(descuentoDePromocion({ tipo: 'porcentaje', valor: 10 }, 3000)).toBe(300);
    expect(descuentoDePromocion({ tipo: 'porcentaje', valor: 33.33 }, 100)).toBe(33.33);
  });

  it('importe fijo, sin pasarse del alojamiento', () => {
    expect(descuentoDePromocion({ tipo: 'importe', valor: 50 }, 3000)).toBe(50);
    expect(descuentoDePromocion({ tipo: 'importe', valor: 5000 }, 3000)).toBe(3000);
  });

  it('sin alojamiento no hay descuento', () => {
    expect(descuentoDePromocion({ tipo: 'porcentaje', valor: 10 }, 0)).toBe(0);
    expect(descuentoDePromocion({ tipo: 'importe', valor: 50 }, -10)).toBe(0);
  });
});

describe('evaluarPromocion', () => {
  const ctx = { checkIn: new Date(2027, 6, 10), noches: 3, alojamiento: 3000 };

  it('aplica un código vigente', () => {
    const r = evaluarPromocion(PROMO, ctx);
    expect(r).toEqual({ ok: true, descuento: 300, tipo: 'porcentaje', valor: 10 });
  });

  it('un código inactivo no descuenta', () => {
    const r = evaluarPromocion({ ...PROMO, activo: false }, ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('inactiva');
  });

  it('respeta las fechas de estancia (por el día de entrada)', () => {
    const antes = evaluarPromocion({ ...PROMO, desde: new Date(2027, 7, 1) }, ctx);
    const despues = evaluarPromocion({ ...PROMO, hasta: new Date(2027, 5, 30) }, ctx);
    expect(antes.ok).toBe(false);
    expect(despues.ok).toBe(false);
    if (!antes.ok) expect(antes.motivo).toBe('fuera_de_fecha');
    if (!despues.ok) expect(despues.motivo).toBe('fuera_de_fecha');
  });

  it('el día límite cuenta como válido (inclusive)', () => {
    const r = evaluarPromocion({ ...PROMO, hasta: new Date(2027, 6, 10) }, ctx);
    expect(r.ok).toBe(true);
  });

  it('exige la estancia mínima', () => {
    const r = evaluarPromocion({ ...PROMO, minNoches: 4 }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain('4 noches');
  });

  it('un código agotado no descuenta', () => {
    const r = evaluarPromocion({ ...PROMO, maxUsos: 5, usos: 5 }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('agotada');
  });
});

describe('precio — el descuento sale solo del alojamiento', () => {
  const base = {
    checkIn: new Date(2027, 6, 10),
    checkOut: new Date(2027, 6, 13),
    tarifaPorNoche: 1000,
    limpieza: 100,
    tarifas: 50,
    moneda: 'MXN',
  };

  it('resta del alojamiento y no de limpieza ni de tarifas', () => {
    const cotizacion = cotizarEstancia({ ...base, descuento: 300, anticipoPorcentaje: 0 });
    expect(cotizacion.alojamiento).toBe(3000);
    expect(cotizacion.descuento).toBe(300);
    expect(cotizacion.total).toBe(2850); // 3000 − 300 + 100 + 50
    expect(cotizacion.limpieza).toBe(100);
    expect(cotizacion.tarifas).toBe(50);
  });

  it('no puede dejar el total por debajo de limpieza y tarifas', () => {
    const cotizacion = cotizarEstancia({ ...base, descuento: 99999 });
    expect(cotizacion.descuento).toBe(3000);
    expect(cotizacion.total).toBe(150); // limpieza + tarifas
  });
});

describe('filaDeDescuento', () => {
  it('es una línea en negativo con concepto del código', () => {
    const fila = filaDeDescuento({
      codigo: 'VERANO2027',
      descuento: 300,
      moneda: 'MXN',
      tenantId: 't',
      reservationId: 'r',
      propertyId: 'p',
      unitId: 'u',
    });
    expect(fila).toMatchObject({
      tipo: 'descuento',
      concepto: 'Descuento VERANO2027',
      cantidad: 1,
      importeUnitario: -300,
      importeTotal: -300,
    });
  });
});

// ── Reserva directa ─────────────────────────────────────────────────────────

const unidad = {
  id: 'unit_a',
  propertyId: 'prop_a',
  nombre: 'Suite 1',
  tipo: 'suite',
  capacidad: 4,
  descripcion: null,
  fotos: [],
  amenidades: [],
  estado: 'available',
  tarifaBase: null,
  moneda: 'MXN',
  ratePlans: [
    {
      tarifa: 1000,
      minNoches: 1,
      maxNoches: null,
      checkInDias: null,
      checkOutDias: null,
      temporadas: null,
      finDeSemana: null,
      ajustes: null,
    },
  ],
};

const config = {
  id: 'cfg_1',
  tenantId: 'tenant_a',
  slug: 'mi-hotel',
  titulo: null,
  descripcion: null,
  emailContacto: null,
  telefonoContacto: null,
  moneda: 'MXN',
  politicaCancelacion: null,
  anticipoPorcentaje: 0,
  tarifaLimpieza: null,
  requierePagoOnline: false,
  propiedadesPublicadas: ['prop_a'],
  activo: true,
};

function entrada(over: Partial<EntradaReservaDirecta> = {}): EntradaReservaDirecta {
  return {
    tenantId: 'tenant_a',
    config: config as EntradaReservaDirecta['config'],
    propertyId: 'prop_a',
    unitId: 'unit_a',
    checkIn: new Date(2027, 6, 10),
    checkOut: new Date(2027, 6, 13),
    adultos: 2,
    ninos: 0,
    moneda: 'MXN',
    solicitudId: 'solicitud-promo-1234',
    idioma: 'es',
    huesped: { nombre: 'Ana', email: 'ana@example.com', telefono: null },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hospitalityUnit.findFirst.mockResolvedValue(unidad);
  mocks.loadAvailabilityContext.mockResolvedValue({
    units: [{ id: 'unit_a', propertyId: 'prop_a', roomCode: null, estado: 'available' }],
    reservations: [],
    blocks: [],
  });
  mocks.hospitalityReservation.findUnique.mockResolvedValue(null);
  mocks.hospitalityReservation.create.mockResolvedValue({
    id: 'res_a',
    externalBookingId: 'WEB-TEST',
    contactId: 'c1',
    guestData: {},
    tokenCheckin: null,
  });
  mocks.hospitalityReservationItem.createMany.mockResolvedValue({ count: 3 });
  mocks.hospitalityExtra.findMany.mockResolvedValue([]);
  mocks.hospitalityFee.findMany.mockResolvedValue([]);
  mocks.hospitalityPromoCode.findUnique.mockResolvedValue(null);
  mocks.hospitalityPromoConsulta.updateMany.mockResolvedValue({ count: 1 });
  mocks.queryRaw.mockResolvedValue([]);
  mocks.executeRaw.mockResolvedValue(1);
  mocks.upsertGuest.mockResolvedValue('c1');
  mocks.dispararComunicacionReserva.mockResolvedValue(undefined);
  mocks.dispatchConnectivityPush.mockResolvedValue({});
  mocks.asegurarTokenCheckin.mockResolvedValue('tok_123');
});

function lineasCreadas() {
  const llamada = mocks.hospitalityReservationItem.createMany.mock.calls.at(-1);
  return (llamada?.[0]?.data ?? []) as Array<Record<string, unknown>>;
}

describe('reserva directa con código promocional', () => {
  it('aplica el descuento, lo deja en el desglose y consume un uso', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue({ ...PROMO, id: 'promo_1' });

    const resultado = await crearReservaDirecta(
      entrada({ codigoPromocional: 'verano 2027' })
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.total).toBe(2700); // 3000 − 300
    expect(resultado.descuento).toBe(300);
    expect(resultado.codigoPromocional).toBe('VERANO2027');

    const descuento = lineasCreadas().find((l) => l.tipo === 'descuento');
    expect(descuento).toMatchObject({ concepto: 'Descuento VERANO2027', importeTotal: -300 });

    // El consumo va por SQL con guarda atómica dentro de la transacción.
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });

  it('un código agotado NO impide reservar: se reserva sin descuento', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue({
      ...PROMO,
      id: 'promo_1',
      maxUsos: 3,
      usos: 3,
    });

    const resultado = await crearReservaDirecta(entrada({ codigoPromocional: 'VERANO2027' }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.total).toBe(3000);
    expect(resultado.descuento).toBe(0);
    expect(lineasCreadas().some((l) => l.tipo === 'descuento')).toBe(false);
  });

  it('si el uso se agota entre la cotización y el cobro, no se crea la reserva', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue({ ...PROMO, id: 'promo_1' });
    // La guarda SQL no actualiza ninguna fila: el código se agotó.
    mocks.executeRaw.mockResolvedValue(0);

    const resultado = await crearReservaDirecta(entrada({ codigoPromocional: 'VERANO2027' }));

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.mensaje).toContain('se acaba de agotar');
  });

  it('un código inexistente no se aplica y la venta sigue', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue(null);

    const resultado = await crearReservaDirecta(entrada({ codigoPromocional: 'NOEXISTE' }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.descuento).toBe(0);
    expect(resultado.total).toBe(3000);
    // Sin código aplicado no hay consulta que convertir.
    expect(mocks.hospitalityPromoConsulta.updateMany).not.toHaveBeenCalled();
  });

  it('marca como convertida la consulta de ESTA sesión, dentro de la transacción', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue({ ...PROMO, id: 'promo_1' });

    const resultado = await crearReservaDirecta(
      entrada({ codigoPromocional: 'VERANO2027', sesionPromo: 'sesion-0001' })
    );

    expect(resultado.ok).toBe(true);
    // Se ata a la sesión y al código: no a todas las consultas del código.
    expect(mocks.hospitalityPromoConsulta.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_a', codigo: 'VERANO2027', sesionId: 'sesion-0001' },
      data: { reservationId: 'res_a' },
    });
  });

  it('sin sesión la reserva se crea, pero no se atribuye conversión', async () => {
    mocks.hospitalityPromoCode.findUnique.mockResolvedValue({ ...PROMO, id: 'promo_1' });

    const resultado = await crearReservaDirecta(entrada({ codigoPromocional: 'VERANO2027' }));

    expect(resultado.ok).toBe(true);
    expect(mocks.hospitalityPromoConsulta.updateMany).not.toHaveBeenCalled();
  });
});
