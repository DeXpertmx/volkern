/**
 * Tarifas adicionales en la RESERVA DIRECTA (cableado del motor, no solo el
 * módulo puro).
 *
 * Lo que se vigila:
 * 1. La tarifa obligatoria se cobra en una reserva en la que el huésped no
 *    marcó nada.
 * 2. La opcional no se cobra si no se marca, y sí cuando se marca.
 * 3. El importe guardado en el encabezado es la suma del desglose: las líneas y
 *    `amountAfterTax` no pueden contar cosas distintas.
 * 4. El desglose lleva una línea por tarifa, no una bolsa sin explicar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityReservation: { findUnique: vi.fn(), create: vi.fn() },
  hospitalityReservationItem: { createMany: vi.fn() },
  hospitalityExtra: { findMany: vi.fn() },
  hospitalityFee: { findMany: vi.fn() },
  queryRaw: vi.fn(),
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
    $queryRaw: mocks.queryRaw,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: mocks.queryRaw,
        hospitalityReservation: mocks.hospitalityReservation,
        hospitalityReservationItem: mocks.hospitalityReservationItem,
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

import { crearReservaDirecta, type EntradaReservaDirecta } from '@/lib/hospitality/booking-engine';
import type { TarifaCatalogo } from '@/lib/hospitality/booking-fees';

const LIMPIEZA: TarifaCatalogo = {
  id: 'fee_limpieza',
  nombre: 'Limpieza final',
  descripcionEs: null,
  descripcionEn: null,
  importe: 20,
  moneda: 'MXN',
  obligatoria: true,
};

const MASCOTA: TarifaCatalogo = {
  id: 'fee_mascota',
  nombre: 'Tarifa por mascota',
  descripcionEs: 'Por mascota y estancia',
  descripcionEn: null,
  importe: 30,
  moneda: 'MXN',
  obligatoria: false,
};

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
  // Sin limpieza clásica: lo que se cobre es de la tabla nueva.
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
    // 1 → 4 de marzo de 2027: 3 noches × 1000 = 3000 de alojamiento.
    checkIn: new Date(2027, 2, 1),
    checkOut: new Date(2027, 2, 4),
    adultos: 2,
    ninos: 0,
    moneda: 'MXN',
    solicitudId: 'solicitud-tarifas-1234',
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
  mocks.hospitalityFee.findMany.mockResolvedValue([LIMPIEZA, MASCOTA]);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.upsertGuest.mockResolvedValue('c1');
  mocks.dispararComunicacionReserva.mockResolvedValue(undefined);
  mocks.dispatchConnectivityPush.mockResolvedValue({});
  mocks.asegurarTokenCheckin.mockResolvedValue('tok_123');
});

/** Líneas que el motor manda a `hospitalityReservationItem.createMany`. */
function lineasCreadas() {
  const llamada = mocks.hospitalityReservationItem.createMany.mock.calls.at(-1);
  return (llamada?.[0]?.data ?? []) as Array<Record<string, unknown>>;
}

describe('reserva directa — tarifas adicionales', () => {
  it('la obligatoria se cobra aunque el huésped no marque nada', async () => {
    const resultado = await crearReservaDirecta(entrada());

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.total).toBe(3020); // 3000 + 20
    expect(resultado.totalTarifas).toBe(20);
    expect(resultado.totalExtras).toBe(0);

    const lineas = lineasCreadas();
    expect(lineas.map((l) => l.concepto)).toEqual(['3 noches × 1000', 'Limpieza final']);
    expect(lineas.every((l) => l.importeTotal !== undefined)).toBe(true);
  });

  it('la opcional no se cobra si el huésped no la marca', async () => {
    const resultado = await crearReservaDirecta(entrada());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const lineas = lineasCreadas();
    expect(lineas.some((l) => l.concepto === 'Tarifa por mascota')).toBe(false);
  });

  it('la opcional marcada se cobra una vez, con el importe del catálogo', async () => {
    const resultado = await crearReservaDirecta(entrada({ tarifas: ['fee_mascota'] }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.total).toBe(3050);
    expect(resultado.totalTarifas).toBe(50);

    const lineas = lineasCreadas();
    const mascota = lineas.find((l) => l.concepto === 'Tarifa por mascota');
    expect(mascota).toMatchObject({ cantidad: 1, importeUnitario: 30, importeTotal: 30, tipo: 'extra' });
  });

  it('el encabezado cobra exactamente la suma de las líneas', async () => {
    const resultado = await crearReservaDirecta(entrada({ tarifas: ['fee_mascota'] }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const suma = lineasCreadas().reduce((acc, l) => acc + Number(l.importeTotal || 0), 0);
    expect(suma).toBe(resultado.total);

    // El importe guardado en la reserva es el mismo número.
    const creada = mocks.hospitalityReservation.create.mock.calls.at(-1)?.[0]?.data;
    expect(creada.amountAfterTax).toBe(resultado.total);
  });

  it('un id de tarifa inventado no rompe la venta ni añade un cargo', async () => {
    const resultado = await crearReservaDirecta(entrada({ tarifas: ['fee_inventada'] }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    // Solo la obligatoria.
    expect(resultado.total).toBe(3020);
  });
});
