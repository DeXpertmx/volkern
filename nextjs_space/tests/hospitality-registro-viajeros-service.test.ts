// @vitest-environment node
//
// Guardias del servicio de registro de viajeros (RD 933/2021). Lo importante
// que fijan estos tests:
//  - La petición va al endpoint OFICIAL del Ministerio, con autenticación
//    básica HTTP (apartado 2.2) y el XML comprimido en ZIP + Base64 dentro del
//    sobre SOAP: nada de agregadores.
//  - Un parte con datos incompletos NO se envía: queda en `datos_incompletos`
//    con el detalle de lo que falta (el canal no manda los documentos).
//  - Un código de retorno distinto de 0 se guarda como rechazo, no como éxito.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const __mockPrisma = vi.hoisted(() => ({
  hospitalityMirConfig: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  hospitalityReservation: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  hospitalityGuestRegistryCommunication: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  hospitalityProperty: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: __mockPrisma }));

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

import {
  ESTADO_REGISTRO,
  MOTIVO_RH_SIN_NAMESPACE,
  PARTES_SIN_REINTENTAR_EN_PANEL,
  VAR_ENDPOINT_ENSALLO,
  construirParteDesdeReserva,
  construirReservaDesdeReserva,
  VENTANA_LOTE_MS,
  endpointParaEnvio,
  enVuelo,
  enviarRegistroDeReserva,
  enviarReservaHospedaje,
  esHostOficialMIR,
  esMockDeEnsayo,
  estadoRegistroViajeros,
  getMirConfigPublica,
  hostDeEndpoint,
  mapearPersonaMIR,
  personasDesdeGuestData,
  resolverTipoPago,
} from '@/lib/hospitality/registro-viajeros-service';
import {
  ENDPOINTS_MIR,
  direccionVacia,
  reservasHospedajeHabilitadas,
} from '@/lib/hospitality/registro-viajeros';
import { MAX_INTENTOS_PARTE } from '@/lib/hospitality/parte-rechazo';

const TENANT = 'tenant-1';

function configMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    tenantId: TENANT,
    codigoArrendador: '0000000001',
    aplicacion: 'Volkern',
    entorno: 'pre',
    // Sin cifrar de verdad: `decrypt` devuelve el texto tal cual si no tiene
    // formato cifrado, así el test no depende de ENCRYPTION_KEY.
    usuarioEnc: 'usuario-ses',
    passwordEnc: 'clave-ses',
    tipoPagoDefecto: 'EFECT',
    mapaTiposPago: { efectivo: 'EFECT', stripe: 'TARJT' },
    activo: true,
    ultimoEnvio: null,
    ultimoError: null,
    ...overrides,
  };
}

function viajeroCompleto() {
  return {
    rol: 'VI',
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
      codigoMunicipio: '28079',
      codigoPostal: '28001',
      pais: 'ESP',
    },
    telefono: '666666666',
    correo: 'juangarcia@correo.es',
  };
}

function reservaMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    tenantId: TENANT,
    externalBookingId: 'BOOK-1',
    checkIn: new Date('2026-09-20T15:00:00Z'),
    checkOut: new Date('2026-09-23T12:00:00Z'),
    bookedOn: new Date('2026-09-01T10:00:00Z'),
    fechaCreacion: new Date('2026-09-01T10:00:00Z'),
    occupancyAdults: 1,
    occupancyChildren: 0,
    estado: 'checked_in',
    propertyId: 'prop-1',
    guestData: { viajeros: [viajeroCompleto()] },
    property: {
      id: 'prop-1',
      nombre: 'Hotel Centro',
      timezone: 'Europe/Madrid',
      codigoEstablecimientoMIR: '1234567890',
    },
    unit: { nombre: 'Habitación 1' },
    payments: [{ metodo: 'efectivo', fechaPago: new Date('2026-09-20T15:05:00Z') }],
    ...overrides,
  };
}

function respuestaSoap(codigo = '0', descripcion = 'Ok', lote = 'LOTE-1') {
  return `<SOAP-ENV:Envelope><SOAP-ENV:Body><ns3:comunicacionResponse>
    <respuesta><codigo>${codigo}</codigo><descripcion>${descripcion}</descripcion><lote>${lote}</lote></respuesta>
  </ns3:comunicacionResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
}

beforeEach(() => {
  vi.clearAllMocks();
  __mockPrisma.hospitalityMirConfig.findUnique.mockResolvedValue(configMock());
  __mockPrisma.hospitalityMirConfig.update.mockResolvedValue(configMock());
  __mockPrisma.hospitalityGuestRegistryCommunication.findUnique.mockResolvedValue(null);
  __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);
  __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mockImplementation(async (args: any) => ({
    id: 'com-1',
    ...args.create,
    ...args.update,
  }));
  __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(reservaMock());
  __mockPrisma.hospitalityReservation.findUnique.mockResolvedValue({
    id: 'res-1',
    tenantId: TENANT,
    externalBookingId: 'BOOK-1',
    propertyId: 'prop-1',
  });
});

describe('Mapeo de los datos del huésped al parte', () => {
  it('lee el formato estructurado guestData.viajeros', () => {
    const personas = personasDesdeGuestData({ viajeros: [viajeroCompleto()] });
    expect(personas).toHaveLength(1);
    expect(personas[0].nombre).toBe('Juan');
    expect(personas[0].numeroDocumento).toBe('00000000T');
    expect(personas[0].direccion.codigoMunicipio).toBe('28079');
  });

  it('cae a los campos sueltos del canal, sin inventar lo que falta', () => {
    const personas = personasDesdeGuestData({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@correo.es',
      phone: '600000000',
    });
    expect(personas).toHaveLength(1);
    expect(personas[0].nombre).toBe('Ana');
    expect(personas[0].apellido1).toBe('Pérez');
    expect(personas[0].correo).toBe('ana@correo.es');
    // Lo que el canal no manda queda vacío: lo detecta la validación.
    expect(personas[0].numeroDocumento).toBeNull();
    expect(personas[0].fechaNacimiento).toBe('');
    expect(personas[0].direccion.direccion).toBe('');
  });

  it('sin datos de huésped no inventa una persona', () => {
    expect(personasDesdeGuestData(null)).toEqual([]);
    expect(personasDesdeGuestData({})).toEqual([]);
  });

  it('acepta la dirección como objeto o como texto plano', () => {
    const objeto = mapearPersonaMIR({
      nombre: 'Luis',
      direccion: { calle: 'Rúa Nova 2', cp: '15701', ciudad: 'Santiago', country: 'ESP' },
    });
    expect(objeto.direccion.direccion).toBe('Rúa Nova 2');
    expect(objeto.direccion.codigoPostal).toBe('15701');

    const plano = mapearPersonaMIR({ nombre: 'Luis', direccion: 'Rúa Nova 2', cp: '15701', pais: 'ESP' });
    expect(plano.direccion.direccion).toBe('Rúa Nova 2');
    expect(plano.direccion.pais).toBe('ESP');
  });
});

describe('Construcción del parte desde la reserva', () => {
  it('traduce fechas a la zona horaria de la propiedad y referencia el contrato', () => {
    const parte = construirParteDesdeReserva({
      reserva: {
        id: 'res-1',
        externalBookingId: 'BOOK-1',
        checkIn: new Date('2026-09-20T22:30:00Z'),
        checkOut: new Date('2026-09-23T10:00:00Z'),
        bookedOn: new Date('2026-09-01T10:00:00Z'),
        fechaCreacion: new Date('2026-09-01T10:00:00Z'),
        occupancyAdults: 1,
        occupancyChildren: 0,
        guestData: null,
        unitNombre: 'Habitación 1',
      },
      personas: [mapearPersonaMIR(viajeroCompleto())],
      timeZone: 'Europe/Madrid',
      tipoPago: 'EFECT',
      fechaPago: new Date('2026-09-20T15:05:00Z'),
    });

    expect(parte.contrato.referencia).toBe('BOOK-1');
    expect(parte.contrato.fechaContrato).toBe('2026-09-01');
    // 22:30 UTC del día 20 son las 00:30 del 21 en Madrid.
    expect(parte.contrato.fechaEntrada).toBe('2026-09-21T00:30:00');
    expect(parte.contrato.numPersonas).toBe(1);
    expect(parte.contrato.numHabitaciones).toBe(1);
    expect(parte.contrato.pago.tipoPago).toBe('EFECT');
  });

  it('resuelve el código de tipo de pago por el mapa interno, con respaldo', () => {
    const config = { tipoPagoDefecto: 'EFECT', mapaTiposPago: { stripe: 'TARJT' } };
    expect(resolverTipoPago('stripe', config)).toBe('TARJT');
    expect(resolverTipoPago('transferencia', config)).toBe('EFECT');
    expect(resolverTipoPago(null, config)).toBe('EFECT');
    // Sin configuración no se inventa un código.
    expect(resolverTipoPago('stripe', { tipoPagoDefecto: null })).toBeNull();
  });
});

describe('Configuración del arrendador', () => {
  it('sin configurar no está listo para enviar', async () => {
    __mockPrisma.hospitalityMirConfig.findUnique.mockResolvedValue(null);
    const publica = await getMirConfigPublica(TENANT);
    expect(publica.configurado).toBe(false);
    expect(publica.listoParaEnviar).toBe(false);
  });

  it('requiere credenciales y un código de tipo de pago para enviar', async () => {
    const listo = await getMirConfigPublica(TENANT);
    expect(listo.listoParaEnviar).toBe(true);
    expect(listo.tieneCredenciales).toBe(true);
    expect(listo.tiposPagoConfigurados).toBe(2);

    __mockPrisma.hospitalityMirConfig.findUnique.mockResolvedValue(
      configMock({ tipoPagoDefecto: null, mapaTiposPago: null })
    );
    const sinPago = await getMirConfigPublica(TENANT);
    expect(sinPago.tieneCredenciales).toBe(true);
    expect(sinPago.listoParaEnviar).toBe(false);
  });
});

describe('Envío al servicio oficial', () => {
  it('envía el sobre SOAP al endpoint del Ministerio con autenticación básica', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(respuestaSoap(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.enviada);
    expect(resultado.lote).toBe('LOTE-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINTS_MIR.pre);
    expect(url).toMatch(/^https:\/\/hospedajes\.(pre-ses|ses)\.mir\.es\//);
    expect(opciones.headers.Authorization).toBe(
      `Basic ${Buffer.from('usuario-ses:clave-ses').toString('base64')}`
    );
    expect(opciones.headers['Content-Type']).toContain('text/xml');
    expect(opciones.body).toContain('<com:comunicacionRequest>');
    expect(opciones.body).toContain('<codigoArrendador>0000000001</codigoArrendador>');
    expect(opciones.body).toContain('<tipoComunicacion>PV</tipoComunicacion>');

    // La solicitud viaja en ZIP + Base64 y lleva el código de establecimiento.
    const base64 = /<solicitud>([^<]+)<\/solicitud>/.exec(opciones.body)?.[1] ?? '';
    const zip = Buffer.from(base64, 'base64');
    expect(zip.subarray(0, 2).toString('utf8')).toBe('PK');
    const xml = inflateRawSync(
      zip.subarray(30 + zip.readUInt16LE(26), 30 + zip.readUInt16LE(26) + zip.readUInt32LE(18))
    ).toString('utf8');
    expect(xml).toContain('<codigoEstablecimiento>1234567890</codigoEstablecimiento>');
    expect(xml).toContain('<rol>VI</rol>');
  });

  it('guarda la traza con lote y estado, y limpia el último error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(respuestaSoap(), { status: 200 })));
    await enviarRegistroDeReserva(TENANT, 'res-1');

    const upsert = __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe(ESTADO_REGISTRO.enviada);
    expect(upsert.create.lote).toBe('LOTE-1');
    expect(upsert.create.tipoComunicacion).toBe('PV');
    expect(upsert.create.tipoOperacion).toBe('A');
    expect(upsert.create.codigoEstablecimiento).toBe('1234567890');
    expect(__mockPrisma.hospitalityMirConfig.update).toHaveBeenCalled();
  });

  it('un código de retorno distinto de 0 es un rechazo, no un éxito', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(respuestaSoap('10103', 'El código de arrendador no existe', ''), { status: 200 }))
    );

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');
    expect(resultado.estado).toBe(ESTADO_REGISTRO.rechazada);
    expect(resultado.codigo).toBe('10103');

    const upsert = __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe(ESTADO_REGISTRO.rechazada);
  });

  it('un fallo de red no pierde la traza y NO se guarda como rechazo del Ministerio', async () => {
    // La diferencia importa: un rechazo es una decisión del servicio sobre unos
    // datos y se corrige en el formulario del huésped; un timeout es que el
    // parte no llegó. Guardarlo como «rechazada» hacía que el hotel leyera «el
    // Ministerio rechazó este parte» con los datos perfectos.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.error);
    expect(resultado.estado).not.toBe(ESTADO_REGISTRO.rechazada);
    const upsert = __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe(ESTADO_REGISTRO.error);
    // El error de red queda en la traza: es lo que el panel del hotel enseña
    // como motivo, así que no se puede perder.
    expect(upsert.create.descripcion).toContain('ETIMEDOUT');
    expect(upsert.update.intentos).toEqual({ increment: 1 });
  });

  it('un HTTP de error sin cuerpo SOAP tampoco es un rechazo del Ministerio', async () => {
    // El caso que destapó el ensayo: el servicio caído contesta 503 con texto
    // plano, y `leerRespuestaMIR` devuelve un objeto con los campos vacíos. Ese
    // objeto pasaba por «respuesta» y el parte quedaba como rechazado con motivo
    // «Sin código de retorno»: un rechazo inventado, con los datos perfectos, y
    // al hotel mandándole a corregir un formulario donde no había nada mal.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Service Unavailable', { status: 503 }))
    );

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.error);
    expect(resultado.estado).not.toBe(ESTADO_REGISTRO.rechazada);
    const upsert = __mockPrisma.hospitalityGuestRegistryCommunication.upsert.mock.calls[0][0];
    expect(upsert.create.estado).toBe(ESTADO_REGISTRO.error);
    expect(upsert.create.codigoRetorno).toBeNull();
    // El motivo dice lo que pasó (el servicio no respondió y con qué HTTP), no
    // una lectura inventada de una respuesta que nunca existió.
    expect(upsert.create.descripcion).toContain('503');
  });

  it('el servicio que responde con un CÓDIGO sí es un rechazo', async () => {
    // La contraprueba: si el servicio contesta, lo que dice es una decisión suya
    // y el diagnóstico es de datos/configuración, no de entrega.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => respuestaSoap('10130', 'El documento no es válido'),
      })
    );

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.rechazada);
  });
});

describe('Un parte incompleto nunca sale del sistema', () => {
  beforeEach(() => {
    // El canal solo manda contacto: falta documento, nacimiento y dirección.
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(
      reservaMock({
        guestData: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@correo.es' },
      })
    );
  });

  it('queda en datos_incompletos sin llamar al Ministerio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.datosIncompletos);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultado.errores.length).toBeGreaterThan(0);
    // El detalle identifica los campos que faltan, no un error genérico.
    const campos = resultado.errores.map((e) => e.campo).join(' ');
    expect(campos).toContain('numeroDocumento');
    expect(campos).toContain('fechaNacimiento');
  });

  it('sin código de establecimiento tampoco se envía y lo dice', async () => {
    __mockPrisma.hospitalityReservation.findFirst.mockResolvedValue(
      reservaMock({
        property: {
          id: 'prop-1',
          nombre: 'Hotel Centro',
          timezone: 'Europe/Madrid',
          codigoEstablecimientoMIR: null,
        },
      })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');
    expect(resultado.estado).toBe(ESTADO_REGISTRO.datosIncompletos);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultado.errores.map((e) => e.campo)).toContain('codigoEstablecimiento');
  });

  it('sin código de tipo de pago configurado tampoco se envía', async () => {
    __mockPrisma.hospitalityMirConfig.findUnique.mockResolvedValue(
      configMock({ tipoPagoDefecto: null, mapaTiposPago: null })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');
    expect(resultado.estado).toBe(ESTADO_REGISTRO.datosIncompletos);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultado.errores.map((e) => e.campo)).toContain('contrato.pago.tipoPago');
  });
});

describe('Reserva de hospedaje (RH): la compuerta del namespace', () => {
  it('la comunicación de reserva sale del mismo sitio que el parte (namespace del XSD, no inventado)', () => {
    const fuente = readFileSync(
      path.resolve(__dirname, '..', 'lib/hospitality/registro-viajeros-service.ts'),
      'utf8'
    );
    // El namespace entra SIEMPRE por `namespaceAltaReservaHospedaje()`: el día
    // que se informe NS_ALTA_RESERVA, este camino funciona sin tocar nada más.
    expect(fuente).toContain('namespaceAltaReservaHospedaje()');
    expect(fuente).not.toMatch(/namespace:\s*['"`]/);
  });

  it('sin el XSD oficial no construye XML, no llama al Ministerio y tampoco deja traza', async () => {
    if (reservasHospedajeHabilitadas()) {
      // Si ya está el namespace, esta guardia deja de aplicar.
      return;
    }
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarReservaHospedaje(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.pendienteXsd);
    expect(resultado.descripcion).toBe(MOTIVO_RH_SIN_NAMESPACE);
    expect(resultado.descripcion).toMatch(/XSD/);
    expect(fetchMock).not.toHaveBeenCalled();
    // Ni traza ni configuración: no se ensucia la pantalla cada hora.
    expect(__mockPrisma.hospitalityGuestRegistryCommunication.upsert).not.toHaveBeenCalled();
    expect(__mockPrisma.hospitalityReservation.findFirst).not.toHaveBeenCalled();
  });

  it('el estado del registro dice que la reserva aún no se puede emitir, con el motivo', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.groupBy.mockResolvedValue([]);
    __mockPrisma.hospitalityProperty.count.mockResolvedValue(0);
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mockResolvedValue([]);

    const estado = await estadoRegistroViajeros(TENANT);

    expect(estado.reservas.habilitadas).toBe(reservasHospedajeHabilitadas());
    if (!estado.reservas.habilitadas) {
      expect(estado.reservas.motivo).toBe(MOTIVO_RH_SIN_NAMESPACE);
    }
  });
});

describe('El panel del hotel ve los partes que el sistema dejó de reintentar', () => {
  const trazaAbandonada = {
    id: 'com-abandonada',
    reservationId: 'res-1',
    referencia: 'REF-ABANDONADA',
    estado: ESTADO_REGISTRO.rechazada,
    descripcion: 'El campo persona[0].numeroDocumento no tiene un formato válido',
    codigoRetorno: '10130',
    errores: [],
    intentos: MAX_INTENTOS_PARTE,
    fechaEdicion: new Date('2026-09-18T10:00:00Z'),
  };

  function conTrazas(ultimas: unknown[], abandonadas: unknown[]) {
    __mockPrisma.hospitalityGuestRegistryCommunication.findMany
      .mockResolvedValueOnce(ultimas)
      .mockResolvedValueOnce(abandonadas);
  }

  /**
   * Los dos `groupBy` del estado: el primero es el conteo por estado de TODO el
   * registro y el segundo solo los abandonados (rechazada/error con los intentos
   * agotados). Se distinguen por su `where.intentos`, que es lo que los separa.
   */
  function conConteos(
    porEstado: unknown[],
    abandonadosPorEstado: unknown[] = []
  ) {
    __mockPrisma.hospitalityGuestRegistryCommunication.groupBy.mockImplementation(async (args: any) =>
      args?.where?.intentos ? abandonadosPorEstado : porEstado
    );
  }

  it('cuenta el abandono por el tope del barrido, dentro del tenant', async () => {
    conConteos(
      [
        { estado: ESTADO_REGISTRO.aceptada, _count: 3 },
        { estado: ESTADO_REGISTRO.rechazada, _count: 2 },
        { estado: ESTADO_REGISTRO.datosIncompletos, _count: 1 },
      ],
      [{ estado: ESTADO_REGISTRO.rechazada, _count: 1 }]
    );
    conTrazas([], [trazaAbandonada]);

    const estado = await estadoRegistroViajeros(TENANT);

    expect(estado.sinReintentar).toBe(1);
    expect(estado.partesSinReintentar).toHaveLength(1);
    expect(estado.partesSinReintentar[0]).toMatchObject({
      id: 'com-abandonada',
      reservationId: 'res-1',
      referencia: 'REF-ABANDONADA',
      intentos: MAX_INTENTOS_PARTE,
    });
    // El recuento va SOLO sobre lo que el barrido abandonó y sobre los dos
    // desenlaces que puede abandonar: si mirara todas las rechazadas, el panel
    // diría que hay más partes perdidos de los que hay; si dejara fuera `error`,
    // una caída del servicio no aparecería por ningún lado.
    const argsAbandonados = __mockPrisma.hospitalityGuestRegistryCommunication.groupBy.mock.calls
      .map((c: any[]) => c[0])
      .find((args: any) => args?.where?.intentos);
    expect(argsAbandonados.where).toMatchObject({ tenantId: TENANT });
    expect(argsAbandonados.where.estado.in).toEqual(
      expect.arrayContaining([ESTADO_REGISTRO.rechazada, ESTADO_REGISTRO.error])
    );
    expect(argsAbandonados.where.intentos).toEqual({ gte: MAX_INTENTOS_PARTE });
  });

  it('el diagnóstico viaja con la fila: la pantalla no lo reinterpreta', async () => {
    conConteos([{ estado: ESTADO_REGISTRO.rechazada, _count: 1 }], [
      { estado: ESTADO_REGISTRO.rechazada, _count: 1 },
    ]);
    conTrazas([], [trazaAbandonada]);

    const estado = await estadoRegistroViajeros(TENANT);

    // Saber que está abandonado no basta: sin el ámbito, el panel mandaría al
    // formulario del huésped un rechazo que era de configuración.
    expect(estado.partesSinReintentar[0].diagnostico).toMatchObject({
      ambito: 'datos',
      codigo: '10130',
      campos: ['numeroDocumento'],
      motivo: 'El campo persona[0].numeroDocumento no tiene un formato válido',
    });
  });

  it('una entrega que no llegó se diagnostica como fallo de envío, no como rechazo', async () => {
    conConteos(
      [{ estado: ESTADO_REGISTRO.error, _count: 1 }],
      [{ estado: ESTADO_REGISTRO.error, _count: 1 }]
    );
    conTrazas([], [
      {
        id: 'com-sin-entregar',
        reservationId: 'res-2',
        referencia: 'REF-BRUNO',
        estado: ESTADO_REGISTRO.error,
        descripcion: 'No se pudo entregar la comunicación: fetch failed',
        codigoRetorno: null,
        errores: null,
        intentos: MAX_INTENTOS_PARTE,
        fechaEdicion: new Date('2026-09-18T12:00:00Z'),
      },
    ]);

    const estado = await estadoRegistroViajeros(TENANT);

    expect(estado.sinReintentar).toBe(1);
    expect(estado.partesSinReintentar[0]).toMatchObject({ estado: ESTADO_REGISTRO.error });
    expect(estado.partesSinReintentar[0].diagnostico).toMatchObject({
      desenlace: 'sin_entregar',
      ambito: 'envio',
      campos: [],
    });
    // Y la métrica lo cuenta por su causa, no mezclado con los rechazos.
    expect(estado.partes).toMatchObject({ sinReintentarSinEntregar: 1, sinReintentarRechazados: 0 });
  });

  it('las métricas comparan con los aceptados y no cuentan los incompletos como perdidos', async () => {
    conConteos(
      [
        { estado: ESTADO_REGISTRO.aceptada, _count: 3 },
        { estado: ESTADO_REGISTRO.rechazada, _count: 1 },
        { estado: ESTADO_REGISTRO.datosIncompletos, _count: 2 },
        { estado: ESTADO_REGISTRO.enviada, _count: 1 },
      ],
      [{ estado: ESTADO_REGISTRO.rechazada, _count: 1 }]
    );
    conTrazas([], [trazaAbandonada]);

    const estado = await estadoRegistroViajeros(TENANT);

    expect(estado.partes).toMatchObject({
      aceptadas: 3,
      sinReintentar: 1,
      sinReintentarRechazados: 1,
      sinReintentarSinEntregar: 0,
      rechazadasEnCurso: 0,
      sinEntregarEnCurso: 0,
      esperandoAlHuesped: 2,
      otras: 1,
      cerradas: 4,
      tasaSinReintentar: 0.25,
    });
  });

  it('las entregas fallidas en curso se cuentan antes de que se agoten los intentos', async () => {
    // La señal temprana de una caída: el barrido sigue reintentando, así que no
    // es abandono, pero el panel ya lo dice.
    conConteos(
      [
        { estado: ESTADO_REGISTRO.aceptada, _count: 1 },
        { estado: ESTADO_REGISTRO.error, _count: 3 },
      ],
      [{ estado: ESTADO_REGISTRO.error, _count: 1 }]
    );
    conTrazas([], [trazaAbandonada]);

    const estado = await estadoRegistroViajeros(TENANT);

    expect(estado.partes).toMatchObject({
      sinReintentarSinEntregar: 1,
      sinEntregarEnCurso: 2,
      sinReintentar: 1,
    });
  });

  it('sin abandonados el panel no enseña lista y la tasa es 0 (no null)', async () => {
    conConteos([{ estado: ESTADO_REGISTRO.aceptada, _count: 2 }]);
    conTrazas([], []);

    const estado = await estadoRegistroViajeros(TENANT);

    expect(estado.sinReintentar).toBe(0);
    expect(estado.partesSinReintentar).toEqual([]);
    expect(estado.partes.tasaSinReintentar).toBe(0);
  });

  it('la lista se acota: un panel no carga la traza entera del tenant', async () => {
    conConteos([], [{ estado: ESTADO_REGISTRO.rechazada, _count: 50 }]);
    conTrazas([], [trazaAbandonada]);

    await estadoRegistroViajeros(TENANT);

    const argsLista = __mockPrisma.hospitalityGuestRegistryCommunication.findMany.mock.calls[1][0];
    expect(argsLista.take).toBe(PARTES_SIN_REINTENTAR_EN_PANEL);
    expect(argsLista.orderBy).toEqual({ fechaEdicion: 'desc' });
  });
});

describe('Destino del envío: el Ministerio, y el mock del ensayo como única excepción', () => {
  const envEnsayo = { NODE_ENV: 'development', [VAR_ENDPOINT_ENSALLO]: 'http://127.0.0.1:4620/comunicacion' };

  it('sin la variable del ensayo, el destino es el endpoint publicado por el Ministerio', () => {
    expect(endpointParaEnvio('pre', {})).toBe(ENDPOINTS_MIR.pre);
    expect(endpointParaEnvio('prod', {})).toBe(ENDPOINTS_MIR.prod);
  });

  it('en producción la variable se IGNORA: el parte sale al Ministerio', () => {
    const env = { ...envEnsayo, NODE_ENV: 'production' };
    expect(endpointParaEnvio('pre', env)).toBe(ENDPOINTS_MIR.pre);
    expect(endpointParaEnvio('prod', env)).toBe(ENDPOINTS_MIR.prod);
  });

  it('fuera de producción apunta al mock local del ensayo (127.0.0.1, localhost, [::1])', () => {
    expect(endpointParaEnvio('pre', envEnsayo)).toBe('http://127.0.0.1:4620/comunicacion');
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const env = { NODE_ENV: 'test', [VAR_ENDPOINT_ENSALLO]: `http://${host}:4620/x` };
      expect(endpointParaEnvio('pre', env)).toBe(`http://${host}:4620/x`);
    }
  });

  it('un destino que no sea loopback revienta: no hay forma de desviar el envío a un tercero', () => {
    for (const url of ['https://agregador.example.com/comunicacion', 'http://10.0.0.9:4620/x']) {
      const env = { NODE_ENV: 'development', [VAR_ENDPOINT_ENSALLO]: url };
      expect(() => endpointParaEnvio('pre', env)).toThrow(/mock local del ensayo/);
    }
  });

  it('la guardia del host solo admite el mock en loopback y fuera de producción', () => {
    for (const host of ['hospedajes.pre-ses.mir.es', 'hospedajes.ses.mir.es']) {
      expect(esHostOficialMIR(host)).toBe(true);
    }
    expect(esHostOficialMIR('agregador.example.com')).toBe(false);

    expect(esMockDeEnsayo('127.0.0.1', { NODE_ENV: 'development' })).toBe(true);
    // En producción, ni loopback: ese host no es el del Ministerio.
    expect(esMockDeEnsayo('127.0.0.1', { NODE_ENV: 'production' })).toBe(false);
    expect(esMockDeEnsayo('agregador.example.com', { NODE_ENV: 'development' })).toBe(false);
  });

  it('con la variable puesta, el cliente llama al mock y no al Ministerio', async () => {
    process.env[VAR_ENDPOINT_ENSALLO] = 'http://127.0.0.1:4620/comunicacion';
    try {
      const fetchMock = vi.fn(async () => new Response(respuestaSoap(), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

      expect(resultado.estado).toBe(ESTADO_REGISTRO.enviada);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4620/comunicacion');
    } finally {
      delete process.env[VAR_ENDPOINT_ENSALLO];
      vi.unstubAllGlobals();
    }
  });

  it('un override a un tercero no se traga en silencio: el envío falla', async () => {
    process.env[VAR_ENDPOINT_ENSALLO] = 'https://agregador.example.com/comunicacion';
    try {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(enviarRegistroDeReserva(TENANT, 'res-1')).rejects.toThrow(
        /mock local del ensayo/
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete process.env[VAR_ENDPOINT_ENSALLO];
      vi.unstubAllGlobals();
    }
  });

  it('hostDeEndpoint lee el host sin puerto ni ruta (y no revienta con basura)', () => {
    expect(hostDeEndpoint('https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion')).toBe(
      'hospedajes.ses.mir.es'
    );
    expect(hostDeEndpoint('http://127.0.0.1:4620/x')).toBe('127.0.0.1');
    expect(hostDeEndpoint('no-es-una-url')).toBe('');
  });
});

describe('Construcción de la reserva de hospedaje desde la reserva', () => {
  it('el primer huésped es el titular (TI) y el resto son viajeros (VI)', () => {
    const personas = [
      mapearPersonaMIR(viajeroCompleto(), 'VI'),
      mapearPersonaMIR({ ...viajeroCompleto(), nombre: 'Luis', direccion: null }, 'VI'),
    ];

    const reserva = construirReservaDesdeReserva({
      reserva: {
        id: 'res-1',
        externalBookingId: 'BOOK-1',
        checkIn: new Date('2026-09-20T15:00:00Z'),
        checkOut: new Date('2026-09-23T12:00:00Z'),
        bookedOn: new Date('2026-09-01T10:00:00Z'),
        fechaCreacion: new Date('2026-09-01T10:00:00Z'),
        occupancyAdults: 2,
        occupancyChildren: 0,
        guestData: null,
        unitNombre: 'Habitación 1',
      },
      personas,
      timeZone: 'Europe/Madrid',
      tipoPago: 'EFECT',
      fechaPago: new Date('2026-09-20T15:05:00Z'),
      codigoEstablecimiento: '1234567890',
    });

    expect(reserva.personas.map((p) => p.rol)).toEqual(['TI', 'VI']);
    expect(reserva.establecimiento.codigo).toBe('1234567890');
    expect(reserva.contrato.referencia).toBe('BOOK-1');
    // Fechas en la zona horaria de la propiedad, como en el parte.
    expect(reserva.contrato.fechaEntrada).toBe('2026-09-20T17:00:00');
    expect(reserva.contrato.pago?.tipoPago).toBe('EFECT');
    // Un huésped sin dirección (la OTA no la manda) viaja igual: el mapeo deja
    // el bloque vacío y la reserva no se bloquea por eso, a diferencia del
    // parte de viajeros.
    expect(direccionVacia(reserva.personas[1].direccion)).toBe(true);
    expect(direccionVacia(reserva.personas[0].direccion)).toBe(false);
  });
});

describe('Idempotencia', () => {
  it('no reenvía un alta EN VUELO: reenviarla duplicaría la comunicación', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findUnique.mockResolvedValue({
      id: 'com-1',
      estado: ESTADO_REGISTRO.enviada,
      codigoRetorno: '0',
      descripcion: 'Ok',
      lote: 'LOTE-7',
      fechaEnvio: new Date(),
      codigoComunicacion: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.enviada);
    expect(resultado.lote).toBe('LOTE-7');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sí reintenta si el envío se quedó SIN lote: no hay nada que consultar', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findUnique.mockResolvedValue({
      id: 'com-1',
      estado: ESTADO_REGISTRO.enviada,
      codigoRetorno: '0',
      descripcion: 'Ok',
      lote: null,
      fechaEnvio: new Date(),
    });
    const fetchMock = vi.fn(async () => new Response(respuestaSoap(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');

    expect(resultado.estado).toBe(ESTADO_REGISTRO.enviada);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('y también si el lote superó la ventana: el plazo legal no admite esperar siempre', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findUnique.mockResolvedValue({
      id: 'com-1',
      estado: ESTADO_REGISTRO.enviada,
      codigoRetorno: '0',
      descripcion: 'Ok',
      lote: 'LOTE-7',
      fechaEnvio: new Date(Date.now() - VENTANA_LOTE_MS - 60_000),
    });
    const fetchMock = vi.fn(async () => new Response(respuestaSoap(), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await enviarRegistroDeReserva(TENANT, 'res-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('`enVuelo()` fija la regla: con lote y dentro de la ventana, sí; sin lote o vencido, no', () => {
    const ahora = Date.now();
    const base = { estado: ESTADO_REGISTRO.enviada, lote: 'LOTE-7', fechaEnvio: new Date(ahora) };

    expect(enVuelo(base, ahora)).toBe(true);
    expect(enVuelo({ ...base, lote: null }, ahora)).toBe(false);
    expect(enVuelo({ ...base, estado: ESTADO_REGISTRO.aceptada }, ahora)).toBe(false);
    expect(enVuelo({ ...base, fechaEnvio: new Date(ahora - VENTANA_LOTE_MS - 1) }, ahora)).toBe(false);
    expect(enVuelo({ ...base, fechaEnvio: null }, ahora)).toBe(false);
  });

  it('no reenvía una comunicación ya aceptada', async () => {
    __mockPrisma.hospitalityGuestRegistryCommunication.findUnique.mockResolvedValue({
      id: 'com-1',
      estado: ESTADO_REGISTRO.aceptada,
      codigoRetorno: '0',
      descripcion: 'Ok',
      lote: 'LOTE-1',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');
    expect(resultado.estado).toBe(ESTADO_REGISTRO.aceptada);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin configuración activa devuelve error sin llamar a nadie', async () => {
    __mockPrisma.hospitalityMirConfig.findUnique.mockResolvedValue(configMock({ activo: false }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await enviarRegistroDeReserva(TENANT, 'res-1');
    expect(resultado.estado).toBe(ESTADO_REGISTRO.error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
