// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityWebhookEvent: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

const { GET } = await import('@/app/api/hospitality/incidencias/route');

const PROPIEDAD = {
  id: 'p1',
  nombre: 'Villa Mar Azul',
  mappings: [
    { externalPropertyId: 'sandbox-pms', externalUnitCode: 'suite', estado: 'activo', unit: { id: 'u1', nombre: 'Suite Oceano' } },
    { externalPropertyId: 'sandbox-pms', externalUnitCode: 'executive', estado: 'activo', unit: { id: 'u2', nombre: 'Executive' } },
  ],
};

function evento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev_1',
    hotelCode: 'sandbox-pms',
    bookingId: 'BKG-1',
    channel: 'Airbnb',
    action: 'book',
    errorMensaje: 'Sin mapping de unidad para hotelCode sandbox-pms y roomCode Penthouse (rateplan penthouse-ep)',
    payload: { rooms: [{ roomCode: 'Penthouse', rateplanCode: 'penthouse-ep' }] },
    fechaCreacion: new Date('2026-09-10T10:00:00.000Z'),
    ...overrides,
  };
}

function req(url = 'https://volkern.app/api/hospitality/incidencias') {
  return new Request(url) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1' } });
  mocks.hospitalityProperty.findMany.mockResolvedValue([PROPIEDAD]);
  mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([]);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
});

describe('GET /api/hospitality/incidencias', () => {
  it('sin autenticación → 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'API key no proporcionada' });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('propiedad de otro tenant → 404', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([]);
    const res = await GET(req('https://volkern.app/api/hospitality/incidencias?propertyId=p9'));
    expect(res.status).toBe(404);
  });

  it('agrupa por roomCode/rateplan aunque cambien mayúsculas y espacios', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento(),
      evento({
        id: 'ev_2',
        bookingId: 'BKG-2',
        channel: 'Booking.com',
        payload: { rooms: [{ roomCode: '  penthouse ', rateplanCode: 'Penthouse-EP' }] },
        fechaCreacion: new Date('2026-09-09T09:00:00.000Z'),
      }),
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.incidencias).toHaveLength(1);

    const inc = body.incidencias[0];
    expect(inc.roomCode).toBe('Penthouse');
    expect(inc.rateplanCode).toBe('penthouse-ep');
    expect(inc.hotelCode).toBe('sandbox-pms');
    expect(inc.property).toBe('Villa Mar Azul');
    expect(inc.tipo).toBe('roomcode_sin_mapping');
    expect(inc.intentos).toBe(2);
    expect(inc.bookingIds).toEqual(['BKG-1', 'BKG-2']);
    expect(inc.canales).toEqual(['Airbnb', 'Booking.com']);
    expect(inc.errorMensaje).toContain('Penthouse');
    expect(inc.ultimaFecha).toBe('2026-09-10T10:00:00.000Z');
    expect(inc.primeraFecha).toBe('2026-09-09T09:00:00.000Z');
    // Sin vínculo: no hay nada que reenviar todavía.
    expect(inc.vinculo).toBeNull();
    expect(inc.eventoIds).toEqual([]);
    expect(inc.registradas).toBe(0);

    expect(body.resumen).toEqual({ pendientes: 1, vinculadas: 0, resueltas: 0, eventosAnalizados: 2 });
  });

  it('con vínculo ya creado devuelve los eventos a reenviar', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ payload: { rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }] } }),
    ]);

    const res = await GET(req());
    const body = await res.json();

    const inc = body.incidencias[0];
    expect(inc.vinculo).toEqual({ unitId: 'u1', unit: 'Suite Oceano', externalUnitCode: 'suite' });
    expect(inc.eventoIds).toEqual(['ev_1']);
    expect(inc.registradas).toBe(0);
    expect(body.resumen).toEqual({ pendientes: 0, vinculadas: 1, resueltas: 0, eventosAnalizados: 1 });
  });

  it('no lista las que ya tienen su reserva registrada (solo las resume)', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ payload: { rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }] } }),
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ externalBookingId: 'BKG-1' }]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.incidencias).toHaveLength(0);
    expect(body.resumen).toEqual({ pendientes: 0, vinculadas: 0, resueltas: 1, eventosAnalizados: 1 });
  });

  it('excluye de eventoIds las reservas ya registradas de un grupo mixto', async () => {
    const habitacion = { rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }] };
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ id: 'ev_ok', bookingId: 'BKG-OK', payload: habitacion }),
      evento({ id: 'ev_ko', bookingId: 'BKG-KO', channel: 'Booking.com', payload: habitacion }),
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ externalBookingId: 'BKG-OK' }]);

    const res = await GET(req());
    const body = await res.json();

    const inc = body.incidencias[0];
    expect(inc.registradas).toBe(1);
    expect(inc.eventoIds).toEqual(['ev_ko']);
    expect(inc.bookingIds).toEqual(['BKG-OK', 'BKG-KO']);
  });

  it('hotelCode sin vínculo activo → incidencia de propiedad, no de habitación', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Villa Mar Azul',
        mappings: [
          { externalPropertyId: 'sandbox-pms', externalUnitCode: 'suite', estado: 'inactivo', unit: { id: 'u1', nombre: 'Suite Oceano' } },
        ],
      },
    ]);
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([evento()]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.incidencias).toHaveLength(1);
    expect(body.incidencias[0].tipo).toBe('propiedad_sin_mapping');
    expect(body.incidencias[0].vinculo).toBeNull();
  });

  it('un payload sin roomCode se resuelve si la propiedad tiene vínculo sin unidad', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Villa Mar Azul',
        mappings: [
          { externalPropertyId: 'sandbox-pms', externalUnitCode: null, estado: 'activo', unit: { id: 'u1', nombre: 'Casa completa' } },
        ],
      },
    ]);
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ payload: { rooms: [] }, errorMensaje: 'Sin mapping de unidad para hotelCode sandbox-pms y roomCode null' }),
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.incidencias[0].roomCode).toBeNull();
    expect(body.incidencias[0].vinculo).toEqual({
      unitId: 'u1',
      unit: 'Casa completa',
      externalUnitCode: '',
    });
    expect(body.incidencias[0].eventoIds).toEqual(['ev_1']);
  });

  it('consulta solo los hotelCode del tenant y no consulta eventos sin propiedades', async () => {
    await GET(req());
    const where = mocks.hospitalityWebhookEvent.findMany.mock.calls[0][0].where;
    expect(where.estado).toBe('sin_mapping');
    expect(where.hotelCode.in).toEqual(['sandbox-pms']);

    mocks.hospitalityWebhookEvent.findMany.mockClear();
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      { id: 'p1', nombre: 'Villa Mar Azul', mappings: [] },
    ]);
    const res = await GET(req());
    const body = await res.json();

    expect(body.incidencias).toEqual([]);
    expect(body.resumen.eventosAnalizados).toBe(0);
    expect(mocks.hospitalityWebhookEvent.findMany).not.toHaveBeenCalled();
  });

  it('primero lo que falta vincular y, dentro de cada bloque, lo más reciente', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      // Con vínculo (suite) pero reciente: va después de las pendientes.
      evento({
        id: 'ev_suite',
        bookingId: 'BKG-SUITE',
        payload: { rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }] },
        fechaCreacion: new Date('2026-09-13T10:00:00.000Z'),
      }),
      // Pendiente, reciente.
      evento({
        id: 'ev_new',
        bookingId: 'BKG-NEW',
        payload: { rooms: [{ roomCode: 'cabanas', rateplanCode: 'cabanas-ep' }] },
        fechaCreacion: new Date('2026-09-12T10:00:00.000Z'),
      }),
      // Pendiente, más antigua.
      evento(),
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.incidencias.map((i: { roomCode: string | null }) => i.roomCode)).toEqual([
      'cabanas',
      'Penthouse',
      'suite',
    ]);
    expect(body.resumen).toEqual({ pendientes: 2, vinculadas: 1, resueltas: 0, eventosAnalizados: 3 });
  });

  it('un mismo booking repetido no cuenta dos veces', async () => {
    const habitacion = { rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }] };
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      evento({ id: 'ev_1', payload: habitacion }),
      evento({ id: 'ev_2', payload: habitacion, fechaCreacion: new Date('2026-09-09T09:00:00.000Z') }),
    ]);

    const res = await GET(req());
    const body = await res.json();

    expect(body.incidencias[0].intentos).toBe(2);
    expect(body.incidencias[0].bookingIds).toEqual(['BKG-1']);
    // Solo el evento más reciente de esa reserva se ofrece para reenviar.
    expect(body.incidencias[0].eventoIds).toEqual(['ev_1']);
  });

  it('un fallo de base de datos responde 500', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockRejectedValue(new Error('db caída'));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  describe('grupos de cancel (action cancel)', () => {
    function eventoCancel(overrides: Record<string, unknown> = {}) {
      return evento({
        action: 'cancel',
        errorMensaje: 'Sin mapping de unidad para hotelCode sandbox-pms y roomCode penthouse',
        payload: { rooms: [{ roomCode: 'Penthouse', rateplanCode: 'penthouse-ep' }] },
        ...overrides,
      });
    }

    function reserva(overrides: Record<string, unknown> = {}) {
      return { externalBookingId: 'BKG-1', estado: 'confirmed', ...overrides };
    }

    it('ofrece el reenvío de un cancel de una reserva registrada y viva aunque no haya vínculo', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([eventoCancel()]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([reserva({ estado: 'confirmed' })]);

      const res = await GET(req());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.incidencias).toHaveLength(1);
      // Cancelar no necesita mapping: se aplica por bookingId.
      expect(body.incidencias[0].eventoIds).toEqual(['ev_1']);
      // El grupo no cuenta como pendiente de vincular (no se puede vincular un
      // cancel) ni como resuelto (el efecto no se ha aplicado todavía).
      expect(body.resumen).toEqual({ pendientes: 0, vinculadas: 0, resueltas: 0, eventosAnalizados: 1 });
    });

    it('un cancel cuya reserva ya está cancelada se da por resuelto', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([eventoCancel()]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([reserva({ estado: 'cancelled' })]);

      const res = await GET(req());
      const body = await res.json();

      expect(body.incidencias).toHaveLength(0);
      expect(body.resumen.resueltas).toBe(1);
    });

    it('un cancel cuya reserva nunca llegó se queda a la vista sin ofrecer reenvío', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([eventoCancel()]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([]);

      const res = await GET(req());
      const body = await res.json();

      expect(body.incidencias).toHaveLength(1);
      // Sin reserva registrada el cancel no tiene efecto: no se ofrece (el
      // operador decide si registrar el book primero con el vínculo correcto).
      expect(body.incidencias[0].eventoIds).toEqual([]);
    });

    it('un grupo mixto book+cancel no se trata como cancel: manda el book', async () => {
      // El canal reenvió el book y luego lo canceló, y ninguno entró: el grupo
      // mezcla acciones, así que no puede usar el atajo del cancel (que ignora
      // el vínculo) — sin vínculo no se ofrece reenvío alguno.
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
        eventoCancel({ id: 'ev_cancel', bookingId: 'BKG-9' }),
        evento({ id: 'ev_book', bookingId: 'BKG-9' }),
      ]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([]);

      const res = await GET(req());
      const body = await res.json();

      expect(body.incidencias).toHaveLength(1);
      const inc = body.incidencias[0];
      expect(inc.acciones).toEqual(['cancel', 'book']);
      expect(inc.eventoIds).toEqual([]);
      expect(body.resumen.pendientes).toBe(1);
    });
  });

  describe('bookings multi-habitación', () => {
    function eventoMulti(overrides: Record<string, unknown> = {}) {
      return evento({
        errorMensaje:
          'Reserva multi-habitación no soportada: el booking BKG-1 trae 2 habitaciones (suite, executive) y este sistema registra una reserva por booking',
        payload: {
          rooms: [
            { roomCode: 'suite', rateplanCode: 'suite-ep' },
            { roomCode: 'executive', rateplanCode: 'exec-ep' },
          ],
        },
        ...overrides,
      });
    }

    it('aparecen con su propio tipo, se ofrecen para partir y cuentan como pendientes', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([eventoMulti()]);

      const res = await GET(req());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.incidencias).toHaveLength(1);
      const inc = body.incidencias[0];
      expect(inc.tipo).toBe('multi_habitacion');
      expect(inc.errorMensaje).toContain('multi-habitación');
      // El reenvío no aplica (reproduciría el rechazo), pero el evento SÍ se
      // ofrece: alimenta el registro manual partido (una unidad por habitación).
      expect(inc.eventoIds).toEqual(['ev_1']);
      // Cada habitación del booking con su ocupación y sin partes registradas.
      expect(inc.habitaciones).toHaveLength(2);
      expect(inc.habitaciones[0]).toMatchObject({ indice: 0, roomCode: 'suite', bookingId: 'BKG-1', registradas: [] });
      expect(inc.habitaciones[1]).toMatchObject({ indice: 1, roomCode: 'executive', bookingId: 'BKG-1', registradas: [] });
      // Quedan partes por registrar: cuenta como pendiente.
      expect(body.resumen).toEqual({ pendientes: 1, vinculadas: 0, resueltas: 0, eventosAnalizados: 1 });
    });

    it('con TODAS las partes registradas se da por resuelto y deja de ofrecerse', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([eventoMulti()]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([
        { externalBookingId: 'BKG-1#1', estado: 'confirmed' },
        { externalBookingId: 'BKG-1#2', estado: 'confirmed' },
      ]);

      const res = await GET(req());
      const body = await res.json();

      expect(body.incidencias).toHaveLength(0);
      expect(body.resumen.resueltas).toBe(1);
    });

    it('se listan antes que las de vinculación (el vínculo no las arregla)', async () => {
      // La habitación del grupo normal SÍ tiene vínculo (bloque de "listas"),
      // y aun así la multi-habitación se lista primero.
      mocks.hospitalityProperty.findMany.mockResolvedValue([
        {
          id: 'p1',
          nombre: 'Villa Mar Azul',
          mappings: [
            ...PROPIEDAD.mappings,
            { externalPropertyId: 'sandbox-pms', externalUnitCode: 'penthouse', estado: 'activo', unit: { id: 'u3', nombre: 'Penthouse' } },
          ],
        },
      ]);
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
        evento({ id: 'ev_map' }),
        eventoMulti({ id: 'ev_multi' }),
      ]);

      const res = await GET(req());
      const body = await res.json();

      expect(body.incidencias.map((i: { tipo: string }) => i.tipo)).toEqual([
        'multi_habitacion',
        'roomcode_sin_mapping',
      ]);
    });
  });

  // ── Filtro no_show: los eventos que el canal reportó como no-show, con el ──
  // importe emitido de cada penalización (el operador revisa aquí lo que el
  // webhook entrante marcó, sin entrar a la base).
  describe('GET ?tipo=no_show', () => {
    it('sin autenticación → 401', async () => {
      mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'no' });
      const res = await GET(req('https://volkern.app/api/hospitality/incidencias?tipo=no_show'));
      expect(res.status).toBe(401);
    });

    it('propiedad de otro tenant → 404', async () => {
      mocks.hospitalityProperty.findMany.mockResolvedValue([]);
      const res = await GET(req('https://volkern.app/api/hospitality/incidencias?tipo=no_show&propertyId=p9'));
      expect(res.status).toBe(404);
    });

    it('devuelve los no_show del canal con su penalización emitida', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
        {
          reservationId: 'r1',
          bookingId: 'BKG-NS-1',
          channel: 'Directa',
          hotelCode: 'sandbox-pms',
          fechaCreacion: new Date('2026-09-17T10:00:00.000Z'),
        },
        // Reintento del canal del MISMO booking: no produce segunda fila.
        {
          reservationId: 'r1',
          bookingId: 'BKG-NS-1',
          channel: 'Directa',
          hotelCode: 'sandbox-pms',
          fechaCreacion: new Date('2026-09-17T12:00:00.000Z'),
        },
      ]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([
        {
          id: 'r1',
          propertyId: 'p1',
          unitId: 'u1',
          channel: 'Directa',
          externalBookingId: 'BKG-NS-1',
          estado: 'no_show',
          checkIn: new Date('2026-09-18'),
          checkOut: new Date('2026-09-20'),
          guestData: { firstName: 'María', lastName: 'García', email: 'maria@example.com' },
          unit: { nombre: 'Suite Oceano' },
          property: { nombre: 'Villa Mar Azul' },
          items: [{ importeTotal: 500, moneda: 'MXN', invoiceId: 'inv_1' }],
        },
      ]);

      const res = await GET(req('https://volkern.app/api/hospitality/incidencias?tipo=no_show'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.noShows).toHaveLength(1);
      const fila = body.noShows[0];
      expect(fila.referencia).toBe('BKG-NS-1');
      expect(fila.huesped).toBe('María García');
      expect(fila.unit).toBe('Suite Oceano');
      expect(fila.intentos).toBe(2);
      expect(fila.penalizacion).toEqual({ importe: 500, moneda: 'MXN', facturada: true });
      expect(body.resumen).toEqual({ total: 1, conPenalizacion: 1 });
    });

    it('un no_show sin cargo se muestra con penalizacion null (canal externo o política «ninguna»)', async () => {
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
        {
          reservationId: 'r2',
          bookingId: 'BKG-NS-2',
          channel: 'Airbnb',
          hotelCode: 'sandbox-pms',
          fechaCreacion: new Date('2026-09-16T08:00:00.000Z'),
        },
      ]);
      mocks.hospitalityReservation.findMany.mockResolvedValue([
        {
          id: 'r2',
          propertyId: 'p1',
          unitId: 'u2',
          channel: 'Airbnb',
          externalBookingId: 'BKG-NS-2',
          estado: 'no_show',
          checkIn: new Date('2026-09-18'),
          checkOut: new Date('2026-09-21'),
          guestData: { firstName: 'Luis' },
          unit: { nombre: 'Executive' },
          property: { nombre: 'Villa Mar Azul' },
          items: [], // el canal externo cobra la suya: sin cargo del hotel
        },
      ]);

      const res = await GET(req('https://volkern.app/api/hospitality/incidencias?tipo=no_show'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.noShows).toHaveLength(1);
      expect(body.noShows[0].penalizacion).toBeNull();
      expect(body.resumen).toEqual({ total: 1, conPenalizacion: 0 });
    });
  });
});
