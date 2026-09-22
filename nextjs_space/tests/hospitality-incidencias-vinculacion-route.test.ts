// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityWebhookEvent: { findMany: vi.fn() },
  hospitalityReservation: { findMany: vi.fn() },
  hospitalityUnit: { findMany: vi.fn() },
  hospitalitySyncLog: { create: vi.fn() },
  connectivityMapping: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  testConnectivityConnection: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));
vi.mock('@/lib/hospitality/connectivity', () => ({
  testConnectivityConnection: mocks.testConnectivityConnection,
}));

const { POST } = await import('@/app/api/hospitality/incidencias/vinculacion-automatica/route');

/** La propiedad ya tiene 'suite' vinculada: el incidente es de habitación. */
const PROPIEDAD = {
  id: 'p1',
  nombre: 'Villa Mar Azul',
  mappings: [
    {
      externalPropertyId: 'sandbox-pms',
      externalUnitCode: 'suite',
      estado: 'activo',
      unit: { id: 'u_suite', nombre: 'Suite Oceano' },
    },
  ],
};

function incidente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev_1',
    hotelCode: 'sandbox-pms',
    bookingId: 'BKG-1',
    channel: 'Airbnb',
    action: 'book',
    errorMensaje: 'Sin mapping de unidad para hotelCode sandbox-pms y roomCode penthouse (rateplan penthouse-ep)',
    payload: { rooms: [{ roomCode: 'Penthouse', rateplanCode: 'penthouse-ep' }] },
    fechaCreacion: new Date('2026-09-10T10:00:00.000Z'),
    ...overrides,
  };
}

/** Incidente con los huéspedes reales que publica el canal en la reserva. */
function incidenteConOcupacion(adults: number, children = 0, edadesNinos?: number[]) {
  return incidente({
    payload: {
      rooms: [
        {
          roomCode: 'Penthouse',
          rateplanCode: 'penthouse-ep',
          occupancy: edadesNinos ? { adults, children, childrenAges: edadesNinos } : { adults, children },
        },
      ],
    },
  });
}

function unidad(overrides: Record<string, unknown> = {}) {
  return { id: 'u_libre', nombre: 'Penthouse', codigo: 'penthouse', mappings: [], ...overrides };
}

const CATALOGO = {
  ok: true,
  property: {
    hotel_name: 'Villa Mar Azul',
    rooms: [
      {
        room_id: 'penthouse',
        room_name: 'Penthouse',
        rateplans: [{ rateplan_id: 'penthouse-ep' }, { rateplan_id: 'penthouse-db' }],
      },
    ],
  },
};

/** Catálogo con la ocupación que el proveedor publica para la habitación. */
function catalogoConOcupacion(rango: { min?: unknown; max?: unknown }) {
  return {
    ok: true,
    property: {
      hotel_name: 'Villa Mar Azul',
      rooms: [
        {
          room_id: 'penthouse',
          room_name: 'Penthouse',
          min_occ: rango.min ?? null,
          max_occ: rango.max ?? null,
          rateplans: [{ rateplan_id: 'penthouse-ep' }],
        },
      ],
    },
  };
}

function reqConBody(body: unknown = {}) {
  return new Request('https://volkern.app/api/hospitality/incidencias/vinculacion-automatica', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1' } });
  mocks.hospitalityProperty.findMany.mockResolvedValue([PROPIEDAD]);
  mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidente()]);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
  mocks.hospitalityUnit.findMany.mockResolvedValue([unidad()]);
  mocks.connectivityMapping.findFirst.mockResolvedValue(null);
  mocks.connectivityMapping.findMany.mockResolvedValue([]);
  mocks.connectivityMapping.update.mockResolvedValue({ id: 'map_1' });
  mocks.connectivityMapping.upsert.mockResolvedValue({ id: 'map_1' });
  mocks.hospitalitySyncLog.create.mockResolvedValue({ id: 'sync_1' });
  mocks.testConnectivityConnection.mockResolvedValue(CATALOGO);
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('POST /api/hospitality/incidencias/vinculacion-automatica', () => {
  it('sin autenticación → 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'API key no proporcionada' });
    const res = await POST(reqConBody());
    expect(res.status).toBe(401);
  });

  it('vincula la unidad que coincide por código y respeta el rateplan del incidente', async () => {
    const res = await POST(reqConBody({ propertyId: 'p1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aplicadas).toHaveLength(1);
    expect(body.aplicadas[0]).toMatchObject({
      hotelCode: 'sandbox-pms',
      roomCode: 'penthouse',
      rateplanCode: 'penthouse-ep',
      unitId: 'u_libre',
      motivo: 'codigo_de_unidad',
    });

    const upsert = mocks.connectivityMapping.upsert.mock.calls[0][0];
    expect(upsert.where.provider_externalPropertyId_externalUnitCode).toEqual({
      provider: 'channel_connectivity',
      externalPropertyId: 'sandbox-pms',
      externalUnitCode: 'penthouse',
    });
    expect(upsert.create).toMatchObject({
      tenantId: 't1',
      propertyId: 'p1',
      unitId: 'u_libre',
      externalRatePlanCode: 'penthouse-ep',
      estado: 'activo',
    });
    // Por qué se creó el vínculo, guardado en el propio vínculo.
    expect(upsert.create.metadata).toMatchObject({
      origen: 'vinculacion_automatica',
      motivo: 'codigo_de_unidad',
      roomCode: 'penthouse',
    });
    // Y la traza de conectividad, con el origen manual.
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      propertyId: 'p1',
      tipo: 'mapping_automatico',
      operacion: 'manual',
      estado: 'exito',
    });
    expect(mocks.logAuditAction).toHaveBeenCalled();
    expect(body.propuestas).toHaveLength(0);
  });

  it('no adivina cuando hay varias unidades libres y ninguna coincide', async () => {
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u1', nombre: 'Atico', codigo: 'atico' }),
      unidad({ id: 'u2', nombre: 'Estudio', codigo: 'estudio' }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas).toHaveLength(1);
    expect(body.propuestas[0].motivo).toBe('ambiguo');
    expect(body.propuestas[0].candidatos.map((c: { unitId: string }) => c.unitId)).toEqual(['u1', 'u2']);
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
    expect(mocks.hospitalitySyncLog.create).not.toHaveBeenCalled();
    expect(mocks.logAuditAction).not.toHaveBeenCalled();
  });

  it('aplica por eliminación cuando solo queda una unidad libre', async () => {
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_unica', nombre: 'Casa completa', codigo: null }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u_unica', motivo: 'unica_unidad_libre' });
    expect(mocks.connectivityMapping.upsert).toHaveBeenCalledTimes(1);
  });

  it('desempata por la ocupación del catálogo cuando nadie coincide por código ni nombre', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 2, max: 4 }));
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_grande', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 8 }),
      unidad({ id: 'u_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({
      unitId: 'u_doble',
      motivo: 'ocupacion_compatible',
    });
    expect(mocks.connectivityMapping.upsert.mock.calls[0][0].create.metadata).toMatchObject({
      motivo: 'ocupacion_compatible',
      roomCode: 'penthouse',
    });
  });

  it('no vincula ninguna unidad si no admite la ocupación de la habitación', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 2, max: 4 }));
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_g1', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 8 }),
      unidad({ id: 'u_g2', nombre: 'Casa grande', codigo: 'CASA', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('sin_unidad_compatible');
    expect(body.propuestas[0].detalle).toContain('2 a 4 huéspedes');
    // Los candidatos dicen cuáles encajan: ninguno.
    expect(body.propuestas[0].candidatos.map((c: { admiteOcupacion: boolean }) => c.admiteOcupacion)).toEqual([
      false,
      false,
    ]);
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('una única unidad libre no basta si no admite la ocupación', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ max: 2 }));
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_unica', nombre: 'Casa completa', codigo: null, capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('sin_unidad_compatible');
    expect(body.propuestas[0].detalle).toContain('hasta 2 huéspedes');
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('si la única unidad libre encaja con la ocupación, manda la regla de siempre', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 4 }));
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_unica', nombre: 'Casa completa', codigo: null, capacidad: 3 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u_unica', motivo: 'unica_unidad_libre' });
  });

  it('con varias unidades compatibles sigue preguntando, marcando cuáles encajan', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 4 }));
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u_triple', nombre: 'Triple', codigo: 'TPL', capacidad: 3 }),
      unidad({ id: 'u_grande', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 9 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('ambiguo');
    expect(body.propuestas[0].detalle).toContain('Quedan 2 unidades libres compatibles');
    expect(body.propuestas[0].detalle).toContain('1 a 4 huéspedes');
    expect(
      body.propuestas[0].candidatos.map((c: { admiteOcupacion: boolean }) => c.admiteOcupacion)
    ).toEqual([true, true, false]);
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('normaliza la ocupación que el proveedor manda como texto', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(
      catalogoConOcupacion({ min: '2', max: '3' })
    );
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u_grande', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u_doble', motivo: 'ocupacion_compatible' });
  });

  it('desempata con los huéspedes reales cuando el rango del tipo no distingue', async () => {
    // El tipo publica 1-6 huéspedes: con eso todas las libres encajan (sin
    // información). La reserva trae 2, y solo una unidad tiene esa capacidad.
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(2)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u_familiar', nombre: 'Familiar', codigo: 'FAM', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u_doble', motivo: 'capacidad_exacta' });
    expect(mocks.connectivityMapping.upsert.mock.calls[0][0].create.metadata).toMatchObject({
      motivo: 'capacidad_exacta',
      ocupacionReserva: 2,
    });
    // La traza también dice con cuántos huéspedes se decidió.
    expect(mocks.hospitalitySyncLog.create.mock.calls[0][0].data.responseBody).toMatchObject({
      ocupacionReserva: 2,
    });
  });

  it('elegir por tamaño exacto no decide si hay empate de capacidad', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(2)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u1', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u2', nombre: 'Doble jardín', codigo: 'DBL2', capacidad: 2 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('ambiguo');
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('descarta con los huéspedes reales la unidad que no puede alojarlos', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(3, 1)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_pequena', nombre: 'Estudio', codigo: 'EST', capacidad: 2 }),
      unidad({ id: 'u_grande', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 5 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({
      unitId: 'u_grande',
      motivo: 'ocupacion_reserva',
    });
    // Los candidatos marcan quién puede alojar la reserva y quién no.
    expect(body.propuestas).toHaveLength(0);
  });

  it('entre las que caben elige la más ajustada cuando descarta alguna', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 8 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(3)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u2', nombre: 'Estudio', codigo: 'EST', capacidad: 2 }),
      unidad({ id: 'u4', nombre: 'Familiar', codigo: 'FAM', capacidad: 4 }),
      unidad({ id: 'u6', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    // Ninguna tiene capacidad exacta y la de 2 no cabe: queda la de 4, que es la
    // única con la capacidad más ajustada.
    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u4', motivo: 'ocupacion_reserva' });
    expect(mocks.connectivityMapping.upsert.mock.calls[0][0].create.metadata).toMatchObject({
      ocupacionReserva: 3,
    });
  });

  it('no elige por capacidad si varias caben igual de ajustadas', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 8 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(3)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u2', nombre: 'Estudio', codigo: 'EST', capacidad: 2 }),
      unidad({ id: 'u4a', nombre: 'Familiar mar', codigo: 'FAM', capacidad: 4 }),
      unidad({ id: 'u4b', nombre: 'Familiar jardín', codigo: 'FAM2', capacidad: 4 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('ambiguo');
    expect(body.propuestas[0].detalle).toContain('3 huésped(es)');
    expect(
      body.propuestas[0].candidatos.map((c: { admiteReserva: boolean }) => c.admiteReserva)
    ).toEqual([false, true, true]);
  });

  it('no vincula nada cuando ninguna unidad libre puede alojar a los huéspedes', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(5, 2)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u1', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u2', nombre: 'Triple', codigo: 'TPL', capacidad: 3 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('sin_capacidad_suficiente');
    expect(body.propuestas[0].detalle).toContain('7 huésped(es) (5 adulto(s) + 2 niño(s))');
    expect(body.propuestas[0].ocupacion).toMatchObject({ adultos: 5, ninos: 2, total: 7 });
    expect(
      body.propuestas[0].candidatos.map((c: { admiteReserva: boolean }) => c.admiteReserva)
    ).toEqual([false, false]);
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('sin ocupación en el payload se comporta como antes', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u_familiar', nombre: 'Familiar', codigo: 'FAM', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('ambiguo');
    expect(body.propuestas[0].ocupacion).toBeNull();
  });

  it('no inventa ocupación cuando el payload trae ceros', async () => {
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(0, 0)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_doble', nombre: 'Doble mar', codigo: 'DBL', capacidad: 2 }),
      unidad({ id: 'u_familiar', nombre: 'Familiar', codigo: 'FAM', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.propuestas[0].motivo).toBe('ambiguo');
    expect(body.propuestas[0].ocupacion).toBeNull();
  });

  it('la ocupación real no rescata una unidad que el tipo de habitación rechaza', async () => {
    // El tipo publica hasta 2 huéspedes: la unidad de 6 no corresponde, aunque
    // la reserva venga con 1 huésped. Es un error de configuración, no un hueco.
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ max: 2 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(1)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_unica', nombre: 'Casa completa', codigo: null, capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('sin_unidad_compatible');
  });

  it('coincide por nombre cuando el código de la unidad no es el del proveedor', async () => {
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u_nombre', nombre: 'Penthouse', codigo: 'APT-01' }),
      unidad({ id: 'u_otra', nombre: 'Estudio', codigo: 'APT-02' }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u_nombre', motivo: 'nombre_de_unidad' });
  });

  it('no vincula habitaciones que no existen en el catálogo del proveedor', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      incidente({ payload: { rooms: [{ roomCode: 'inventada', rateplanCode: 'x' }] } }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('no_esta_en_catalogo');
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('no toca un hotel vinculado a otra cuenta', async () => {
    mocks.connectivityMapping.findFirst.mockResolvedValue({ tenantId: 't_otro' });

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('hotel_de_otra_cuenta');
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('deja para el operador las incidencias de una propiedad sin ningún vínculo', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Villa Mar Azul',
        mappings: [
          {
            externalPropertyId: 'sandbox-pms',
            externalUnitCode: 'suite',
            estado: 'inactivo',
            unit: { id: 'u_suite', nombre: 'Suite Oceano' },
          },
        ],
      },
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('propiedad_sin_vinculos');
    expect(mocks.testConnectivityConnection).not.toHaveBeenCalled();
  });

  it('con aplicar:false solo propone, sin escribir nada', async () => {
    const res = await POST(reqConBody({ aplicar: false }));
    const body = await res.json();

    expect(body.aplicar).toBe(false);
    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0]).toMatchObject({ motivo: 'codigo_de_unidad' });
    expect(body.propuestas[0].candidatos[0]).toMatchObject({ unitId: 'u_libre' });
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('no vuelve a proponer un vínculo que un operador deshizo', async () => {
    mocks.connectivityMapping.findMany.mockResolvedValue([{ externalUnitCode: 'penthouse' }]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('rechazado_por_operador');
    expect(body.propuestas[0].detalle).toContain('deshizo el vínculo');
    // Ni catálogo ni escritura: la decisión del operador manda.
    expect(mocks.testConnectivityConnection).not.toHaveBeenCalled();
    expect(mocks.connectivityMapping.upsert).not.toHaveBeenCalled();
  });

  it('si el proveedor no responde, no inventa el vínculo', async () => {
    mocks.testConnectivityConnection.mockResolvedValue({ ok: false, error: 'timeout' });

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas[0].motivo).toBe('catalogo_no_disponible');
  });

  it('no propone nada cuando ya no hay incidencias sin vínculo', async () => {
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      incidente({ payload: { rooms: [{ roomCode: 'suite', rateplanCode: 'suite-d-ep' }] } }),
    ]);
    mocks.hospitalityReservation.findMany.mockResolvedValue([]);

    const res = await POST(reqConBody());
    const body = await res.json();

    expect(body.aplicadas).toHaveLength(0);
    expect(body.propuestas).toHaveLength(0);
    expect(body.resumen.sinVinculo).toBe(0);
  });

  it('los bebés del payload no consumen capacidad: la cuna no ocupa plaza', async () => {
    // 2 adultos + 2 niños, pero el canal publica las edades (1 y 6): con el
    // umbral por defecto (4 años), el de 1 es bebé y la reserva efectiva es de 3.
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
      incidenteConOcupacion(2, 2, [1, 6]),
    ]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u3', nombre: 'Familiar', codigo: 'FAM', capacidad: 3 }),
      unidad({ id: 'u6', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    // Sin edades serían 4 huéspedes y la elección quedaría ambigua; con el bebé
    // descartado la de 3 es la capacidad exacta.
    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u3', motivo: 'capacidad_exacta' });
    expect(mocks.connectivityMapping.upsert.mock.calls[0][0].create.metadata).toMatchObject({
      ocupacionReserva: 3,
    });
  });

  it('sin edades publicadas cada niño cuenta, por conservador', async () => {
    // El canal no manda childrenAges: los 2 niños cuentan aunque fueran bebés.
    mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
    mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([incidenteConOcupacion(2, 2)]);
    mocks.hospitalityUnit.findMany.mockResolvedValue([
      unidad({ id: 'u3', nombre: 'Familiar', codigo: 'FAM', capacidad: 3 }),
      unidad({ id: 'u4', nombre: 'Familiar plus', codigo: 'FAM2', capacidad: 4 }),
      unidad({ id: 'u6', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 6 }),
    ]);

    const res = await POST(reqConBody());
    const body = await res.json();

    // 4 huéspedes efectivos: la exacta es la de 4, no la de 3 (que indicaría
    // que se restó un bebé que el payload nunca declaró como tal).
    expect(body.aplicadas[0]).toMatchObject({ unitId: 'u4', motivo: 'capacidad_exacta' });
  });

  it('el umbral de bebé es configurable con HOSPITALITY_EDAD_NINO_UMBRAL', async () => {
    const original = process.env.HOSPITALITY_EDAD_NINO_UMBRAL;
    process.env.HOSPITALITY_EDAD_NINO_UMBRAL = '1';
    try {
      // Con umbral 1, un niño de 1 año ya consume plaza: los 2 niños cuentan.
      mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
        incidenteConOcupacion(2, 2, [1, 6]),
      ]);
      mocks.hospitalityUnit.findMany.mockResolvedValue([
        unidad({ id: 'u3', nombre: 'Familiar', codigo: 'FAM', capacidad: 3 }),
        unidad({ id: 'u4', nombre: 'Familiar plus', codigo: 'FAM2', capacidad: 4 }),
        unidad({ id: 'u6', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 6 }),
      ]);

      const res = await POST(reqConBody());
      const body = await res.json();

      expect(body.aplicadas[0]).toMatchObject({ unitId: 'u4', motivo: 'capacidad_exacta' });
    } finally {
      if (original === undefined) delete process.env.HOSPITALITY_EDAD_NINO_UMBRAL;
      else process.env.HOSPITALITY_EDAD_NINO_UMBRAL = original;
    }
  });

  it('un umbral vacío o con espacios vuelve al default: no desactiva la exención', async () => {
    // Copiar el .env.example con la variable vacía no puede convertir `Number('')`
    // en 0 y hacer que los bebés vuelvan a contar por accidente.
    const original = process.env.HOSPITALITY_EDAD_NINO_UMBRAL;
    process.env.HOSPITALITY_EDAD_NINO_UMBRAL = '  ';
    try {
      mocks.testConnectivityConnection.mockResolvedValue(catalogoConOcupacion({ min: 1, max: 6 }));
      mocks.hospitalityWebhookEvent.findMany.mockResolvedValue([
        incidenteConOcupacion(2, 2, [1, 6]),
      ]);
      mocks.hospitalityUnit.findMany.mockResolvedValue([
        unidad({ id: 'u3', nombre: 'Familiar', codigo: 'FAM', capacidad: 3 }),
        unidad({ id: 'u6', nombre: 'Villa entera', codigo: 'VILLA', capacidad: 6 }),
      ]);

      const res = await POST(reqConBody());
      const body = await res.json();

      // Con el default (4) el bebé se resta: 3 huéspedes efectivos → la de 3.
      expect(body.aplicadas[0]).toMatchObject({ unitId: 'u3', motivo: 'capacidad_exacta' });
    } finally {
      if (original === undefined) delete process.env.HOSPITALITY_EDAD_NINO_UMBRAL;
      else process.env.HOSPITALITY_EDAD_NINO_UMBRAL = original;
    }
  });
});
