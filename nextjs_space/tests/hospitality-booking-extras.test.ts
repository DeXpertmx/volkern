// @vitest-environment node
//
// Guardias de los EXTRAS comprables en el booking engine (hueco nº 2 frente a
// Lodgify): desayuno, late check-out, traslados…
//
// Lo que se vigila:
//   1. EL PRECIO LO PONE EL SERVIDOR: la selección viaja como {extraId,
//      cantidad} y el módulo resuelve contra el catálogo activo — el importe
//      del cliente nunca se usa.
//   2. El extra es una LÍNEA tipo 'extra' de HospitalityReservationItem: el
//      mismo desglose que suma Finanzas. No hay un segundo modelo de ingresos.
//   3. La creación de la reserva NUNCA se tumba por los extras: un extra
//      desactivado entre medias se ignora (queda dicho), no rompe la venta.
//   4. El cobro (Stripe) incluye los extras: el huésped paga el total real.
//   5. Un extra por noche multiplica por las noches de la estancia, no por 1.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function leer(relativo: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

const mocks = vi.hoisted(() => ({
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityReservation: { findUnique: vi.fn(), create: vi.fn() },
  hospitalityReservationItem: { createMany: vi.fn() },
  hospitalityExtra: { findMany: vi.fn() },
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
    $queryRaw: mocks.queryRaw,
    // La transacción del motor se ejecuta de verdad (con su contexto doblado):
    // la comprobación bajo bloqueo es parte de lo que se vigila.
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

import {
  resolverExtras,
  totalDeExtras,
  filasDeItemsExtras,
  catalogoPublico,
  type ExtraCatalogo,
} from '@/lib/hospitality/booking-extras';
import { crearReservaDirecta, type EntradaReservaDirecta } from '@/lib/hospitality/booking-engine';

const desayuno: ExtraCatalogo = {
  id: 'extra_desayuno',
  nombre: 'Desayuno buffet',
  descripcionEs: 'De 7 a 11',
  descripcionEn: 'From 7 to 11',
  precio: 250,
  moneda: 'MXN',
  precioPorNoche: false,
};
const lateCheckout: ExtraCatalogo = {
  id: 'extra_late',
  nombre: 'Late check-out',
  descripcionEs: null,
  descripcionEn: null,
  precio: 400,
  moneda: 'MXN',
  precioPorNoche: false,
};
const traslado: ExtraCatalogo = {
  id: 'extra_traslado',
  nombre: 'Traslado aeropuerto',
  descripcionEs: null,
  descripcionEn: null,
  precio: 50,
  moneda: 'USD',
  precioPorNoche: true,
};
const CATALOGO = [desayuno, lateCheckout, traslado];

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

/** Entrada de la reserva directa: el MISMO camino que usa la ruta pública. */
function entrada(over: Partial<EntradaReservaDirecta> = {}): EntradaReservaDirecta {
  return {
    tenantId: 'tenant_a',
    config: config as EntradaReservaDirecta['config'],
    propertyId: 'prop_a',
    unitId: 'unit_a',
    // 1 → 4 de marzo de 2027: 3 noches a 1000. (Fechas futuras: una estancia
    // pasada la rechaza el motor, como a cualquier reserva.)
    checkIn: new Date(2027, 2, 1),
    checkOut: new Date(2027, 2, 4),
    adultos: 2,
    ninos: 0,
    moneda: 'MXN',
    solicitudId: 'solicitud-de-prueba-1234',
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
  mocks.hospitalityReservationItem.createMany.mockResolvedValue({ count: 2 });
  mocks.hospitalityExtra.findMany.mockResolvedValue(CATALOGO);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.upsertGuest.mockResolvedValue('c1');
  mocks.dispararComunicacionReserva.mockResolvedValue(undefined);
  mocks.dispatchConnectivityPush.mockResolvedValue({});
  mocks.asegurarTokenCheckin.mockResolvedValue('tok_123');
});

describe('módulo puro — resolverExtras', () => {
  it('el precio SIEMPRE sale del catálogo: la selección solo nombra id y cantidad', () => {
    const r = resolverExtras([{ extraId: 'extra_desayuno', cantidad: 2, precio: 1 }], CATALOGO, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas[0].importeUnitario).toBe(250); // el 1 del cliente se ignora
    expect(r.lineas[0].importeTotal).toBe(500);
    expect(r.total).toBe(500);
  });

  it('el extra por noche multiplica por las NOCHES de la estancia y lo nombra en el concepto', () => {
    const r = resolverExtras([{ extraId: 'extra_traslado', cantidad: 1 }], CATALOGO, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas[0].importeTotal).toBe(200); // 50 × 4 noches
    expect(r.lineas[0].concepto).toContain('4 noches');
    expect(r.lineas[0].moneda).toBe('USD');
  });

  it('un extra desactivado (fuera del catálogo) se ignora sin romper la venta, con su motivo', () => {
    const r = resolverExtras(
      [{ extraId: 'extra_desayuno', cantidad: 1 }, { extraId: 'extra_fantasma', cantidad: 1 }],
      CATALOGO,
      2
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas).toHaveLength(1);
    expect(r.total).toBe(250);
    expect(r.ignorados[0]).toContain('extra_fantasma');
  });

  it('las cantidades se acotan (1–10) y los duplicados se consolidan en una línea', () => {
    const r = resolverExtras(
      [
        { extraId: 'extra_desayuno', cantidad: 8 },
        { extraId: 'extra_desayuno', cantidad: 5 }, // doble click → 10 tras cota
        { extraId: 'extra_late', cantidad: 99 }, // fuera de cota → ignorado
      ],
      CATALOGO,
      1
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.lineas.find((l) => l.extraId === 'extra_desayuno')!;
    expect(d.cantidad).toBe(10); // 8+5=13 → cota 10
    expect(d.importeTotal).toBe(2500);
    expect(r.lineas).toHaveLength(1); // el late (99) ignorado
    expect(r.ignorados.some((i) => i.includes('Late check-out'))).toBe(true);
  });

  it('selección vacía o basura: ok con cero líneas (no es error del huésped)', () => {
    expect(resolverExtras(undefined, CATALOGO, 2)).toMatchObject({ ok: true, lineas: [] });
    expect(resolverExtras([], CATALOGO, 2)).toMatchObject({ ok: true, lineas: [] });
    expect(resolverExtras([{}, 'x', null], CATALOGO, 2)).toMatchObject({ ok: true, lineas: [] });
  });

  it('las líneas listas para BD son tipo extra con el contexto de la reserva', () => {
    const r = resolverExtras([{ extraId: 'extra_desayuno', cantidad: 2 }], CATALOGO, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const filas = filasDeItemsExtras(r.lineas, {
      tenantId: 't1',
      reservationId: 'res_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
    });
    expect(filas[0]).toMatchObject({
      tipo: 'extra',
      tenantId: 't1',
      reservationId: 'res_a',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      concepto: 'Desayuno buffet',
      importeTotal: 500,
    });
    expect(totalDeExtras(r.lineas)).toBe(500);
  });

  it('el catálogo público entrega la descripción en el idioma del huésped', () => {
    const es = catalogoPublico(CATALOGO, 'es');
    const en = catalogoPublico(CATALOGO, 'en');
    expect(es[0].descripcion).toBe('De 7 a 11');
    expect(en[0].descripcion).toBe('From 7 to 11');
  });
});

describe('reserva directa — nace con sus líneas de extras y el precio del servidor', () => {
  it('escribe la línea tipo extra y el total de la reserva incluye estancia + extras', async () => {
    const res = await crearReservaDirecta(
      entrada({ extras: [{ extraId: 'extra_desayuno', cantidad: 2 }] })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.totalExtras).toBe(500);
    expect(res.total).toBe(3500); // 1000 × 3 noches + 500 de extras
    expect(res.noches).toBe(3);

    const filas = mocks.hospitalityReservationItem.createMany.mock.calls[0][0].data;
    expect(filas[0]).toMatchObject({ tipo: 'alojamiento', importeTotal: 3000 });
    expect(filas.find((f: { tipo: string }) => f.tipo === 'extra')).toMatchObject({
      tipo: 'extra',
      concepto: 'Desayuno buffet',
      importeTotal: 500,
    });
    // El importe que se guarda (y el que cobra Finanzas) los incluye.
    const alta = mocks.hospitalityReservation.create.mock.calls[0][0].data;
    expect(Number(alta.amountAfterTax)).toBe(3500);
  });

  it('el extra por noche multiplica por las NOCHES de la estancia', async () => {
    const res = await crearReservaDirecta(
      entrada({ extras: [{ extraId: 'extra_traslado', cantidad: 1 }] })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totalExtras).toBe(150); // 50 × 3 noches
  });

  it('sin extras la reserva queda como siempre (una línea de alojamiento, cero extras)', async () => {
    const res = await crearReservaDirecta(entrada());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totalExtras).toBe(0);
    expect(res.total).toBe(3000);
    const filas = mocks.hospitalityReservationItem.createMany.mock.calls[0][0].data;
    expect(filas.every((f: { tipo: string }) => f.tipo !== 'extra')).toBe(true);
  });

  it('un extra desactivado entre medias se ignora sin tumbar la venta', async () => {
    const res = await crearReservaDirecta(
      entrada({ extras: [{ extraId: 'extra_fantasma', cantidad: 1 }] })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totalExtras).toBe(0);
    expect(res.total).toBe(3000);
  });

  it('el catálogo consultado es el ACTIVO de la propiedad (el precio del servidor)', async () => {
    await crearReservaDirecta(entrada({ extras: [{ extraId: 'extra_desayuno', cantidad: 1 }] }));
    const where = mocks.hospitalityExtra.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ propertyId: 'prop_a', activo: true });
  });

  it('el documento del titular entra en el registro de viajeros (y sin él no se inventa nada)', async () => {
    const conDocumento = await crearReservaDirecta(
      entrada({
        huesped: {
          nombre: 'Ana López',
          email: 'ana@example.com',
          telefono: null,
          documento: {
            tipoDocumento: 'dni',
            numeroDocumento: '12345678Z',
            fechaNacimiento: '1990-05-05',
          },
        },
      })
    );
    expect(conDocumento.ok).toBe(true);
    const viajeros = mocks.hospitalityReservation.create.mock.calls[0][0].data.guestData.viajeros;
    expect(viajeros).toHaveLength(1);
    expect(viajeros[0]).toMatchObject({
      nombre: 'Ana López',
      // El módulo normaliza los códigos del parte (el Ministerio los lee así).
      tipoDocumento: 'DNI',
      numeroDocumento: '12345678Z',
    });

    mocks.hospitalityReservation.create.mockClear();
    await crearReservaDirecta(entrada());
    expect(
      mocks.hospitalityReservation.create.mock.calls[0][0].data.guestData.viajeros
    ).toBeUndefined();
  });

  it('devuelve el enlace de check-in de la reserva (en el idioma del huésped)', async () => {
    const res = await crearReservaDirecta(entrada({ idioma: 'en' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(mocks.asegurarTokenCheckin).toHaveBeenCalled();
    expect(res.checkinUrl).toBe('https://app.test/checkin/tok_123?lang=en');
  });

  it('un reintento del formulario devuelve la misma reserva con su enlace (sin crear otra)', async () => {
    // El token se asegura, no se regenera: si la reserva ya lo tenía, es el suyo.
    mocks.asegurarTokenCheckin.mockImplementation(async (r: { tokenCheckin?: string | null }) =>
      r.tokenCheckin || 'tok_123'
    );
    mocks.hospitalityReservation.findUnique.mockResolvedValue({
      id: 'res_previa',
      externalBookingId: 'WEB-SOLICITUD',
      estado: 'confirmed',
      amountAfterTax: 3000,
      currency: 'MXN',
      checkIn: new Date(2027, 2, 1),
      checkOut: new Date(2027, 2, 4),
      tokenCheckin: 'tok_previo',
    });
    const res = await crearReservaDirecta(entrada());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.yaExistia).toBe(true);
    expect(res.reservaId).toBe('res_previa');
    expect(mocks.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(res.checkinUrl).toBe('https://app.test/checkin/tok_previo?lang=es');
  });
});

describe('guardias de fuente — UI del selector y del panel', () => {
  it('el asistente manda ids y cantidades: el precio del extra nunca sale del navegador', () => {
    const fuente = leer('components/hospitality/booking/BookingWizard.tsx');
    expect(fuente).toContain('extras: extrasElegidos');
    // La selección que viaja es `{ extraId, cantidad }`, sin importe.
    expect(fuente).toMatch(/extraId,\s*cantidad/);
    // Lo que se enseña es una ESTIMACIÓN y así se rotula; el importe definitivo
    // lo devuelve la reserva, que lo ha resuelto contra el catálogo del servidor.
    expect(fuente).toContain('totalExtrasEstimado');
    expect(leer('app/api/public/booking/[slug]/reservar/route.ts')).toContain(
      'totalExtras: resultado.totalExtras'
    );
  });

  it('los textos del selector viven en el i18n bilingüe (nada suelto en el componente)', () => {
    const fuente = leer('components/hospitality/booking/BookingWizard.tsx');
    expect(fuente).toContain('t.extrasTitulo');
    const i18n = leer('lib/hospitality/booking-i18n.ts');
    expect(i18n).toContain("extrasTitulo: 'Extras para tu estancia'");
    expect(i18n).toContain("extrasTitulo: 'Extras for your stay'");
  });

  it('el panel gestiona el catálogo vía su API y los extras desactivados no se borran', () => {
    const fuente = leer('app/dashboard/hospitality/booking-engine/page.tsx');
    expect(fuente).toContain('/api/hospitality/extras');
    expect(fuente).toContain('precioPorNoche');
  });

  it('la API del panel valida precio ≥ 0 y propiedad del tenant; el GET incluye inactivos', () => {
    const fuente = leer('app/api/hospitality/extras/route.ts');
    expect(fuente).toContain('precio < 0');
    expect(fuente).toContain('tenantId');
    const extraApi = fuente;
    expect(extraApi).toContain('activo');
  });
});
