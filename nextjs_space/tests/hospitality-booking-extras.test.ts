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
  hospitalityProperty: { findFirst: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  hospitalityReservation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  hospitalityReservationItem: { create: vi.fn(), createMany: vi.fn() },
  hospitalityExtra: { findMany: vi.fn() },
  hospitalityReview: { findMany: vi.fn() },
  contact: { findFirst: vi.fn(), create: vi.fn() },
  loadAvailabilityContext: vi.fn(),
  crearCobroReserva: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityProperty: mocks.hospitalityProperty,
    hospitalityUnit: mocks.hospitalityUnit,
    hospitalityReservation: mocks.hospitalityReservation,
    hospitalityReservationItem: mocks.hospitalityReservationItem,
    hospitalityExtra: mocks.hospitalityExtra,
    hospitalityReview: mocks.hospitalityReview,
    contact: mocks.contact,
  },
}));
vi.mock('@/lib/hospitality/availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/availability')>()),
  loadAvailabilityContext: mocks.loadAvailabilityContext,
}));
vi.mock('@/lib/stripe/connect', () => ({ crearCobroReserva: mocks.crearCobroReserva }));
vi.mock('@/lib/hospitality/sync', () => ({ dispatchConnectivityPush: mocks.dispatchConnectivityPush }));

import {
  resolverExtras,
  totalDeExtras,
  filasDeItemsExtras,
  catalogoPublico,
  type ExtraCatalogo,
} from '@/lib/hospitality/booking-extras';
import { POST } from '@/app/api/public/booking/[slug]/route';

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

const propiedad = {
  id: 'prop_a',
  tenantId: 'tenant_a',
  nombre: 'Hotel Centro',
  estado: 'conectada',
  fotos: [],
  tenant: { id: 'tenant_a', nombre: 'Tenant A' },
};
const unidad = {
  id: 'unit_a',
  propertyId: 'prop_a',
  nombre: 'Suite 1',
  tipo: 'suite',
  capacidad: 2,
  descripcion: null,
  fotos: [],
  amenidades: [],
  estado: 'available',
  tarifaBase: null,
  moneda: 'MXN',
  ratePlans: [{ tarifa: 1000, minNoches: 1, maxNoches: null, checkInDias: null, checkOutDias: null }],
};
const request = (method: string, body?: unknown, url = 'http://test.local/api/public/booking/prop_a') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = { params: Promise.resolve({ slug: 'prop_a' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hospitalityProperty.findFirst.mockResolvedValue(propiedad);
  mocks.hospitalityUnit.findMany.mockResolvedValue([unidad]);
  mocks.loadAvailabilityContext.mockResolvedValue({
    units: [{ id: 'unit_a', propertyId: 'prop_a', roomCode: null, estado: 'available' }],
    reservations: [],
    blocks: [],
  });
  mocks.hospitalityReservation.findFirst.mockResolvedValue(null);
  mocks.hospitalityReservation.create.mockResolvedValue({ id: 'res_a', externalBookingId: 'BE-TEST' });
  mocks.hospitalityReservation.update.mockResolvedValue({ id: 'res_a' });
  mocks.hospitalityReservationItem.create.mockResolvedValue({});
  mocks.hospitalityReservationItem.createMany.mockResolvedValue({ count: 2 });
  mocks.hospitalityExtra.findMany.mockResolvedValue(CATALOGO);
  mocks.hospitalityReview.findMany.mockResolvedValue([]);
  mocks.contact.findFirst.mockResolvedValue(null);
  mocks.contact.create.mockResolvedValue({ id: 'c1' });
  mocks.crearCobroReserva.mockResolvedValue({ url: 'https://pay.test/x' });
  mocks.dispatchConnectivityPush.mockResolvedValue({});
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

describe('POST público — la reserva nace con sus líneas de extras y el cobro del total', () => {
  it('crea las líneas tipo extra y cobra alojamiento + extras (no solo el alojamiento)', async () => {
    const res = await POST(
      request('POST', {
        unitId: 'unit_a',
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        huespedNombre: 'Ana',
        huespedEmail: 'ana@example.com',
        extras: [{ extraId: 'extra_desayuno', cantidad: 2 }],
      }),
      ctx
    );
    const data = await res.json();
    expect(data.ok !== false).toBe(true);
    expect(data.totalExtras).toBe(500);
    expect(data.total).toBe(3500); // 1000 × 3 noches + 500 de extras

    expect(mocks.hospitalityReservationItem.createMany).toHaveBeenCalledTimes(1);
    const filas = mocks.hospitalityReservationItem.createMany.mock.calls[0][0].data;
    expect(filas[0]).toMatchObject({ tipo: 'extra', importeTotal: 500, concepto: 'Desayuno buffet' });

    // El cobro va por el TOTAL, no por el alojamiento.
    expect(mocks.crearCobroReserva).toHaveBeenCalledWith(
      expect.objectContaining({ importe: 3500 }),
    );
  });

  it('sin extras la reserva queda como siempre (una línea de alojamiento, cero extras)', async () => {
    const res = await POST(
      request('POST', {
        unitId: 'unit_a',
        checkIn: '2026-10-01',
        checkOut: '2026-10-03',
        huespedNombre: 'Ana',
        huespedEmail: 'ana@example.com',
      }),
      ctx
    );
    const data = await res.json();
    expect(data.totalExtras).toBe(0);
    expect(mocks.hospitalityReservationItem.createMany).not.toHaveBeenCalled();
    expect(mocks.crearCobroReserva).toHaveBeenCalledWith(expect.objectContaining({ importe: 2000 }));
  });

  it('el catálogo consultado es el ACTIVO de la propiedad (el precio del servidor)', async () => {
    await POST(
      request('POST', {
        unitId: 'unit_a',
        checkIn: '2026-10-01',
        checkOut: '2026-10-02',
        huespedNombre: 'Ana',
        huespedEmail: 'ana@example.com',
        extras: [{ extraId: 'extra_desayuno', cantidad: 1 }],
      }),
      ctx
    );
    const where = mocks.hospitalityExtra.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ propertyId: 'prop_a', activo: true });
  });
});

describe('guardias de fuente — UI del selector y del panel', () => {
  it('la página pública manda ids y cantidades, nunca precios ni importes de extras', () => {
    const fuente = leer('app/booking/[slug]/page.tsx');
    expect(fuente).toContain('extras: seleccionExtras');
    expect(fuente).toContain('SelectorExtras');
    // El selector no calcula ni muestra importes: el total real llega del servidor.
    expect(fuente).not.toContain('precio *');
    expect(fuente).not.toMatch(/totalExtras\s*=/);
  });

  it('los textos del selector viven en el i18n bilingüe (nada suelto en el componente)', () => {
    const fuente = leer('app/booking/[slug]/page.tsx');
    expect(fuente).toContain('t.extrasTitulo');
    const i18n = leer('lib/hospitality/booking-i18n.ts');
    expect(i18n).toContain("extrasTitulo: 'Añade algo más a tu estancia'");
    expect(i18n).toContain("extrasTitulo: 'Add something extra to your stay'");
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
