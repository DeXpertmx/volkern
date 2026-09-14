/**
 * Conector con SES.HOSPEDAJES (Ministerio del Interior).
 *
 * Qué es esto. La capa de transporte del registro de viajeros: los dos endpoints
 * oficiales, la autenticación, la construcción del mensaje, el empaquetado y la
 * lectura de la respuesta. Es lo que hay entre el dominio del registro
 * (lib/hospitality/compliance.ts) y el servicio del Ministerio, y no se mezcla
 * con Reservas.
 *
 * Lo que NO es. Aquí no se decide qué se comunica ni cuándo: eso es del dominio y
 * de la sección de Operaciones.
 *
 * El mensaje. El cuerpo lo fija el interface v3.0.0 del servicio (el WSDL de la
 * operación `comunicacion` y los XSD de alta), y vive en `esquema.ts`: el XML del
 * alta (RH o PV) se comprime en ZIP y se codifica en Base64 dentro de un sobre
 * SOAP 1.1 (`zip.ts` y `esquema.ts`). Autenticación: HTTP Basic sobre SSL, con
 * las credenciales de la entidad de CADA TENANT; viajan en la cabecera y nunca
 * se registran en logs ni en la bitácora.
 */

import { empaquetarZipBase64 } from './zip';
import {
  aFechaHoraSes,
  aFechaSes,
  construirSobreSoap,
  construirXmlAnulacion,
  construirXmlParte,
  construirXmlReserva,
  ETIQUETA_COMUNICACION,
  leerRespuestaLote,
  OPERACION_POR_TIPO,
  type ComunicacionParte,
  type ComunicacionReserva,
} from './esquema';

/**
 * Endpoints oficiales del servicio de comunicación.
 *
 * Son constantes, no configuración por tenant: el Ministerio publica uno de
 * pruebas y uno de producción, y dejar que un tenant los edite solo sirve para
 * enviar datos personales a un host equivocado.
 */
export const ENDPOINTS = {
  pruebas: 'https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion',
  produccion: 'https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion',
} as const;

export type EntornoSes = keyof typeof ENDPOINTS;
export const ENTORNOS: readonly EntornoSes[] = ['pruebas', 'produccion'];

export function esEntornoSes(valor: unknown): valor is EntornoSes {
  return valor === 'pruebas' || valor === 'produccion';
}

/** URL del servicio para un entorno; un entorno desconocido cae a pruebas. */
export function urlDeComunicacion(entorno: string | null | undefined): string {
  return esEntornoSes(entorno) ? ENDPOINTS[entorno] : ENDPOINTS.pruebas;
}

export interface CredencialesSes {
  usuario: string;
  password: string;
  /** Credencial digital de la entidad, cifrada en reposo en la base de datos. */
  certificado?: string | null;
}

/**
 * Cabecera `Authorization` del tenant.
 *
 * Es una función y no un literal para que las credenciales se construyan en un
 * único sitio: si cada ruta montara su Basic Auth, la primera que se equivoque
 * manda los datos de un tenant con las credenciales de otro.
 */
export function cabeceraBasic(credenciales: CredencialesSes): string {
  const par = `${credenciales.usuario}:${credenciales.password}`;
  return `Basic ${Buffer.from(par, 'utf8').toString('base64')}`;
}

/** Las tres comunicaciones que el contrato documenta. */
export type TipoComunicacion = 'reserva' | 'viajeros' | 'anulacion';

export const TIPOS_COMUNICACION: readonly TipoComunicacion[] = ['reserva', 'viajeros', 'anulacion'];

/**
 * Faltan datos para componer la comunicación.
 *
 * Es un error tipado y no un `Error` genérico para que la ruta pueda responder
 * «faltan datos» en lugar de un 500 que parezca una caída. No sustituye a la
 * validación del dominio: aquí se comprueba lo que el MENSAJE necesita y el
 * dominio aún no garantiza (el establecimiento, el contrato, al menos una persona).
 */
export class DatosInsuficientesError extends Error {
  readonly pieza: string;

  constructor(pieza: string, mensaje: string) {
    super(mensaje);
    this.name = 'DatosInsuficientesError';
    this.pieza = pieza;
  }
}

/** El esquema del interface v3.0.0 está implementado. La sección lo usa para avisar. */
export const ESQUEMA_XML_DISPONIBLE = true;

export interface DatosComunicacion {
  /** La reserva y sus viajeros, tal como los carga la capa de datos. */
  reserva?: {
    /** Referencia interna de la reserva (externalBookingId). */
    referencia?: string | null;
    /** Cuándo se reservó; si no llega, manda la fecha de entrada. */
    bookedOn?: Date | string | null;
    checkIn?: Date | string | null;
    checkOut?: Date | string | null;
    total?: number | null;
  } | null;
  viajeros?: Array<Record<string, unknown>>;
  /** Código oficial del establecimiento (el que asigna el alta de la entidad). */
  codigoEstablecimiento?: string | null;
  /** Código de arrendador de la entidad (la cabecera del lote). */
  codigoArrendador?: string | null;
  /** Códigos de comunicación a anular, cuando el tipo es `anulacion`. */
  codigosAnulacion?: string[];
}

/**
 * Construye la petición completa del tipo que pide la ruta.
 *
 * Devuelve las tres piezas por separado: la `solicitud` (el XML del alta, para
 * inspección y bitácora), el `paquete` (ZIP+Base64, lo que define el contenido)
 * y el `sobre` (el SOAP final, lo que viaja por la red).
 *
 * El nombre de la aplicación que firma la cabecera es el del producto, no el del
 * proveedor de infraestructura: el Ministerio ve quién comunica.
 */
export function construirPeticionSes(
  tipo: TipoComunicacion,
  datos: DatosComunicacion
): { solicitud: string; paquete: string; sobre: string } {
  const codigoArrendador = (datos.codigoArrendador || '').trim();
  if (!codigoArrendador) {
    throw new DatosInsuficientesError(
      'codigo-arrendador',
      'Falta el código de arrendador de la entidad: es el que el Ministerio asignó al registrarla'
    );
  }

  let solicitud: string;

  if (tipo === 'reserva') {
    const codigo = (datos.codigoEstablecimiento || '').trim();
    const referencia = (datos.reserva?.referencia || '').trim();
    if (!codigo) {
      throw new DatosInsuficientesError(
        'establecimiento',
        'Falta el código de establecimiento del alojamiento: es el que el Ministerio asigna al darlo de alta'
      );
    }
    if (!referencia) {
      throw new DatosInsuficientesError('referencia', 'La reserva no tiene referencia para comunicar');
    }
    if (!datos.reserva?.checkIn || !datos.reserva?.checkOut) {
      throw new DatosInsuficientesError('contrato', 'La reserva no tiene fechas de entrada y salida');
    }

    const personas = (datos.viajeros ?? []).map((viajero) => aPersonaReserva(viajero));
    if (personas.length === 0) {
      throw new DatosInsuficientesError('personas', 'La reserva no tiene ninguna persona que comunicar');
    }

    solicitud = construirXmlReserva({
      establecimiento: { codigo },
      contrato: aContrato(datos.reserva, personas.length),
      personas,
    });
  } else if (tipo === 'viajeros') {
    const codigo = (datos.codigoEstablecimiento || '').trim();
    if (!codigo) {
      throw new DatosInsuficientesError(
        'establecimiento',
        'Falta el código de establecimiento del alojamiento: es el que el Ministerio asigna al darlo de alta'
      );
    }
    if (!datos.reserva?.checkIn || !datos.reserva?.checkOut) {
      throw new DatosInsuficientesError('contrato', 'La reserva no tiene fechas de entrada y salida');
    }

    const personas = (datos.viajeros ?? []).map((viajero) => aPersonaParte(viajero));
    if (personas.length === 0) {
      throw new DatosInsuficientesError('personas', 'La reserva no tiene ningún viajero declarado');
    }

    solicitud = construirXmlParte({
      codigoEstablecimiento: codigo,
      comunicaciones: [{ contrato: aContrato(datos.reserva, personas.length), personas }],
    });
  } else {
    const codigos = (datos.codigosAnulacion ?? []).map((c) => String(c).trim()).filter(Boolean);
    if (codigos.length === 0) {
      throw new DatosInsuficientesError(
        'codigos-anulacion',
        'No hay código de comunicación que anular: el Ministerio todavía no asignó ninguno a esta reserva'
      );
    }
    solicitud = construirXmlAnulacion(codigos);
  }

  const paquete = empaquetarComunicacion(solicitud);
  const sobre = construirSobreSoap(
    {
      codigoArrendador,
      aplicacion: 'Volkern Hospitality',
      tipoOperacion: OPERACION_POR_TIPO[tipo],
      tipoComunicacion: ETIQUETA_COMUNICACION[tipo],
    },
    paquete
  );

  return { solicitud, paquete, sobre };
}

/** El contrato de hospedaje a partir de la reserva de Volkern. */
function aContrato(reserva: NonNullable<DatosComunicacion['reserva']>, numPersonas: number) {
  const checkIn = reserva.checkIn instanceof Date ? reserva.checkIn : new Date(String(reserva.checkIn));
  const checkOut = reserva.checkOut instanceof Date ? reserva.checkOut : new Date(String(reserva.checkOut));
  const referencia = (reserva.referencia || '').trim().slice(0, 50) || 'SIN-REFERENCIA';

  return {
    referencia,
    fechaContrato: aFechaSes(reserva.bookedOn ?? checkIn),
    // Las fechas del contrato van en los formatos del XSD: date (solo día) para
    // el contrato y dateTime para la entrada y la salida.
    fechaEntrada: aFechaHoraSes(checkIn),
    fechaSalida: aFechaHoraSes(checkOut),
    numPersonas,
    pago: { tipoPago: 'OTRO' as const },
  };
}

const aTexto = (valor: unknown): string | null => {
  if (valor == null) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  return texto || null;
};

/**
 * La persona de la RESERVA (`personaReservaType`): sin dirección.
 *
 * El rol: el titular de la reserva es `TI`; todo el resto viaja como viajero
 * (`VI`), que es lo que el XSD permite sin conocer el papel exacto de cada uno.
 */
function aPersonaReserva(viajero: Record<string, unknown>) {
  return {
    rol: (viajero.esTitular ? 'TI' : 'VI') as 'TI' | 'VI',
    nombre: aTexto(viajero.nombre) ?? '',
    apellido1: aTexto(viajero.apellido1) ?? '',
    apellido2: aTexto(viajero.apellido2),
    tipoDocumento: aTexto(viajero.tipoDocumento),
    numeroDocumento: aTexto(viajero.numeroDocumento),
    soporteDocumento: aTexto(viajero.soporteDocumento),
    fechaNacimiento: aTexto(viajero.fechaNacimiento) ?? '',
    nacionalidad: aTexto(viajero.nacionalidad),
    correo: aTexto(viajero.correo),
  };
}

/**
 * La persona del PARTE (`personaHospedajeType`): con dirección obligatoria.
 *
 * La dirección completa es un dato que Volkern todavía no pide en el formulario
 * del viajero; sin ella el parte no se puede construir, y fingir una sería
 * comunicar al Ministerio algo falso. El error lo dice claro para que la ficha
 * pida antes lo que falta.
 */
function aPersonaParte(viajero: Record<string, unknown>) {
  const persona = aPersonaReserva(viajero);
  const via = aTexto(viajero.direccion);
  const cp = aTexto(viajero.codigoPostal);
  if (!via || !cp) {
    throw new DatosInsuficientesError(
      'direccion',
      `El viajero ${persona.nombre} ${persona.apellido1} no tiene dirección completa (vía y código postal): el parte de viajeros la exige`
    );
  }
  return {
    ...persona,
    direccion: {
      direccion: via,
      codigoMunicipio: aTexto(viajero.codigoMunicipio),
      nombreMunicipio: aTexto(viajero.municipio),
      codigoPostal: cp,
      pais: aTexto(viajero.paisDireccion) ?? 'ESP',
    },
    telefono: aTexto(viajero.telefono),
    telefono2: aTexto(viajero.telefono2),
    parentesco: aTexto(viajero.parentesco),
  };
}

/** El paquete que viaja por la red: el XML comprimido en ZIP y en Base64. */
export function empaquetarComunicacion(xml: string, nombre = 'comunicacion.xml'): string {
  return empaquetarZipBase64([{ nombre, contenido: xml }]);
}

export interface RespuestaSes {
  /** ¿Respondió el servicio sin error de transporte? */
  ok: boolean;
  /** Código HTTP, tal cual. */
  status: number;
  /** ¿El Ministerio aceptó el lote (código 0 y ninguna comunicación rechazada)? */
  aceptado: boolean;
  /** Código de estado del lote, según el WSDL. */
  codigoEstado?: number | null;
  /** Descripción del estado del lote. */
  descripcion?: string;
  /** Identificador del lote, para trazabilidad. */
  lote?: string | null;
  /** El código de comunicación asignado, si el lote fue aceptado. */
  codigo?: string;
  /** Mensaje del Ministerio, para la bandeja. */
  mensaje?: string;
  /** El cuerpo de la respuesta sin tratar, para la bitácora y el diagnóstico. */
  cuerpo: string;
}

export interface ParametrosEnvio {
  entorno: string | null | undefined;
  credenciales: CredencialesSes;
  /** El sobre SOAP ya construido (`construirPeticionSes().sobre`). */
  peticionSobre: string;
  /** Inyectable para pruebas; por defecto el `fetch` del runtime. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Envía una comunicación al Ministerio.
 *
 * Devuelve siempre la respuesta —también cuando el servicio contesta 4xx o 5xx—
 * porque lo que el Ministerio respondió es exactamente el dato que hay que guardar
 * en la bitácora. Solo el fallo de transporte (sin respuesta) lanza.
 *
 * No reintenta: el plan maestro prohíbe los reintentos ciegos, y una comunicación
 * repetida que el Ministerio acepte dos veces es una duplicidad con datos
 * personales. El reintento lo decide la persona que ve el error en la bandeja.
 */
export async function enviarComunicacion({
  entorno,
  credenciales,
  peticionSobre,
  fetchImpl,
  timeoutMs = 20_000,
}: ParametrosEnvio): Promise<RespuestaSes> {
  const enviar = fetchImpl ?? fetch;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const respuesta = await enviar(urlDeComunicacion(entorno), {
      method: 'POST',
      headers: {
        Authorization: cabeceraBasic(credenciales),
        'Content-Type': 'application/xml; charset=utf-8',
        Accept: 'application/soap+xml, application/xml, text/xml',
      },
      body: peticionSobre,
      signal: controlador.signal,
    });

    const cuerpo = await respuesta.text();

    // El SOAP del Ministerio llega en el cuerpo; si se pudo leer, el código del
    // lote y el de cada comunicación mandan sobre el HTTP para decidir si fue
    // aceptado (un 200 con errores de lote NO es un envío válido).
    let leida;
    try {
      leida = await leerRespuestaLote(cuerpo);
    } catch {
      leida = null;
    }

    if (leida) {
      const aceptada = leida.resultados.find((r) => r.codigoComunicacion);
      const rechazada = leida.resultados.find((r) => r.tipoError != null || r.error != null);
      return {
        ok: respuesta.ok,
        status: respuesta.status,
        aceptado: leida.ok,
        codigoEstado: leida.codigo,
        descripcion: leida.descripcion,
        lote: leida.lote,
        codigo: leida.ok ? aceptada?.codigoComunicacion ?? leida.lote ?? undefined : undefined,
        mensaje: rechazada?.error || leida.descripcion || undefined,
        cuerpo,
      };
    }

    // Sin SOAP legible (un error HTML de la pasarela, un texto): el HTTP manda.
    return {
      ok: respuesta.ok,
      status: respuesta.status,
      aceptado: respuesta.ok,
      cuerpo,
    };
  } finally {
    clearTimeout(temporizador);
  }
}

export interface AlcanceSes {
  alcanzable: boolean;
  entorno: EntornoSes;
  url: string;
  status?: number;
  error?: string;
}

/**
 * Comprueba que el endpoint responde: DNS, TLS y HTTP.
 *
 * Es deliberadamente una comprobación de ALCANCE y no de credenciales, porque
 * validar las credenciales exige enviar una comunicación con datos reales, y eso
 * no se hace desde un botón de prueba. Para lo que sirve es para separar los dos
 * fallos que se confunden: «el servidor del Ministerio no me responde» y «mi
 * comunicación es incorrecta». Un 401 sin cuerpo tampoco se interpreta aquí como
 * credenciales malas: eso lo dirá el Ministerio cuando reciba la comunicación.
 */
export async function probarAlcance(
  entorno: string | null | undefined,
  fetchImpl?: typeof fetch,
  timeoutMs = 10_000
): Promise<AlcanceSes> {
  const elegido: EntornoSes = esEntornoSes(entorno) ? entorno : 'pruebas';
  const url = ENDPOINTS[elegido];
  const enviar = fetchImpl ?? fetch;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const respuesta = await enviar(url, { method: 'GET', signal: controlador.signal });
    return { alcanzable: true, entorno: elegido, url, status: respuesta.status };
  } catch (error) {
    return {
      alcanzable: false,
      entorno: elegido,
      url,
      error: error instanceof Error ? error.message : 'Error de red desconocido',
    };
  } finally {
    clearTimeout(temporizador);
  }
}
