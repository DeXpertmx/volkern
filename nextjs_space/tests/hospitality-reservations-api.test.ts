import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del POST /api/hospitality/reservations (alta manual de reservas):
 * validaciones, prevención de overbooking (§16), creación de contacto CRM
 * y push de disponibilidad.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn());
const mockAudit = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  hospitalityProperty: { findFirst: vi.fn() },
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityReservation: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  contact: { findFirst: vi.fn(), create: vi.fn() },
  hospitalityGuestRegistryCommunication: { findMany: vi.fn() },
  // Preguntas personalizadas del check-in: la API etiqueta las respuestas
  // guardadas en cada reserva con el texto de la pregunta (id → es).
  hospitalityCheckinPregunta: { findMany: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db', () => ({ prisma }));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: (...a: any[]) => mockAuth(...a),
}));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mockAudit }));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: mockDispatch,
}));

import { GET, POST } from '../app/api/hospitality/reservations/route';

function buildReq(method: string, body?: any, url = 'https://volkern.app/api/hospitality/reservations') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

const AUTH_OK = { valid: true, tenant: { id: 't1' }, user: { id: 'u1' } };

describe('GET /api/hospitality/reservations (filtros)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);
    prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
  });

  it('autenticación inválida → 401', async () => {
    mockAuth.mockResolvedValue({ valid: false, error: 'no auth' });
    const res = await GET(buildReq('GET'));
    expect(res.status).toBe(401);
  });

  it('filtra por estado simple', async () => {
    await GET(buildReq('GET', undefined, 'https://volkern.app/api/hospitality/reservations?estado=confirmed'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.estado).toBe('confirmed');
  });

  it('filtra por varios estados separados por coma', async () => {
    await GET(buildReq('GET', undefined, 'https://volkern.app/api/hospitality/reservations?estado=confirmed,checked_in'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.estado).toEqual({ in: ['confirmed', 'checked_in'] });
  });

  it('búsqueda q filtra por referencia y datos de huésped', async () => {
    await GET(buildReq('GET', undefined, 'https://volkern.app/api/hospitality/reservations?q=AB-123'));
    const where = prisma.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalBookingId: expect.objectContaining({ contains: 'AB-123' }) }),
      ])
    );
  });

  // El parte de viajeros de cada reserva se calcula en la lista (RD 933/2021):
  // la pantalla avisa de los huéspedes sin datos y permite completarlos ahí.
  describe('parte de viajeros', () => {
    const RESERVA = (extra: Record<string, unknown>) => ({
      id: 'r1',
      estado: 'confirmed',
      checkIn: new Date('2026-07-01T15:00:00Z'),
      checkOut: new Date('2026-07-05T11:00:00Z'),
      guestData: {},
      ...extra,
    });

    it('marca la reserva a la que le faltan los datos del huésped', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        { reservationId: 'r1', estado: 'datos_incompletos' },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({
        aplica: true,
        completo: false,
        // Sin fichas guardadas: la pantalla dice «sin datos de ningún viajero»
        // en vez de una lista de campos vacía.
        viajeros: 0,
        faltan: [],
        estado: 'datos_incompletos',
        comunicada: false,
      });
    });

    it('distingue «no hay documentación» de «hay campos por revisar»', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([
        RESERVA({ guestData: { viajeros: [{ nombre: 'Ana' }] } }),
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      const parte = reservations[0].parteViajeros;
      expect(parte.viajeros).toBe(1);
      // La ficha existe pero está a medias: se listan los campos que bloquean.
      expect(parte.faltan.length).toBeGreaterThan(0);
      expect(parte.faltan).toContain('numeroDocumento');
    });

    it('con los datos completos el parte queda listo (y ya no hay nada que avisar)', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([
        RESERVA({
          guestData: {
            viajeros: [
              {
                nombre: 'Ana',
                apellido1: 'Pérez',
                apellido2: 'Gómez',
                tipoDocumento: 'NIF',
                numeroDocumento: '12345678Z',
                // El NIF/NIE exige número de soporte y segundo apellido: son las
                // dos reglas que más partes incompletos producen.
                soporteDocumento: 'ABC123456',
                fechaNacimiento: '1990-05-04',
                nacionalidad: 'ESP',
                sexo: 'M',
                telefono: '+34600111222',
                direccion: { direccion: 'Calle Mayor 1', codigoPostal: '28013', pais: 'ESP', codigoMunicipio: '28079' },
              },
            ],
          },
        }),
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({ aplica: true, completo: true, viajeros: 1 });
      expect(reservations[0].parteViajeros.faltan).toEqual([]);
    });

    it('la última comunicación es la que manda (un alta rechazada y otra aceptada)', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      // Orden por fecha de edición descendente: el primero viene de Prisma.
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        { reservationId: 'r1', estado: 'aceptada' },
        { reservationId: 'r1', estado: 'datos_incompletos' },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({ estado: 'aceptada', comunicada: true });
    });

    it('trae el motivo del rechazo del Ministerio y qué hay que corregir', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([
        RESERVA({
          guestData: {
            viajeros: [
              {
                nombre: 'Ana',
                apellido1: 'Pérez',
                apellido2: 'Gómez',
                tipoDocumento: 'NIF',
                numeroDocumento: '12345678Z',
                soporteDocumento: 'ABC123456',
                fechaNacimiento: '1990-05-04',
                telefono: '+34600111222',
                direccion: { direccion: 'Calle Mayor 1', codigoPostal: '28013', pais: 'ESP', codigoMunicipio: '28079' },
              },
            ],
          },
        }),
      ]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        {
          reservationId: 'r1',
          estado: 'rechazada',
          descripcion: 'El campo persona[0].numeroDocumento no tiene un formato válido',
          codigoRetorno: '10130',
          errores: [],
        },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();
      const parte = reservations[0].parteViajeros;

      // Los datos están completos: lo que falla es el parte, no la ficha.
      expect(parte).toMatchObject({ completo: true, rechazado: true, comunicada: false });
      expect(parte.rechazo).toMatchObject({ codigo: '10130', ambito: 'datos', campos: ['numeroDocumento'] });
      expect(parte.rechazo.motivo).toContain('no tiene un formato válido');
    });

    it('un rechazo de configuración NO se cuenta como datos del huésped', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        {
          reservationId: 'r1',
          estado: 'rechazada',
          descripcion: 'El código de arrendador no existe en el sistema',
          codigoRetorno: '10103',
          errores: null,
        },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros.rechazo).toMatchObject({
        ambito: 'configuracion',
        campos: [],
      });
    });

    it('marca el rechazo que el barrido ya NO va a reintentar (intentos agotados)', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        {
          reservationId: 'r1',
          estado: 'rechazada',
          descripcion: 'El código de arrendador no existe en el sistema',
          codigoRetorno: '10103',
          errores: null,
          intentos: 5,
        },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({ abandonado: true, intentos: 5 });
    });

    it('un rechazo con intentos de sobra sigue contando con el barrido', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        {
          reservationId: 'r1',
          estado: 'rechazada',
          descripcion: 'Error de validación',
          codigoRetorno: '10130',
          errores: [],
          intentos: 2,
        },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({ abandonado: false, intentos: 2 });
    });

    it('un parte incompleto no se abandona aunque tenga muchos intentos: no gasta ninguno', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        { reservationId: 'r1', estado: 'datos_incompletos', descripcion: 'Faltan datos', intentos: 5 },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({ abandonado: false, rechazado: false });
    });

    it('un parte aceptado después del rechazo ya no avisa de nada', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([RESERVA({})]);
      prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([
        { reservationId: 'r1', estado: 'aceptada', descripcion: 'Ok', codigoRetorno: '0', errores: null },
        {
          reservationId: 'r1',
          estado: 'rechazada',
          descripcion: 'El código de arrendador no existe en el sistema',
          codigoRetorno: '10103',
          errores: null,
        },
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros).toMatchObject({
        comunicada: true,
        rechazado: false,
        rechazo: null,
      });
    });

    it('una cancelada o un no-show no tienen parte que completar', async () => {
      prisma.hospitalityReservation.findMany.mockResolvedValue([
        RESERVA({ id: 'r1', estado: 'cancelled' }),
        RESERVA({ id: 'r2', estado: 'no_show' }),
      ]);

      const res = await GET(buildReq('GET'));
      const { reservations } = await res.json();

      expect(reservations[0].parteViajeros.aplica).toBe(false);
      expect(reservations[1].parteViajeros.aplica).toBe(false);
    });
  });
});

describe('POST /api/hospitality/reservations (alta manual)', () => {
  const PROPERTY = { id: 'p1' };
  const UNIT = { id: 'u1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    mockAudit.mockResolvedValue({});
    mockDispatch.mockResolvedValue({ ok: true });
    prisma.hospitalityProperty.findFirst.mockResolvedValue(PROPERTY);
    prisma.hospitalityUnit.findFirst.mockResolvedValue(UNIT);
    prisma.hospitalityReservation.findMany.mockResolvedValue([]); // sin conflictos
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'c-new' });
    prisma.hospitalityReservation.create.mockResolvedValue({
      id: 'r-new',
      externalBookingId: 'MAN-TEST',
      channel: 'Directa',
      propertyId: 'p1',
      estado: 'confirmed',
    });
  });

  const VALID_BODY = {
    propertyId: 'p1',
    unitId: 'u1',
    huespedNombre: 'Ana Torres',
    huespedEmail: 'ana@example.com',
    canal: 'Directa',
    checkin: '2026-09-20',
    checkout: '2026-09-25',
    importe: 8500,
    moneda: 'MXN',
  };

  it('crea reserva con huésped nuevo (contacto creado en CRM) y dispara push', async () => {
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(201);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nombre: 'Ana Torres', email: 'ana@example.com' }),
      })
    );
    expect(prisma.hospitalityReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          propertyId: 'p1',
          unitId: 'u1',
          estado: 'confirmed',
        }),
      })
    );
    expect(mockDispatch).toHaveBeenCalledWith('t1', 'p1', 'reserva_creada', { skipRates: true });
  });

  it('valida: sin propiedad → 400', async () => {
    const res = await POST(buildReq('POST', { ...VALID_BODY, propertyId: undefined }));
    expect(res.status).toBe(400);
  });

  it('valida: checkout <= checkin → 400', async () => {
    const res = await POST(buildReq('POST', { ...VALID_BODY, checkout: '2026-09-15' }));
    expect(res.status).toBe(400);
  });

  it('valida: propiedad de otro tenant → 404', async () => {
    prisma.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('valida: unidad de otra propiedad → 404', async () => {
    prisma.hospitalityUnit.findFirst.mockResolvedValue(null);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('overbooking: unidad ocupada en el rango → 409 sin crear', async () => {
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'r-conflict',
        externalBookingId: 'BK-777',
        checkIn: new Date('2026-09-22T15:00:00'),
        checkOut: new Date('2026-09-24T11:00:00'),
        estado: 'confirmed',
      },
    ]);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('Conflicto de disponibilidad');
    expect(prisma.hospitalityReservation.create).not.toHaveBeenCalled();
  });

  it('checkout el mismo día del conflicto NO es overbooking (checkout no ocupa, §8)', async () => {
    // La reserva existente termina exactamente el día del check-in nuevo.
    prisma.hospitalityReservation.findMany.mockResolvedValue([
      {
        id: 'r-back-to-back',
        externalBookingId: 'BK-888',
        checkIn: new Date('2026-09-18T15:00:00'),
        checkOut: new Date('2026-09-20T11:00:00'),
        estado: 'confirmed',
      },
    ]);
    const res = await POST(buildReq('POST', VALID_BODY));
    expect(res.status).toBe(201);
  });

  it('reserva sin unidad no valida overbooking y se crea igual', async () => {
    const res = await POST(buildReq('POST', { ...VALID_BODY, unitId: null }));
    expect(res.status).toBe(201);
    expect(prisma.hospitalityReservation.findMany).not.toHaveBeenCalled();
  });

  it('contacto existente por email se reutiliza, no duplica', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'c-existing' });
    await POST(buildReq('POST', VALID_BODY));
    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.hospitalityReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactId: 'c-existing' }),
      })
    );
  });
});

describe('preguntas personalizadas del check-in en GET reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(AUTH_OK);
    prisma.hospitalityReservation.findMany.mockResolvedValue([]);
    prisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
  });

  it('sirve el mapa id → texto de pregunta (ES) del propio tenant', async () => {
    prisma.hospitalityCheckinPregunta.findMany.mockResolvedValue([
      { id: 'p1', es: 'Hora estimada de llegada' },
      { id: 'p2', es: 'Trae mascotas' },
    ]);

    const res = await GET(buildReq('GET'));
    const { preguntasCheckin } = await res.json();

    expect(preguntasCheckin).toEqual({
      p1: 'Hora estimada de llegada',
      p2: 'Trae mascotas',
    });
    expect(prisma.hospitalityCheckinPregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } })
    );
  });

  it('con la consulta de preguntas rota, la lista de reservas sigue saliendo (diagnóstico auxiliar)', async () => {
    prisma.hospitalityCheckinPregunta.findMany.mockRejectedValue(new Error('bd caída'));

    const res = await GET(buildReq('GET'));
    expect(res.status).toBe(200);
    const { preguntasCheckin } = await res.json();
    expect(preguntasCheckin).toEqual({});
  });
});
