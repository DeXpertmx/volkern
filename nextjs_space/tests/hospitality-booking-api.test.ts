// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardia de la API pública del Booking Engine (FASE 3.D):
 *  - Solo propiedades PUBLICADAS ("conectada") responden; 404 si no.
 *  - La disponibilidad/precio se RECALCULA en el servidor con el motor central
 *    al crear la reserva: el precio del cliente nunca se confía.
 *  - La reserva entra al flujo común (canal "Directa") CON su línea de
 *    desglose (rentabilidad desde el minuto uno, criterio 1 + 3 del plan).
 *  - Idempotencia por idempotencyKey; 409 si las fechas ya no están libres.
 *  - Pago: se intenta Stripe Connect; si el tenant no tiene cuenta, la reserva
 *    se crea igual (sin pago en línea), nunca se rompe la venta.
 */

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
// Partial mock: se mockea SOLO la carga de datos (loadAvailabilityContext);
// el cálculo de disponibilidad (unitAvailability y demás) queda REAL, porque
// la guardia de esta fase es precisamente que el booking engine use el motor
// central y no su propio cálculo.
vi.mock('@/lib/hospitality/availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hospitality/availability')>()),
  loadAvailabilityContext: mocks.loadAvailabilityContext,
}));
vi.mock('@/lib/stripe/connect', () => ({
  crearCobroReserva: mocks.crearCobroReserva,
}));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: mocks.dispatchConnectivityPush,
}));

import { GET, POST } from '@/app/api/public/booking/[slug]/route';

const propiedad = {
  id: 'prop_a',
  tenantId: 'tenant_a',
  nombre: 'Hotel Centro',
  descripcion: 'En el centro',
  ciudad: 'CDMX',
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
  ratePlans: [{ tarifa: 100, minNoches: 1, maxNoches: null, checkInDias: null, checkOutDias: null }],
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
  mocks.hospitalityExtra.findMany.mockResolvedValue([]);
  mocks.hospitalityReview.findMany.mockResolvedValue([]);
  mocks.contact.findFirst.mockResolvedValue({ id: 'contact_a' });
  mocks.contact.create.mockResolvedValue({ id: 'contact_nuevo' });
  mocks.crearCobroReserva.mockResolvedValue({ url: 'https://checkout.stripe.com/x', sessionId: 'cs_x' });
  mocks.dispatchConnectivityPush.mockResolvedValue({ ok: true, pushCount: 1, errores: 0 });
});

describe('GET — catálogo y cotización pública', () => {
  it('solo propiedades publicadas ("conectada") responden', async () => {
    mocks.hospitalityProperty.findFirst.mockResolvedValue(null);

    const res = await GET(request('GET'), ctx);
    expect(res.status).toBe(404);

    // La consulta filtra por estado conectada.
    const where = mocks.hospitalityProperty.findFirst.mock.calls[0][0].where;
    expect(where.estado).toBe('conectada');
  });

  it('sin fechas devuelve el catálogo con tarifa del rate plan', async () => {
    const res = await GET(request('GET'), ctx);
    const data = await res.json();

    expect(data.propiedad.nombre).toBe('Hotel Centro');
    expect(data.unidades[0].tarifaNoche).toBe(100);
  });

  it('con fechas cotiza: disponible con precio = noches × tarifa', async () => {
    const res = await GET(request('GET', undefined, 'http://test.local/api/public/booking/prop_a?checkIn=2026-09-10&checkOut=2026-09-13'), ctx);
    const data = await res.json();

    expect(data.cotizacion.noches).toBe(3);
    expect(data.cotizacion.unidades[0].disponible).toBe(true);
    expect(data.cotizacion.unidades[0].precioTotal).toBe(300);
    // La ficha muestra la tarifa por noche junto al total: si la cotización no
    // la trae, la página pinta 0.00/noche (incidencia detectada en el ensayo E2E).
    expect(data.cotizacion.unidades[0].tarifaNoche).toBe(100);
  });

  it('aplica las restricciones del rate plan de la unidad, igual que la reserva', async () => {
    // Plan con estancia mínima de 3 noches (el resto del fixture no cambia).
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      { ...unidad, ratePlans: [{ tarifa: 100, minNoches: 3, maxNoches: null, checkInDias: null, checkOutDias: null }] },
    ]);

    const urlCorta = 'http://test.local/api/public/booking/prop_a?checkIn=2026-09-10&checkOut=2026-09-12'; // 2 noches
    const res = await GET(request('GET', undefined, urlCorta), ctx);
    const data = await res.json();

    // La página NO puede ofrecer algo que la reserva va a rechazar.
    expect(data.cotizacion.unidades[0].disponible).toBe(false);
    expect(data.cotizacion.unidades[0].motivo).toBe('min_noches');

    const post = await POST(
      request('POST', {
        unitId: 'unit_a',
        checkIn: '2026-09-10',
        checkOut: '2026-09-12',
        huespedNombre: 'Ana García',
        huespedEmail: 'ana@mail.com',
        idempotencyKey: 'estancia-corta',
      }),
      ctx
    );
    expect(post.status).toBe(409);
    expect(mocks.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('usa el Availability Engine central (carga el contexto del tenant)', async () => {
    await GET(request('GET', undefined, 'http://test.local/api/public/booking/prop_a?checkIn=2026-09-10&checkOut=2026-09-13'), ctx);

    expect(mocks.loadAvailabilityContext).toHaveBeenCalledTimes(1);
    const [prismaArg, tenantId, propertyId] = mocks.loadAvailabilityContext.mock.calls[0];
    expect(tenantId).toBe('tenant_a');
    expect(propertyId).toBe('prop_a');
  });
});

describe('POST — reserva pública en el flujo común', () => {
  const body = {
    unitId: 'unit_a',
    checkIn: '2026-09-10',
    checkOut: '2026-09-13',
    huespedNombre: 'Ana García',
    huespedEmail: 'ana@mail.com',
    idempotencyKey: 'intento-1',
  };

  it('crea la reserva como canal "Directa" CON línea de desglose', async () => {
    const res = await POST(request('POST', body), ctx);
    const data = await res.json();

    expect(res.status).toBe(201);
    const created = mocks.hospitalityReservation.create.mock.calls[0][0].data;
    expect(created.channel).toBe('Directa');
    expect(created.externalBookingId).toBe('BE-intento-1'); // idempotencia por key
    expect(created.amountAfterTax).toBe(300); // precio recalculado en servidor
    expect(created.estado).toBe('confirmed');

    // La línea de desglose nace con la reserva (criterio 3).
    expect(mocks.hospitalityReservationItem.create).toHaveBeenCalledTimes(1);
    const item = mocks.hospitalityReservationItem.create.mock.calls[0][0].data;
    expect(item.tipo).toBe('alojamiento');
    expect(item.importeTotal).toBe(300);
    expect(data.paymentUrl).toBe('https://checkout.stripe.com/x');

    // Enlace de check-in desde el minuto uno: es lo que le permite al huésped
    // completar los documentos de su grupo (sin él, el parte de viajeros espera
    // a que alguien del hotel lo complete a mano).
    const token = mocks.hospitalityReservation.update.mock.calls[0][0].data.tokenCheckin as string;
    expect(token).toBeTruthy();
    expect(data.checkinUrl).toContain(`/checkin/${token}`);
    expect(data.checkinUrl).toContain('?lang=es');

    // Empuja la disponibilidad al canal igual que una reserva de OTA: sin esto
    // el canal seguiría vendiendo la habitación que la web acaba de vender.
    expect(mocks.dispatchConnectivityPush).toHaveBeenCalledWith('tenant_a', 'prop_a', 'reserva_creada', {
      skipRates: true,
    });
  });

  it('si el push de conectividad falla, la reserva se crea igual (no rompe la venta)', async () => {
    mocks.dispatchConnectivityPush.mockRejectedValue(new Error('conectividad caída'));

    const res = await POST(request('POST', body), ctx);
    expect(res.status).toBe(201);
    expect(mocks.hospitalityReservation.create).toHaveBeenCalledTimes(1);
  });

  it('recalcula disponibilidad en servidor: 409 si las fechas ya no están libres', async () => {
    mocks.loadAvailabilityContext.mockResolvedValue({
      units: [{ id: 'unit_a', propertyId: 'prop_a', roomCode: null, estado: 'available' }],
      reservations: [{ unitId: 'unit_a', checkIn: new Date('2026-09-11T15:00:00'), checkOut: new Date('2026-09-12T11:00:00'), estado: 'confirmed' }],
      blocks: [],
    });

    const res = await POST(request('POST', body), ctx);
    expect(res.status).toBe(409);
    expect(mocks.hospitalityReservation.create).not.toHaveBeenCalled();
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('idempotencia: la misma key devuelve la reserva existente sin duplicar', async () => {
    mocks.hospitalityReservation.findFirst.mockResolvedValue({ id: 'res_ya_creada' });

    const res = await POST(request('POST', body), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reservationId).toBe('res_ya_creada');
    expect(data.duplicada).toBe(true);
    expect(mocks.hospitalityReservation.create).not.toHaveBeenCalled();
    // Un reintento idempotente no vuelve a empujar disponibilidad.
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('guarda los datos del documento que dejó el huésped (para el registro de viajeros)', async () => {
    const conDocumento = {
      ...body,
      idempotencyKey: 'con-documento',
      lang: 'en',
      documento: {
        apellido1: 'García',
        apellido2: 'López',
        tipoDocumento: 'nif',
        numeroDocumento: '00000000t',
        soporteDocumento: '999999999',
        fechaNacimiento: '1990-01-01',
        nacionalidad: 'esp',
        sexo: 'H',
        direccion: { direccion: 'C/Mayor 1', codigoPostal: '28001', pais: 'esp', codigoMunicipio: '28079' },
      },
    };

    const res = await POST(request('POST', conDocumento), ctx);
    expect(res.status).toBe(201);

    const guestData = mocks.hospitalityReservation.create.mock.calls[0][0].data.guestData;
    expect(guestData.idioma).toBe('en');
    expect(guestData.viajeros).toHaveLength(1);
    // Se guarda en el formato del Ministerio, en mayúsculas y con el nombre del
    // formulario principal (el huésped no tiene por qué repetirlo).
    expect(guestData.viajeros[0]).toMatchObject({
      nombre: 'Ana García',
      apellido1: 'García',
      tipoDocumento: 'NIF',
      numeroDocumento: '00000000T',
      nacionalidad: 'ESP',
      direccion: { direccion: 'C/Mayor 1', codigoPostal: '28001', pais: 'ESP', codigoMunicipio: '28079' },
    });
  });

  it('sin datos de documento NO inventa un viajero (lo pedirá el enlace de check-in)', async () => {
    const res = await POST(request('POST', { ...body, idempotencyKey: 'sin-documento', documento: { nombre: '' } }), ctx);
    expect(res.status).toBe(201);

    const guestData = mocks.hospitalityReservation.create.mock.calls[0][0].data.guestData;
    expect(guestData.viajeros).toBeUndefined();
  });

  it('valida huésped (nombre y email) y unidad antes de tocar la base', async () => {
    const casos = [
      { ...body, huespedNombre: '' },
      { ...body, huespedEmail: 'no-es-un-email' },
      { ...body, unitId: 'unit_inexistente' },
    ];
    for (const caso of casos) {
      const res = await POST(request('POST', caso), ctx);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(mocks.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('reutiliza el contacto CRM por email y crea la reserva sin pago si no hay Connect', async () => {
    mocks.contact.findFirst.mockResolvedValue(null);
    mocks.crearCobroReserva.mockRejectedValue(new Error('El tenant no tiene cuenta Stripe Connect: completa el onboarding primero'));

    const res = await POST(request('POST', body), ctx);
    const data = await res.json();

    // La venta NO se rompe por no tener pago en línea.
    expect(res.status).toBe(201);
    expect(mocks.contact.create).toHaveBeenCalledTimes(1);
    expect(data.paymentUrl).toBeNull();
  });

  it('propiedad no publicada: 404 y sin crear nada', async () => {
    mocks.hospitalityProperty.findFirst.mockResolvedValue(null);

    const res = await POST(request('POST', body), ctx);
    expect(res.status).toBe(404);
    expect(mocks.hospitalityReservation.create).not.toHaveBeenCalled();
  });
});
