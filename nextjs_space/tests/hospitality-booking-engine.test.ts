import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardias del Booking Engine.
 *
 * Lo que aquí se fija es lo que no puede fallar en una página pública:
 * - la disponibilidad la decide el Availability Engine (real en estas pruebas:
 *   solo se mockea la base), no una comparación de fechas propia;
 * - no se vende dos veces la misma unidad (bloqueo de fila + recomprobación);
 * - el precio que se guarda y el desglose salen del módulo de tarificación;
 * - la reserva entra por el mismo camino que una de canal (evento, comunicación y
 *   push de disponibilidad) y nace pendiente si el alojamiento cobra online.
 */

// `vi.hoisted`: las fábricas de `vi.mock` se elevan al principio del archivo, así
// que lo que usan tiene que existir antes que ellas.
const m = vi.hoisted(() => {
  const unitFindMany = vi.fn();
  const unitFindFirst = vi.fn();
  const propertyFindMany = vi.fn();
  const reservationFindMany = vi.fn();
  const blockFindMany = vi.fn();
  const reservationFindUnique = vi.fn();
  const reservationCreate = vi.fn();
  const itemsCreateMany = vi.fn();
  const configFindUnique = vi.fn();
  const contactFindFirst = vi.fn();
  const contactCreate = vi.fn();
  const queryRaw = vi.fn();

  const tablas = {
    hospitalityUnit: {
      findMany: (...a: unknown[]) => unitFindMany(...a),
      findFirst: (...a: unknown[]) => unitFindFirst(...a),
    },
    hospitalityProperty: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
    hospitalityReservation: {
      findMany: (...a: unknown[]) => reservationFindMany(...a),
      findUnique: (...a: unknown[]) => reservationFindUnique(...a),
      create: (...a: unknown[]) => reservationCreate(...a),
    },
    hospitalityUnitBlock: { findMany: (...a: unknown[]) => blockFindMany(...a) },
    hospitalityReservationItem: { createMany: (...a: unknown[]) => itemsCreateMany(...a) },
    hospitalityBookingConfig: { findUnique: (...a: unknown[]) => configFindUnique(...a) },
    contact: {
      findFirst: (...a: unknown[]) => contactFindFirst(...a),
      create: (...a: unknown[]) => contactCreate(...a),
    },
  };

  return {
    unitFindMany,
    unitFindFirst,
    propertyFindMany,
    reservationFindMany,
    blockFindMany,
    reservationFindUnique,
    reservationCreate,
    itemsCreateMany,
    configFindUnique,
    contactFindFirst,
    contactCreate,
    queryRaw,
    tablas,
    clienteTransaccion: { ...tablas, $queryRaw: (...a: unknown[]) => queryRaw(...a) },
    upsertGuest: vi.fn(),
    dispatchPush: vi.fn(),
    comunicacion: vi.fn(),
    emitCreated: vi.fn(),
  };
});

const mockUnitFindMany = m.unitFindMany;
const mockUnitFindFirst = m.unitFindFirst;
const mockPropertyFindMany = m.propertyFindMany;
const mockReservationFindMany = m.reservationFindMany;
const mockBlockFindMany = m.blockFindMany;
const mockReservationFindUnique = m.reservationFindUnique;
const mockReservationCreate = m.reservationCreate;
const mockItemsCreateMany = m.itemsCreateMany;
const mockConfigFindUnique = m.configFindUnique;
const mockContactFindFirst = m.contactFindFirst;
const mockContactCreate = m.contactCreate;
const mockQueryRaw = m.queryRaw;
const mockUpsertGuest = m.upsertGuest;
const mockDispatchPush = m.dispatchPush;
const mockComunicacion = m.comunicacion;
const mockEmitCreated = m.emitCreated;

vi.mock('../lib/db', () => ({
  prisma: {
    ...m.tablas,
    $queryRaw: (...a: unknown[]) => m.queryRaw(...a),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(m.clienteTransaccion),
  },
}));

vi.mock('../lib/hospitality/reservations', () => ({
  upsertGuest: (...a: unknown[]) => m.upsertGuest(...a),
}));

vi.mock('../lib/hospitality/sync', () => ({
  dispatchConnectivityPush: (...a: unknown[]) => m.dispatchPush(...a),
}));

vi.mock('../lib/hospitality/comunicaciones', () => ({
  dispararComunicacionReserva: (...a: unknown[]) => m.comunicacion(...a),
}));

vi.mock('../lib/hospitality/events', () => ({
  emitReservationCreated: (...a: unknown[]) => m.emitCreated(...a),
}));

import { cotizarDisponibilidad, crearReservaDirecta, resolverPaginaPublica } from '../lib/hospitality/booking-engine';
import type { ConfigBooking } from '../lib/hospitality/booking-config';

function fecha(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

const CONFIG: ConfigBooking = {
  id: 'cfg1',
  tenantId: 't1',
  slug: 'mi-casa',
  titulo: null,
  descripcion: null,
  emailContacto: null,
  telefonoContacto: null,
  moneda: null,
  politicaCancelacion: null,
  anticipoPorcentaje: 0,
  tarifaLimpieza: null,
  requierePagoOnline: false,
  propiedadesPublicadas: ['p1'],
  activo: true,
};

function unidad(extra: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    tenantId: 't1',
    propertyId: 'p1',
    nombre: 'Apartamento 1',
    codigo: 'APT-1',
    tipo: 'apartamento',
    capacidad: 4,
    tarifaBase: 100,
    descripcion: null,
    fotos: null,
    amenidades: null,
    ratePlans: [],
    ...extra,
  };
}

/** Deja una unidad disponible para la cotización y para la creación. */
function conUnidad(extra: Record<string, unknown> = {}) {
  const u = unidad(extra);
  mockUnitFindMany.mockResolvedValue([u]);
  mockUnitFindFirst.mockResolvedValue(u);
  return u;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReservationFindMany.mockResolvedValue([]);
  mockBlockFindMany.mockResolvedValue([]);
  mockReservationFindUnique.mockResolvedValue(null);
  mockPropertyFindMany.mockResolvedValue([]);
  mockConfigFindUnique.mockResolvedValue(null);
  mockContactFindFirst.mockResolvedValue(null);
  mockContactCreate.mockResolvedValue({ id: 'c1' });
  mockUpsertGuest.mockResolvedValue('c1');
  mockReservationCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'res-nueva',
    ...data,
  }));
  mockItemsCreateMany.mockResolvedValue({ count: 2 });
  mockDispatchPush.mockResolvedValue({ ok: true });
  mockComunicacion.mockResolvedValue([]);
});

describe('cotizarDisponibilidad', () => {
  const base = {
    tenantId: 't1',
    config: CONFIG,
    monedaTenant: 'EUR',
    propertyId: 'p1',
    checkIn: fecha('2026-10-10'),
    checkOut: fecha('2026-10-13'),
    adultos: 2,
    ninos: 0,
    moneda: 'EUR',
  };

  it('cotiza una unidad libre con el precio del plan y la limpieza de la configuración', async () => {
    conUnidad({ ratePlans: [{ tarifa: 120, minNoches: 1, maxNoches: null, checkInDias: null, checkOutDias: null }] });

    const resultado = await cotizarDisponibilidad({ ...base, config: { ...CONFIG, tarifaLimpieza: 60 } });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.noches).toBe(3);
    expect(resultado.unidades).toHaveLength(1);
    expect(resultado.unidades[0].tarifaPorNoche).toBe(120);
    expect(resultado.unidades[0].cotizacion.alojamiento).toBe(360);
    expect(resultado.unidades[0].cotizacion.limpieza).toBe(60);
    expect(resultado.unidades[0].cotizacion.total).toBe(420);
  });

  it('usa la tarifa base cuando la unidad no tiene plan activo', async () => {
    conUnidad();
    const resultado = await cotizarDisponibilidad({ ...base, config: { ...CONFIG, tarifaLimpieza: 20 } });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.unidades[0].tarifaPorNoche).toBe(100);
    expect(resultado.unidades[0].cotizacion.total).toBe(320);
  });

  it('no vende una unidad ocupada por otra reserva', async () => {
    conUnidad();
    // El motor central la considera ocupada: la reserva cubre [11, 12).
    mockReservationFindMany.mockResolvedValue([
      { unitId: 'u1', checkIn: fecha('2026-10-11'), checkOut: fecha('2026-10-12'), estado: 'confirmed' },
    ]);

    const resultado = await cotizarDisponibilidad(base);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toBe('no_disponible');
  });

  it('no vende una unidad bloqueada por el propietario', async () => {
    conUnidad();
    mockBlockFindMany.mockResolvedValue([
      { unitId: 'u1', fechaInicio: fecha('2026-10-10'), fechaFin: fecha('2026-10-13'), estado: 'activo' },
    ]);

    const resultado = await cotizarDisponibilidad(base);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toBe('no_disponible');
  });

  it('respeta las restricciones del plan: no cotiza por debajo del mínimo de noches', async () => {
    // La estancia del caso base son 3 noches: el plan pide 4.
    conUnidad({ ratePlans: [{ tarifa: 120, minNoches: 4, maxNoches: null, checkInDias: null, checkOutDias: null }] });

    const resultado = await cotizarDisponibilidad(base);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toBe('min_noches');
  });

  it('descarta la unidad cuando no hay suficientes plazas', async () => {
    conUnidad({ capacidad: 2 });

    const resultado = await cotizarDisponibilidad({ ...base, adultos: 3 });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toBe('capacidad');
  });

  it('una unidad sin precio no se publica', async () => {
    conUnidad({ tarifaBase: null });
    const resultado = await cotizarDisponibilidad(base);
    expect(resultado.ok).toBe(false);
  });
});

describe('crearReservaDirecta', () => {
  const base = {
    tenantId: 't1',
    config: CONFIG,
    propertyId: 'p1',
    unitId: 'u1',
    checkIn: fecha('2026-10-10'),
    checkOut: fecha('2026-10-12'),
    adultos: 2,
    ninos: 0,
    moneda: 'EUR',
    solicitudId: 'abcdef123456',
    huesped: { nombre: 'María García', email: 'maria@example.com' },
  };

  it('exige el identificador de la solicitud (es la clave de idempotencia)', async () => {
    const resultado = await crearReservaDirecta({ ...base, solicitudId: '' });
    expect(resultado).toMatchObject({ ok: false, motivo: 'sin_solicitud' });
    expect(mockReservationCreate).not.toHaveBeenCalled();
  });

  it('exige el nombre de quien reserva', async () => {
    const resultado = await crearReservaDirecta({ ...base, huesped: { nombre: '  ' } });
    expect(resultado).toMatchObject({ ok: false, motivo: 'datos' });
  });

  it('reintentar el mismo formulario devuelve la reserva ya creada', async () => {
    mockReservationFindUnique.mockResolvedValue({
      id: 'res-1',
      externalBookingId: 'WEB-ABCDEF123456',
      estado: 'confirmed',
      amountAfterTax: 200,
      currency: 'EUR',
      checkIn: fecha('2026-10-10'),
      checkOut: fecha('2026-10-12'),
    });

    const resultado = await crearReservaDirecta(base);

    expect(resultado).toMatchObject({ ok: true, reservaId: 'res-1', yaExistia: true });
    expect(mockReservationCreate).not.toHaveBeenCalled();
  });

  it('no vende una unidad que ya está ocupada: lo decide el motor con el bloqueo tomado', async () => {
    conUnidad();
    mockReservationFindMany.mockResolvedValue([
      { unitId: 'u1', checkIn: fecha('2026-10-11'), checkOut: fecha('2026-10-12'), estado: 'confirmed' },
    ]);

    const resultado = await crearReservaDirecta(base);

    expect(resultado).toMatchObject({ ok: false, motivo: 'no_disponible' });
    expect(mockReservationCreate).not.toHaveBeenCalled();
    // Se toma el bloqueo de fila antes de comprobar: sin él, dos solicitudes
    // simultáneas pasarían las dos.
    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it('crea la reserva por el mismo camino que una de canal, con su desglose', async () => {
    conUnidad({ ratePlans: [{ tarifa: 120, minNoches: 1, maxNoches: null, checkInDias: null, checkOutDias: null }] });

    const resultado = await crearReservaDirecta({ ...base, config: { ...CONFIG, tarifaLimpieza: 45, anticipoPorcentaje: 30 } });

    expect(resultado).toMatchObject({ ok: true, estado: 'confirmed', noches: 2, moneda: 'EUR', yaExistia: false });
    if (!resultado.ok) return;

    const reservaCreada = mockReservationCreate.mock.calls[0][0].data;
    expect(reservaCreada.channel).toBe('Directa');
    expect(reservaCreada.currency).toBe('EUR');
    expect(reservaCreada.amountAfterTax).toBe(285); // 2 × 120 + 45
    expect(reservaCreada.estado).toBe('confirmed');

    // El desglose va en líneas: alojamiento y limpieza.
    const lineas = mockItemsCreateMany.mock.calls[0][0].data;
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ tipo: 'alojamiento', cantidad: 2, importeTotal: 240 });
    expect(lineas[1]).toMatchObject({ tipo: 'limpieza', importeTotal: 45 });

    // Y entra en el flujo común: huésped al CRM, evento, confirmación y push.
    expect(mockUpsertGuest).toHaveBeenCalled();
    expect(mockEmitCreated).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'res-nueva', channel: 'Directa', estado: 'confirmed' })
    );
    expect(mockComunicacion).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'confirmacion', reservationId: 'res-nueva' })
    );
    expect(mockDispatchPush).toHaveBeenCalledWith('t1', 'p1', 'reserva_creada', { skipRates: true });
  });

  it('con pago online exigido la reserva nace pendiente y no se confirma al huésped', async () => {
    conUnidad();

    const resultado = await crearReservaDirecta({ ...base, config: { ...CONFIG, requierePagoOnline: true } });

    expect(resultado).toMatchObject({ ok: true, estado: 'pending' });
    expect(mockReservationCreate.mock.calls[0][0].data.estado).toBe('pending');
    expect(mockComunicacion).not.toHaveBeenCalled();
  });

  it('la referencia pública no expone nada del tenant ni del huésped', async () => {
    conUnidad();
    const resultado = await crearReservaDirecta({ ...base, solicitudId: 'zzzz-1111-2222' });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.referencia).toMatch(/^WEB-ZZZZ11112222$/);
  });
});

describe('resolverPaginaPublica', () => {
  it('sin configuración la página no existe', async () => {
    mockConfigFindUnique.mockResolvedValue(null);
    expect(await resolverPaginaPublica('nadie')).toMatchObject({ ok: false, motivo: 'no_existe' });
  });

  it('una página desactivada no se sirve aunque el enlace circule', async () => {
    mockConfigFindUnique.mockResolvedValue({ ...CONFIG, activo: false, tenant: { id: 't1', nombre: 'Casa', moneda: 'EUR' } });
    expect(await resolverPaginaPublica('mi-casa')).toMatchObject({ ok: false, motivo: 'inactiva' });
  });

  it('publica en la divisa del tenant mientras no se elija otra', async () => {
    mockConfigFindUnique.mockResolvedValue({
      ...CONFIG,
      tenant: { id: 't1', nombre: 'Casa', moneda: 'COP' },
    });
    mockPropertyFindMany.mockResolvedValue([]);

    const resultado = await resolverPaginaPublica('mi-casa');

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.moneda).toBe('COP');
    expect(resultado.tenant.nombre).toBe('Casa');
  });

  it('la divisa elegida por el tenant manda sobre la de su cuenta', async () => {
    mockConfigFindUnique.mockResolvedValue({
      ...CONFIG,
      moneda: 'USD',
      tenant: { id: 't1', nombre: 'Casa', moneda: 'COP' },
    });
    mockPropertyFindMany.mockResolvedValue([]);

    const resultado = await resolverPaginaPublica('mi-casa');
    expect(resultado.ok && resultado.moneda).toBe('USD');
  });
});
