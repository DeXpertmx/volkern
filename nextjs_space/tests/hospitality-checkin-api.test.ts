// @vitest-environment node
//
// Guardias del check-in online público (registro de viajeros, RD 933/2021).
//
// Lo importante que fijan estos tests:
//  - El token es la única credencial: sin él 404, y una reserva cancelada o
//    con no-show no se puede documentar (410).
//  - El GET prerrellena al titular con lo que ya se sabe de la reserva y
//    devuelve la lista de lo que falta desde el primer segundo.
//  - El POST guarda los viajeros EN EL FORMATO DEL MINISTERIO dentro de
//    `guestData` (sin perder el idioma ni el contacto del titular) y responde
//    qué queda por revisar.
//  - **El parte sale solo cuando está completo Y la estancia ya empezó**: si el
//    huésped rellena todo antes de llegar, no se comunica una entrada que aún
//    no ha ocurrido (la envía el cron el día de la llegada); si ya empezó, se
//    envía al servicio OFICIAL del Ministerio en ese momento.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const __mockPrisma = vi.hoisted(() => ({
  // `findFirst` lo usa la ruta (búsqueda por token); `findUnique` lo usa el
  // registro de viajeros por id al enviar el parte.
  hospitalityReservation: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  hospitalityMirConfig: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  // Preguntas personalizadas del check-in: sin config, el bloque no aparece y
  // las respuestas no se guardan (el comportamiento histórico queda intacto).
  hospitalityCheckinPregunta: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  hospitalityGuestRegistryCommunication: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  hospitalityProperty: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));

import { GET, POST } from '@/app/api/public/checkin/[token]/route';
import { enlaceCheckinDeReserva, generarTokenCheckin } from '@/lib/hospitality/checkin-service';
import { ENDPOINTS_MIR } from '@/lib/hospitality/registro-viajeros';

const TOKEN = 'TOKEN-CHECKIN';
const TENANT = 'tenant-1';

const request = (method: string, body?: unknown) =>
  new Request(`http://test.local/api/public/checkin/${TOKEN}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ctx = { params: Promise.resolve({ token: TOKEN }) };

/** Viajero completo según el Ministerio (NIF válido, dirección con INE…). */
function viajeroCompleto(extra: Record<string, unknown> = {}) {
  return {
    nombre: 'Juan',
    apellido1: 'García',
    apellido2: 'García',
    tipoDocumento: 'NIF',
    numeroDocumento: '00000000T',
    soporteDocumento: '999999999',
    fechaNacimiento: '1990-01-01',
    nacionalidad: 'ESP',
    sexo: 'H',
    direccion: {
      direccion: 'C/Serrano 127',
      codigoPostal: '28001',
      pais: 'ESP',
      codigoMunicipio: '28079',
    },
    telefono: '666666666',
    correo: 'juangarcia@correo.es',
    ...extra,
  };
}

/** Reserva tal y como la ven la ruta y el registro de viajeros. */
function reservaMock(extra: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    tenantId: TENANT,
    estado: 'confirmed',
    externalBookingId: 'BE-1',
    checkIn: new Date('2026-09-20T15:00:00Z'),
    checkOut: new Date('2026-09-23T12:00:00Z'),
    bookedOn: new Date('2026-09-01T10:00:00Z'),
    fechaCreacion: new Date('2026-09-01T10:00:00Z'),
    occupancyAdults: 1,
    occupancyChildren: 0,
    guestData: { firstName: 'Ana', lastName: 'García', email: 'ana@correo.es', phone: '666666666', idioma: 'es' },
    property: { nombre: 'Hotel Centro', ciudad: 'Madrid', timezone: 'Europe/Madrid', codigoEstablecimientoMIR: '1234567890' },
    unit: { nombre: 'Habitación 1' },
    payments: [{ metodo: 'efectivo', fechaPago: new Date('2026-09-20T15:05:00Z') }],
    ...extra,
  };
}

function respuestaSoap() {
  return `<SOAP-ENV:Envelope><SOAP-ENV:Body><ns3:comunicacionResponse>
    <respuesta><codigo>0</codigo><descripcion>Ok</descripcion><lote>LOTE-9</lote></respuesta>
  </ns3:comunicacionResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
}

beforeEach(() => {
  vi.clearAllMocks();
  __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(reservaMock());
  __mockPrisma.hospitalityReservation.findUnique.mockResolvedValue(reservaMock());
  __mockPrisma.hospitalityReservation.update.mockResolvedValue({ id: 'res-1' });
  __mockPrisma.hospitalityMirConfig.findUnique.mockResolvedValue({
    id: 'cfg-1',
    tenantId: TENANT,
    codigoArrendador: '0000000001',
    aplicacion: 'Volkern',
    entorno: 'pre',
    usuarioEnc: 'usuario-ses',
    passwordEnc: 'clave-ses',
    tipoPagoDefecto: 'EFECT',
    mapaTiposPago: { efectivo: 'EFECT' },
    activo: true,
  });
  __mockPrisma.hospitalityMirConfig.update.mockResolvedValue({ id: 'cfg-1' });
  __mockPrisma.hospitalityGuestRegistryCommunication.findUnique.mockResolvedValue(null);
  __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mockImplementation(async (args: any) => ({
    id: 'com-1',
    ...args.create,
    ...args.update,
  }));
});

describe('GET — el formulario del huésped', () => {
  it('un token desconocido no revela nada (404)', async () => {
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(null);
    const res = await GET(request('GET') as any, ctx);
    expect(res.status).toBe(404);
  });

  it('una reserva cancelada o no-show no se puede documentar (410)', async () => {
    for (const estado of ['cancelled', 'no_show']) {
      __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(reservaMock({ estado }));
      const res = await GET(request('GET') as any, ctx);
      expect(res.status).toBe(410);
    }
  });

  it('prerrellena al titular con lo que ya sabemos y dice qué falta desde el principio', async () => {
    const res = await GET(request('GET') as any, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.propiedad).toBe('Hotel Centro');
    expect(data.referencia).toBe('BE-1');
    expect(data.viajeros[0]).toMatchObject({ nombre: 'Ana', apellido1: 'García', correo: 'ana@correo.es' });
    // La lista de «revisa esto» está a la vista antes de escribir nada.
    expect(data.documentacion.completa).toBe(false);
    expect(data.documentacion.faltan).toContain('tipoDocumento');
    expect(data.documentacion.faltan).toContain('direccion.calle');
  });

  it('con documentación ya guardada devuelve lo guardado (no el borrador del titular)', async () => {
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(
      reservaMock({ guestData: { idioma: 'en', viajeros: [viajeroCompleto({ nombre: 'Juan' })] } })
    );

    const data = await (await GET(request('GET') as any, ctx)).json();
    expect(data.viajeros).toHaveLength(1);
    expect(data.viajeros[0].numeroDocumento).toBe('00000000T');
    expect(data.documentacion.completa).toBe(true);
    // El titular es el que declaró la dirección de España: su cobertura cierra.
    expect(data.documentacion.faltan).toEqual([]);
  });
});

describe('Enlace de check-in para el hotel', () => {
  it('el token se genera al azar, en formato URL y distinto en cada llamada', () => {
    const a = generarTokenCheckin();
    const b = generarTokenCheckin();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{30,}$/);
  });

  it('se genera si la reserva no lo tenía y se conserva si ya existía', async () => {
    const primero = await enlaceCheckinDeReserva(TENANT, 'res-1');
    const token = __mockPrisma.hospitalityReservation.update.mock.calls[0][0].data.tokenCheckin as string;
    // El host sale de NEXT_PUBLIC_APP_URL (misma convención que el resto del
    // producto): la guardia fija el camino y el idioma, no el dominio.
    expect(primero?.token).toBe(token);
    expect(primero?.url).toMatch(/^https?:\/\//);
    expect(primero?.url).toContain(`/checkin/${token}?lang=es`);

    vi.clearAllMocks();
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(reservaMock({ tokenCheckin: 'YA-EXISTE' }));
    const segundo = await enlaceCheckinDeReserva(TENANT, 'res-1');
    expect(segundo?.token).toBe('YA-EXISTE');
    expect(segundo?.url).toContain('/checkin/YA-EXISTE?lang=es');
    expect(__mockPrisma.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('el enlace va en el idioma del huésped y no existe para reservas cerradas', async () => {
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(
      reservaMock({ tokenCheckin: 'T', guestData: { idioma: 'en' } })
    );
    expect((await enlaceCheckinDeReserva(TENANT, 'res-1'))?.url).toContain('?lang=en');

    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(reservaMock({ estado: 'cancelled' }));
    expect(await enlaceCheckinDeReserva(TENANT, 'res-1')).toBeNull();

    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(null);
    expect(await enlaceCheckinDeReserva(TENANT, 'otra')).toBeNull();
  });
});

describe('POST — guardado de la documentación', () => {
  it('sin viajeros no guarda nada (400) y devuelve qué falta', async () => {
    const res = await POST(request('POST', { viajeros: [] }) as any, ctx);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.faltan).toContain('nombre');
    expect(__mockPrisma.hospitalityReservation.update).not.toHaveBeenCalled();
  });

  it('guarda los viajeros dentro de guestData sin perder el idioma ni el contacto del titular', async () => {
    const res = await POST(
      request('POST', { viajeros: [viajeroCompleto({ correo: 'ana@correo.es' }), viajeroCompleto({ nombre: 'Pedro', tipoDocumento: null, numeroDocumento: null, soporteDocumento: null, apellido2: null })] }) as any,
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    const guardado = __mockPrisma.hospitalityReservation.update.mock.calls[0][0].data.guestData;
    expect(guardado.idioma).toBe('es');
    expect(guardado.firstName).toBe('Ana');
    expect(guardado.viajeros).toHaveLength(2);
    // El contacto del titular cubre al acompañante que no dejó ninguno: el
    // Ministerio exige contacto por persona y el huésped no lo repite.
    expect(guardado.viajeros[1].telefono).toBe('666666666');
    expect(data.ok).toBe(true);
    expect(data.viajeros).toBe(2);
  });

  it('la dirección del titular se hereda solo si el huésped marcó «misma dirección»', async () => {
    const sinDireccion = [
      viajeroCompleto({ correo: 'ana@correo.es' }),
      viajeroCompleto({ nombre: 'Pedro', direccion: null, tipoDocumento: null, numeroDocumento: null, soporteDocumento: null, apellido2: null }),
    ];

    await POST(request('POST', { viajeros: sinDireccion }) as any, ctx);
    expect(__mockPrisma.hospitalityReservation.update.mock.calls[0][0].data.guestData.viajeros[1].direccion).toBe(null);

    vi.clearAllMocks();
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(reservaMock());
    __mockPrisma.hospitalityReservation.findUnique.mockResolvedValue(reservaMock());
    __mockPrisma.hospitalityReservation.update.mockResolvedValue({ id: 'res-1' });

    await POST(request('POST', { viajeros: sinDireccion, heredarDireccion: true }) as any, ctx);
    expect(__mockPrisma.hospitalityReservation.update.mock.calls[0][0].data.guestData.viajeros[1].direccion).toMatchObject({
      direccion: 'C/Serrano 127',
      codigoMunicipio: '28079',
    });
  });

  it('el titular acaba primero aunque el formulario lo mande en otro orden (el rol va por posición)', async () => {
    const res = await POST(
      request('POST', {
        viajeros: [
          viajeroCompleto({ nombre: 'Pedro', correo: 'pedro@correo.es' }),
          viajeroCompleto({ nombre: 'Ana', correo: 'ana@correo.es' }),
        ],
      }) as any,
      ctx
    );
    expect(res.status).toBe(200);

    const guardado = __mockPrisma.hospitalityReservation.update.mock.calls[0][0].data.guestData;
    expect(guardado.viajeros[0].correo).toBe('ana@correo.es');
  });

  it('documentación incompleta: guarda y dice qué revisar, sin llamar al Ministerio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(
      request('POST', { viajeros: [viajeroCompleto({ direccion: null })] }) as any,
      ctx
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.documentacion.completa).toBe(false);
    expect(data.documentacion.faltan).toContain('direccion.calle');
    // No se envía un parte incompleto: quedaría rechazado y sin constancia útil.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(data.envio).toBeNull();
  });

  it('completa pero ANTES de la entrada: no comunica una entrada que aún no ha ocurrido', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Entrada dentro de un mes: el parte aún no toca.
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(
      reservaMock({ checkIn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
    );

    const data = await (await POST(request('POST', { viajeros: [viajeroCompleto()] }) as any, ctx)).json();

    expect(data.documentacion.completa).toBe(true);
    expect(data.envio).toEqual({ enviado: false, motivo: 'servicio_no_iniciado' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('completa y con la estancia ya empezada: envía el parte al servicio OFICIAL del Ministerio', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(respuestaSoap(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    // La estancia ya empezó (hace dos horas), así que el parte toca YA. La
    // reserva ya trae los viajeros guardados (lo que en producción acaba de
    // escribir el POST y aquí simula el mock).
    const conViajeros = (extra: Record<string, unknown> = {}) =>
      reservaMock({
        checkIn: new Date(Date.now() - 2 * 60 * 60 * 1000),
        estado: 'checked_in',
        guestData: { idioma: 'es', viajeros: [viajeroCompleto()] },
        ...extra,
      });
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(conViajeros());
    __mockPrisma.hospitalityReservation.findUnique.mockResolvedValue(conViajeros());

    const data = await (await POST(request('POST', { viajeros: [viajeroCompleto()] }) as any, ctx)).json();

    expect(data.envio).toMatchObject({ enviado: true, estado: 'enviada' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINTS_MIR.pre);
    expect(url).toMatch(/^https:\/\/hospedajes\.(pre-ses|ses)\.mir\.es\//);

    // La traza queda registrada con el lote: la constancia que exige el RD.
    const upsert = __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mock.calls[0][0];
    expect(upsert.create.lote).toBe('LOTE-9');
  });

  it('un fallo del Ministerio no tumba el guardado del huésped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')));
    const enCurso = reservaMock({
      checkIn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      estado: 'checked_in',
      guestData: { idioma: 'es', viajeros: [viajeroCompleto()] },
    });
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(enCurso);
    __mockPrisma.hospitalityReservation.findUnique.mockResolvedValue(enCurso);

    const res = await POST(request('POST', { viajeros: [viajeroCompleto()] }) as any, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.envio.enviado).toBe(false);
    // Ni «rechazado» ni «sin configuración»: el servicio no contestó, así que el
    // motivo se llama por su nombre y trae el estado real de la traza. Decir
    // «sin_configuracion» mandaba al hotel a revisar credenciales que están bien.
    expect(data.envio).toMatchObject({ motivo: 'sin_entrega', estado: 'error' });
    // Los datos SÍ se guardaron: el huésped no repite el formulario por un fallo
    // del Ministerio (el cron reintenta con la traza espaciada).
    expect(__mockPrisma.hospitalityReservation.update).toHaveBeenCalled();
  });

  it('con el servicio caído (503 sin SOAP) el parte NO queda «rechazado»', async () => {
    // El caso que destapó el ensayo: un 503 en texto plano devolvía un objeto de
    // respuesta con los campos vacíos y el parte se guardaba como rechazado. El
    // huésped veía «guardado», pero la traza y el aviso del hotel decían que el
    // Ministerio había rechazado un parte con los datos perfectos.
    const fetchMock = vi.fn().mockResolvedValue(new Response('Service Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const enCurso = reservaMock({
      checkIn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      estado: 'checked_in',
      guestData: { idioma: 'es', viajeros: [viajeroCompleto()] },
    });
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(enCurso);
    __mockPrisma.hospitalityReservation.findUnique.mockResolvedValue(enCurso);

    const data = await (await POST(request('POST', { viajeros: [viajeroCompleto()] }) as any, ctx)).json();

    expect(data.envio).toMatchObject({ enviado: false, motivo: 'sin_entrega', estado: 'error' });
    const upsert = __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe('error');
    expect(upsert.create.estado).not.toBe('rechazada');
    expect(upsert.create.codigoRetorno).toBeNull();
  });
});
