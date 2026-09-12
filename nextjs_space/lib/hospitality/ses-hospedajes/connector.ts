/**
 * Conector con SES.HOSPEDAJES (Ministerio del Interior).
 *
 * Qué es esto. La capa de transporte del registro de viajeros: los dos endpoints
 * oficiales, la autenticación, el empaquetado del mensaje y la lectura de la
 * respuesta. Es lo que hay entre el dominio del registro (lib/hospitality/compliance.ts)
 * y el servicio del Ministerio, y no se mezcla con Reservas.
 *
 * Lo que NO es. Aquí no se decide qué se comunica ni cuándo: eso es del dominio y
 * de la sección de Operaciones.
 *
 * ─── ÚNICA PIEZA PENDIENTE: el esquema del XML ───────────────────────────────
 *
 * `construirXml` lanza `EsquemaNoDisponibleError` a propósito. El cuerpo de la
 * comunicación es un contrato externo —nombres de nodo, orden, catálogo de tipos de
 * documento, códigos de operación— que fija el Ministerio en su manual de alta, y
 * el plan maestro prohíbe inventar campos de un servicio externo: un XML inventado
 * que el Ministerio rechace es peor que no enviarlo, y uno que acepte con los datos
 * mal colocados es mucho peor.
 *
 * Por eso el resto está terminado y probado: autenticación por tenant, empaquetado
 * ZIP+Base64, transporte, manejo del error y bitácora. Meter el esquema es escribir
 * el cuerpo de esa única función y su lector de respuesta; nada más cambia.
 *
 * Autenticación: HTTP Basic sobre SSL, con las credenciales de la entidad de CADA
 * TENANT (cada cuenta se registra por su cuenta ante el Ministerio). Viajan en la
 * cabecera y nunca se registran en logs ni en la bitácora.
 */

import { empaquetarZipBase64 } from './zip';

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
 * El esquema oficial no está disponible.
 *
 * Es un error tipado y no un `Error` genérico para que la ruta pueda responder
 * «falta la configuración del esquema» en lugar de un 500 que parezca una caída.
 */
export class EsquemaNoDisponibleError extends Error {
  readonly pieza = 'esquema-xml';

  constructor(tipo: TipoComunicacion) {
    super(
      `No se puede construir la comunicación «${tipo}»: falta el esquema oficial del XML de ` +
        'SES.HOSPEDAJES (manual de alta de la entidad). El transporte, el empaquetado y la ' +
        'autenticación ya funcionan; el cuerpo del mensaje es lo único pendiente.'
    );
    this.name = 'EsquemaNoDisponibleError';
  }
}

/** ¿Está el esquema del XML ya implementado? La sección lo usa para avisar. */
export const ESQUEMA_XML_DISPONIBLE = false;

/**
 * Construye el XML de una comunicación.
 *
 * PENDIENTE: requiere el manual oficial de SES.HOSPEDAJES (nombres de nodo, orden,
 * catálogo de tipos de documento, códigos de operación y campos obligatorios). Hasta
 * entonces no se inventa un cuerpo que el Ministerio pueda aceptar mal.
 */
export function construirXml(tipo: TipoComunicacion, _datos: unknown): string {
  throw new EsquemaNoDisponibleError(tipo);
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
  /** Código de comunicación del Ministerio, cuando el esquema permita leerlo. */
  codigo?: string;
  /** Mensaje del Ministerio, cuando el esquema permita leerlo. */
  mensaje?: string;
  /** Cuerpo de la respuesta sin tratar, para la bitácora y el diagnóstico. */
  cuerpo: string;
}

export interface ParametrosEnvio {
  entorno: string | null | undefined;
  credenciales: CredencialesSes;
  /** El XML ya construido. Quien no lo tenga, choca antes en `construirXml`. */
  xml: string;
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
  xml,
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
        'Content-Type': 'text/plain; charset=utf-8',
        Accept: 'text/plain, application/xml, text/xml',
      },
      body: empaquetarComunicacion(xml),
      signal: controlador.signal,
    });

    const cuerpo = await respuesta.text();
    return {
      ok: respuesta.ok,
      status: respuesta.status,
      cuerpo,
      // PENDIENTE: el código y el mensaje se leen del XML de respuesta, y su forma
      // también es parte del esquema oficial pendiente.
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
 * validar las credenciales exige enviar una comunicación y eso exige el esquema.
 * Para lo que sirve es para separar los dos fallos que se confunden: «el servidor
 * del Ministerio no me responde» y «mi comunicación es incorrecta». Un 401 sin
 * cuerpo tampoco se interpreta aquí como credenciales malas: eso lo dirá el
 * Ministerio cuando reciba la comunicación.
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
