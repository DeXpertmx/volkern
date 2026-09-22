/**
 * Registro de viajeros — comunicación al Ministerio del Interior.
 *
 * Implementa el contrato OFICIAL del «Servicio de Comunicación Hospedajes»
 * (MIR-HOSPE-DSI-WS, versión v3.1.2, Secretaría de Estado de Seguridad) del
 * Real Decreto 933/2021, artículo 6. **No** usa agregadores ni APIs de
 * terceros: el mensaje que se construye aquí es exactamente el que espera el
 * web service del Ministerio (SOAP 1.1 con el XML de la solicitud comprimido
 * en ZIP y codificado en Base64).
 *
 * Qué fija este módulo (módulo puro: sin BD y sin red, todo testeable):
 *  1. Los endpoints oficiales (pruebas y producción) y la autenticación básica
 *     HTTP que exige el servicio (sección 2.2 de la especificación).
 *  2. El XML de alta de **partes de viajeros** (`PV`) con el orden de los
 *     elementos del XSD oficial (Anexo I) y el namespace
 *     `http://www.neg.hospedajes.mir.es/altaParteHospedaje`.
 *  3. El XML de las otras dos operaciones que hacen falta en operación:
 *     consulta de lotes (`C`) y anulación de comunicaciones (`B`).
 *  4. Las validaciones de obligatoriedad y formato de la especificación, con
 *     el código de error del servicio asociado, para no enviar nunca un parte
 *     que vaya a ser rechazado.
 *  5. El sobre SOAP, el empaquetado ZIP + Base64 y la lectura de la respuesta.
 * *  LÍMITES DOCUMENTADOS (no se inventa nada que la especificación no publique):
 *  - Los códigos de los catálogos (tipo de documento, sexo, tipo de pago,
 *    parentesco, tipo de establecimiento) NO se codifican a mano: el servicio
 *    los publica en la operación `catalogo` y aquí entran como datos. Lo único
 *    que se conoce por nombre son los que la propia especificación usa en sus
 *    ejemplos (NIF / NIE, que además son los que exigen segundo apellido y
 *    número de soporte).
 *  - El alta de **reservas de hospedaje** (`RH`) está implementada de punta a
 *    punta (estructura, validaciones y sobre SOAP) salvo UN dato: el namespace
 *    del XSD. La tabla del apartado 3.1.1.2 del documento oficial describe en
 *    texto todos los elementos, sus rutas y su obligatoriedad, y de ahí sale el
 *    XML; el namespace, en cambio, solo aparece en la figura del XSD —que es
 *    una imagen, sin capa de texto— y no se deduce del de las otras
 *    operaciones. Por eso es una constante `null` con su procedencia declarada
 *    (`NS_ALTA_RESERVA` / `FUENTE_NS_ALTA_RESERVA`): mientras no se copie del
 *    XSD oficial, el producto **no emite** comunicaciones de reserva, en vez de
 *    hablar con un esquema inventado.
 */

import { deflateRawSync } from 'node:zlib';

/** Versión de la especificación oficial que implementa este módulo. */
export const SPEC_MIR_VERSION = '3.1.2';

// ────────────────────────────────────────────────────────────────────────────
// 1. Endpoints y namespaces oficiales (apartado 2.1 y anexos I, II y III)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Endpoints publicados por el Ministerio. Son los ÚNICOS destinos que este
 * módulo puede llamar: no hay ningún intermediario ni pasarela de terceros.
 */
export const ENDPOINTS_MIR = {
  /** Entorno de pruebas del Ministerio. */
  pre: 'https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion',
  /** Entorno de producción del Ministerio. */
  prod: 'https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion',
} as const;

export type EntornoMIR = keyof typeof ENDPOINTS_MIR;

/** Host que puede aparecer en las peticiones: solo el del Ministerio. */
export const HOSTS_MIR_OFICIALES = [
  'hospedajes.pre-ses.mir.es',
  'hospedajes.ses.mir.es',
] as const;

export function endpointMIR(entorno: EntornoMIR): string {
  return ENDPOINTS_MIR[entorno];
}

/** Namespace del sobre SOAP y del servicio de comunicación. */
export const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
export const NS_COMUNICACION = 'http://www.soap.servicios.hospedajes.mir.es/comunicacion';

/** Namespaces del XML interno de cada operación (anexos I, II y III). */
export const NS_ALTA_PARTE = 'http://www.neg.hospedajes.mir.es/altaParteHospedaje';
export const NS_CONSULTA_LOTES = 'http://www.neg.hospedajes.mir.es/consultarComunicacion';
export const NS_ANULACION = 'http://www.neg.hospedajes.mir.es/anularComunicacion';

/**
 * Namespace del XSD de alta de **reservas de hospedaje** (`RH`).
 *
 * Está SIN INFORMAR a propósito, y no por falta de trabajo: se ha verificado
 * que ese dato no es accesible en fuentes oficiales. Búsquedas realizadas:
 *  - El documento oficial v3.1.2 publica los XSD como **imágenes**: su capa de
 *    texto contiene únicamente los namespaces de parte de viajeros, consulta de
 *    lotes y anulación (y ningún `targetNamespace`).
 *  - El WSDL del servicio (`…/comunicacion?wsdl`) responde **HTTP 401**: exige
 *    las credenciales del arrendador.
 *  - La Sede Electrónica del Ministerio no publica los esquemas (la página de
 *    Hospedajes es una aplicación, sin enlaces de descarga).
 *
 * El namespace NO se deduce a partir del patrón de los otros (eso sería
 * inventar el contrato): se copia del fichero XSD oficial que entrega el
 * Ministerio junto con las credenciales. El día que llegue, se informan las dos
 * constantes juntas —`NS_ALTA_RESERVA` y su procedencia— y el test lo exige.
 */
export const NS_ALTA_RESERVA: string | null = null;

/**
 * Procedencia exacta de `NS_ALTA_RESERVA` (fichero, versión y fecha de
 * obtención). Obligatoria en cuanto la constante esté informada.
 */
export const FUENTE_NS_ALTA_RESERVA: string | null = null;

/** ¿Se pueden emitir ya comunicaciones de reserva de hospedaje (`RH`)? */
export function reservasHospedajeHabilitadas(): boolean {
  return typeof NS_ALTA_RESERVA === 'string' && NS_ALTA_RESERVA.trim().length > 0;
}

/**
 * Namespace con el que construir el XML de reservas de hospedaje.
 * Falla con un mensaje accionable mientras no se haya copiado del XSD oficial.
 */
export function namespaceAltaReservaHospedaje(): string {
  if (!reservasHospedajeHabilitadas()) {
    throw new Error(
      '[Registro de viajeros] Falta el namespace del XSD oficial de reservas de hospedaje (RH). ' +
        'No se deduce: se copia del fichero XSD que entrega el Ministerio y se informa en ' +
        'NS_ALTA_RESERVA junto con FUENTE_NS_ALTA_RESERVA (ver docs/hospitality-registro-viajeros-mir.md).'
    );
  }
  return NS_ALTA_RESERVA as string;
}

/** Nombre del fichero XML dentro del ZIP (la especificación no lo fija). */
export const NOMBRE_FICHERO_SOLICITUD = 'solicitud.xml';

// ────────────────────────────────────────────────────────────────────────────
// 2. Valores del contrato (apartado 3.1.1 — bloque cabecera)
// ────────────────────────────────────────────────────────────────────────────

/** Tipos de operación admitidos por el servicio. */
export const TIPO_OPERACION = {
  alta: 'A',
  consulta: 'C',
  anulacion: 'B',
} as const;
export type TipoOperacion = (typeof TIPO_OPERACION)[keyof typeof TIPO_OPERACION];

/** Tipos de comunicación. `RH` (reservas de hospedaje) aún no se emite: ver la nota del encabezado. */
export const TIPO_COMUNICACION = {
  parteViajeros: 'PV',
  reservaHospedaje: 'RH',
  alquilerVehiculo: 'AV',
  reservaVehiculo: 'RV',
} as const;
export type TipoComunicacion = (typeof TIPO_COMUNICACION)[keyof typeof TIPO_COMUNICACION];

/** Rol de la persona dentro del contrato (apartado 3.1.1.1). */
export const ROL_PERSONA = {
  viajero: 'VI',
  titular: 'TI',
} as const;

/**
 * Estados de reserva en los que el parte de viajeros puede emitirse: el servicio
 * ya empezó.
 *
 * Es una constante compartida a propósito, y no una lista repetida en cada
 * sitio: la usan el cron horario (su red de seguridad) y el check-in online
 * (para saber si al guardar los documentos ya toca enviar). Una entrada de un
 * no-show o de una reserva cancelada nunca ocurrió, así que no se comunica.
 */
export const ESTADOS_ACTIVOS_REGISTRO: readonly string[] = ['confirmed', 'checked_in', 'checked_out'];

/**
 * Estado de un lote (apartado 3.1.2). Se usa al consultar el resultado de un
 * envío: el alta es asíncrona, el `0` solo confirma que se recibió.
 */
export const ESTADOS_LOTE: Record<string, string> = {
  '1': 'Lote tramitado sin errores',
  '2': 'Lote con errores en la cabecera o formato de la solicitud',
  '3': 'Error inesperado',
  '4': 'En proceso',
  '5': 'Pendiente',
  '6': 'Lote tramitado con errores en algunas comunicaciones',
};

/**
 * Códigos de retorno del servicio: viven PUROS en `mir-espec.ts` (la UI
 * traduce un rechazo a texto sin arrastrar `node:zlib` al navegador) y aquí
 * se reexportan para no romper a los consumidores existentes.
 */
export {
  CODIGOS_ERROR_MIR,
  describirCodigoMIR,
  esCodigoCorrectoMIR,
} from './mir-espec';

// ────────────────────────────────────────────────────────────────────────────
// 3. Tipos del fichero XML de alta de partes de viajeros
// ────────────────────────────────────────────────────────────────────────────

/** Bloque común `direccion` (apartado 4.1). */
export interface DireccionMIR {
  /** Calle, número, escalera, piso, puerta… String(100). */
  direccion: string;
  /** Campo adicional de la dirección. String(100). */
  direccionComplementaria?: string | null;
  /** Municipio (códigos INE de 5 dígitos). Obligatorio si `pais` es ESP. */
  codigoMunicipio?: string | null;
  /** Nombre del municipio/ciudad/estado. Obligatorio si `pais` no es ESP. */
  nombreMunicipio?: string | null;
  /** Código postal. String(20). */
  codigoPostal: string;
  /** País ISO 3166-1 alfa-3 (ESP, FRA, USA…). */
  pais: string;
}

/** Bloque común `pago` (apartado 4.2). */
export interface PagoMIR {
  /** Código del catálogo TIPO_PAGO. */
  tipoPago: string;
  /** Fecha del pago, formato AAAA-MM-DD. */
  fechaPago?: string | null;
  /** Identificación del medio de pago (tarjeta, IBAN…). String(50). */
  medioPago?: string | null;
  /** Nombre y apellidos del titular. String(100). */
  titular?: string | null;
  /** Caducidad de la tarjeta, formato MM/AAAA. String(7). */
  caducidadTarjeta?: string | null;
}

/** Persona alojada (bloque `persona`, repetible). */
export interface PersonaMIR {
  /** Rol en el contrato: `VI` (viajero) en un parte de viajeros. */
  rol?: string;
  nombre: string;
  apellido1: string;
  apellido2?: string | null;
  /** Código del catálogo TIPO_DOCUMENTO. Obligatorio si la persona es mayor de edad. */
  tipoDocumento?: string | null;
  /** String(15). Obligatorio si es mayor de edad; formato válido si es NIF/NIE. */
  numeroDocumento?: string | null;
  /** String(9). Obligatorio si el documento es NIF o NIE. */
  soporteDocumento?: string | null;
  /** Fecha de nacimiento, formato AAAA-MM-DD. Obligatoria. */
  fechaNacimiento: string;
  /** Nacionalidad ISO 3166-1 alfa-3. */
  nacionalidad?: string | null;
  /** Código del catálogo SEXO. */
  sexo?: string | null;
  direccion: DireccionMIR;
  telefono?: string | null;
  telefono2?: string | null;
  correo?: string | null;
  /** Código del catálogo TIPO_PARENTESCO. Obligatorio si la persona es menor. */
  parentesco?: string | null;
}

/** Datos del contrato (bloque `contrato`). */
export interface ContratoMIR {
  /** Número de referencia del contrato. String(50). */
  referencia: string;
  /** Fecha de formalización, AAAA-MM-DD. */
  fechaContrato: string;
  /** Fecha y hora de entrada, AAAA-MM-DDThh:mm:ss. */
  fechaEntrada: string;
  /** Fecha y hora de salida, AAAA-MM-DDThh:mm:ss. */
  fechaSalida: string;
  /** Número de personas alojadas. */
  numPersonas: number;
  /** Número de habitaciones ocupadas. */
  numHabitaciones?: number | null;
  /** ¿Tienen conexión a internet? */
  internet?: boolean | null;
  pago: PagoMIR;
}

/** Un parte de viajeros: contrato + personas alojadas. */
export interface ParteViajerosMIR {
  contrato: ContratoMIR;
  personas: PersonaMIR[];
}

/** Cabecera de cualquier petición al servicio. */
export interface CabeceraMIR {
  /** Código del arrendador asignado por el Sistema de Hospedajes. String(10). */
  codigoArrendador: string;
  /** Nombre del sistema origen. String(50). */
  aplicacion: string;
  tipoOperacion: TipoOperacion;
  /** Obligatorio solo en el alta de comunicaciones. */
  tipoComunicacion?: TipoComunicacion | null;
}

/** Respuesta del servicio (apartado 3.1.2). */
export interface RespuestaMIR {
  /** Código de retorno: `0` = recibida. */
  codigo: string | null;
  descripcion: string | null;
  /** Número de lote: identifica la petición para consultarla después. */
  lote: string | null;
  /** Bloques `resultado` (solo en consultas). */
  resultados: ResultadoLoteMIR[];
}

export interface ResultadoLoteMIR {
  lote: string | null;
  tipoComunicacion: string | null;
  tipoOperacion: string | null;
  codigoEstado: string | null;
  descEstado: string | null;
  comunicaciones: ResultadoComunicacionMIR[];
}

export interface ResultadoComunicacionMIR {
  orden: number | null;
  codigoComunicacion: string | null;
  anulada: boolean;
  tipoError: string | null;
  error: string | null;
}

/** Error de validación local, ya mapeado al código del servicio. */
export interface ErrorValidacionMIR {
  /** Ruta del campo dentro del mensaje, p. ej. `comunicacion[0].persona[1].correo`. */
  campo: string;
  mensaje: string;
  /** Código del servicio al que corresponde el rechazo (10131, 10130, 10121…). */
  codigo: string;
}

export interface ValidacionMIR {
  errores: ErrorValidacionMIR[];
  /** Observaciones que NO impiden enviar el parte. */
  avisos: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Utilidades de formato y validación
// ────────────────────────────────────────────────────────────────────────────

/** Escapa el contenido de un nodo XML. */
export function escaparXml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());

/** Longitud máxima declarada por la especificación para cada campo. */
/**
 * Longitudes máximas de cada campo según el XSD oficial.
 *
 * Exportadas a propósito: los formularios que recogen datos del huésped
 * (motor de reservas y check-in online) las usan para no dejar entrar lo que el
 * Ministerio rechazaría — y así hay una sola fuente de verdad en vez de dos
 * listas que se desincronizan.
 */
export const LONGITUDES = {
  codigoEstablecimiento: 10,
  codigoArrendador: 10,
  aplicacion: 50,
  referencia: 50,
  nombre: 50,
  apellido: 50,
  tipoDocumento: 5,
  numeroDocumento: 15,
  soporteDocumento: 9,
  nacionalidad: 3,
  pais: 3,
  sexo: 1,
  direccion: 100,
  codigoPostal: 20,
  telefono: 20,
  correo: 250,
  parentesco: 5,
  medioPago: 50,
  titular: 100,
  caducidadTarjeta: 7,
  codigoMunicipio: 5,
  nombreMunicipio: 100,
  tipoPago: 5,
  rol: 2,
} as const;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** AAAA-MM-DDThh:mm:ss, con desplazamiento horario opcional. */
const RE_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)?$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ISO 3166-1 alfa-3: tres letras. */
const RE_ALFA3 = /^[A-Za-z]{3}$/;
/** Códigos INE de municipio: exactamente 5 dígitos. */
const RE_MUNICIPIO_INE = /^\d{5}$/;

/** Letras del control del DNI/NIF español. */
const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** ¿El número de documento tiene una forma válida de NIF (DNI)? */
export function esNIF(numero: string): boolean {
  const n = numero.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^\d{8}[A-Z]$/.test(n)) return false;
  return LETRAS_NIF[parseInt(n.slice(0, 8), 10) % 23] === n[8];
}

/** ¿El número de documento tiene una forma válida de NIE? */
export function esNIE(numero: string): boolean {
  const n = numero.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^[XYZ]\d{7}[A-Z]$/.test(n)) return false;
  const prefijo = { X: '0', Y: '1', Z: '2' }[n[0] as 'X' | 'Y' | 'Z'];
  return LETRAS_NIF[parseInt(`${prefijo}${n.slice(1, 8)}`, 10) % 23] === n[8];
}

/**
 * ¿El tipo de documento (código del catálogo TIPO_DOCUMENTO) es uno de los que
 * la especificación trata como NIF/NIE? Son los que exigen segundo apellido y
 * número de soporte. Se compara por nombre porque el catálogo se publica en el
 * servicio (`catalogo`), no en el documento.
 */
export function esDocumentoNIFoNIE(tipoDocumento: string | null | undefined): boolean {
  const t = texto(tipoDocumento).toUpperCase();
  return t.startsWith('NIF') || t.startsWith('NIE');
}

/** Edad cumplida en una fecha de referencia. */
export function edadEn(fechaNacimiento: string, referencia: Date): number | null {
  if (!RE_FECHA.test(texto(fechaNacimiento))) return null;
  const [anio, mes, dia] = texto(fechaNacimiento).split('-').map(Number);
  const nacimiento = new Date(Date.UTC(anio, mes - 1, dia));
  if (Number.isNaN(nacimiento.getTime())) return null;
  let edad = referencia.getUTCFullYear() - anio;
  const cumpleEsteAnio = new Date(Date.UTC(referencia.getUTCFullYear(), mes - 1, dia));
  if (referencia.getTime() < cumpleEsteAnio.getTime()) edad -= 1;
  return edad;
}

/** Formatea una fecha como AAAA-MM-DD en la zona horaria indicada. */
export function formatearFechaMIR(fecha: Date, timeZone = 'UTC'): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Formatea una fecha y hora como AAAA-MM-DDThh:mm:ss en la zona indicada. */
export function formatearFechaHoraMIR(fecha: Date, timeZone = 'UTC'): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}T${valor('hour')}:${valor('minute')}:${valor('second')}`;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Validación (nunca se envía un parte que el servicio vaya a rechazar)
// ────────────────────────────────────────────────────────────────────────────

function error(campo: string, mensaje: string, codigo = '10131'): ErrorValidacionMIR {
  return { campo, mensaje, codigo };
}

function requerido(
  errores: ErrorValidacionMIR[],
  valor: unknown,
  campo: string,
  maxLongitud?: number
): string {
  const v = texto(valor);
  if (!v) {
    errores.push(error(campo, `Es obligatorio indicar un valor en el campo ${campo}`, '10131'));
    return '';
  }
  if (maxLongitud && v.length > maxLongitud) {
    errores.push(error(campo, `El campo ${campo} supera los ${maxLongitud} caracteres`, '10130'));
  }
  return v;
}

function validarDireccion(d: DireccionMIR | null | undefined, campo: string, errores: ErrorValidacionMIR[]) {
  if (!d) {
    errores.push(error(campo, `Es obligatorio indicar la dirección`, '10131'));
    return;
  }
  requerido(errores, d.direccion, `${campo}.direccion`, LONGITUDES.direccion);
  requerido(errores, d.codigoPostal, `${campo}.codigoPostal`, LONGITUDES.codigoPostal);

  const pais = requerido(errores, d.pais, `${campo}.pais`, LONGITUDES.pais).toUpperCase();
  if (pais && !RE_ALFA3.test(pais)) {
    errores.push(error(`${campo}.pais`, 'El país debe ir en ISO 3166-1 alfa-3 (3 letras)', '10130'));
  }

  if (pais === 'ESP') {
    const municipio = texto(d.codigoMunicipio);
    if (!municipio) {
      errores.push(
        error(`${campo}.codigoMunicipio`, 'El código de municipio del INE es obligatorio cuando el país es España', '10131')
      );
    } else if (!RE_MUNICIPIO_INE.test(municipio)) {
      errores.push(
        error(`${campo}.codigoMunicipio`, 'El código de municipio debe tener 5 dígitos (códigos INE)', '10130')
      );
    }
  } else if (pais) {
    requerido(errores, d.nombreMunicipio, `${campo}.nombreMunicipio`, LONGITUDES.nombreMunicipio);
  }
}

function validarPago(p: PagoMIR | null | undefined, campo: string, errores: ErrorValidacionMIR[]) {
  if (!p) {
    errores.push(error(campo, 'Es obligatorio indicar el bloque de pago', '10131'));
    return;
  }
  requerido(errores, p.tipoPago, `${campo}.tipoPago`, LONGITUDES.tipoPago);
  const fecha = texto(p.fechaPago);
  if (fecha && !RE_FECHA.test(fecha)) {
    errores.push(error(`${campo}.fechaPago`, 'La fecha de pago debe tener el formato AAAA-MM-DD', '10130'));
  }
  const caducidad = texto(p.caducidadTarjeta);
  if (caducidad && !/^\d{2}\/\d{4}$/.test(caducidad)) {
    errores.push(error(`${campo}.caducidadTarjeta`, 'La caducidad de tarjeta debe tener el formato MM/AAAA', '10130'));
  }
}

function validarContrato(c: ContratoMIR | null | undefined, campo: string, errores: ErrorValidacionMIR[]) {
  if (!c) {
    errores.push(error(campo, 'Es obligatorio indicar el contrato', '10131'));
    return;
  }
  requerido(errores, c.referencia, `${campo}.referencia`, LONGITUDES.referencia);

  const fechaContrato = requerido(errores, c.fechaContrato, `${campo}.fechaContrato`);
  if (fechaContrato && !RE_FECHA.test(fechaContrato)) {
    errores.push(error(`${campo}.fechaContrato`, 'La fecha de contrato debe tener el formato AAAA-MM-DD', '10130'));
  }

  const entrada = requerido(errores, c.fechaEntrada, `${campo}.fechaEntrada`);
  if (entrada && !RE_FECHA_HORA.test(entrada)) {
    errores.push(
      error(`${campo}.fechaEntrada`, 'La fecha de entrada debe tener el formato AAAA-MM-DDThh:mm:ss', '10130')
    );
  }

  const salida = requerido(errores, c.fechaSalida, `${campo}.fechaSalida`);
  if (salida && !RE_FECHA_HORA.test(salida)) {
    errores.push(
      error(`${campo}.fechaSalida`, 'La fecha de salida debe tener el formato AAAA-MM-DDThh:mm:ss', '10130')
    );
  }

  if (c.numPersonas === null || c.numPersonas === undefined || !Number.isFinite(Number(c.numPersonas))) {
    errores.push(error(`${campo}.numPersonas`, 'Es obligatorio indicar el número de personas alojadas', '10131'));
  } else if (Number(c.numPersonas) < 1) {
    errores.push(error(`${campo}.numPersonas`, 'El número de personas debe ser al menos 1', '10130'));
  }

  if (c.numHabitaciones !== null && c.numHabitaciones !== undefined && !Number.isFinite(Number(c.numHabitaciones))) {
    errores.push(error(`${campo}.numHabitaciones`, 'El número de habitaciones debe ser numérico', '10130'));
  }

  validarPago(c.pago, `${campo}.pago`, errores);
}

/**
 * Valida un parte de viajeros completo contra las reglas de la especificación.
 *
 * Devuelve TODOS los errores encontrados (no solo el primero) para que el
 * operador pueda corregir el parte de una vez. Incluye la regla de menores:
 * si hay alguna persona menor de edad, al menos una persona mayor de edad debe
 * informar su parentesco con ella.
 */
export function validarParteViajeros(parte: ParteViajerosMIR): ValidacionMIR {
  const errores: ErrorValidacionMIR[] = [];
  const avisos: string[] = [];

  validarContrato(parte?.contrato, 'contrato', errores);

  const personas = Array.isArray(parte?.personas) ? parte.personas : [];
  if (personas.length === 0) {
    errores.push(error('persona', 'El parte de viajeros debe incluir al menos una persona alojada', '10131'));
  }

  /** Fecha de referencia para «mayor de edad»: la entrada si es válida. */
  const referencia = (() => {
    const entrada = texto(parte?.contrato?.fechaEntrada);
    const d = entrada ? new Date(entrada) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  })();

  let hayMenor = false;
  let hayParentesco = false;

  personas.forEach((p, i) => {
    const campo = `persona[${i}]`;
    const rol = texto(p?.rol) || ROL_PERSONA.viajero;
    if (rol !== ROL_PERSONA.viajero) {
      // El apartado 3.1.1.1 fija que en un parte de viajeros el rol es siempre VI.
      errores.push(error(`${campo}.rol`, "El rol de una persona en un parte de viajeros debe ser 'VI' (viajero)", '10130'));
    }

    requerido(errores, p?.nombre, `${campo}.nombre`, LONGITUDES.nombre);
    requerido(errores, p?.apellido1, `${campo}.apellido1`, LONGITUDES.apellido);
    requerido(errores, p?.fechaNacimiento, `${campo}.fechaNacimiento`);

    const nacimiento = texto(p?.fechaNacimiento);
    if (nacimiento && !RE_FECHA.test(nacimiento)) {
      errores.push(error(`${campo}.fechaNacimiento`, 'La fecha de nacimiento debe tener el formato AAAA-MM-DD', '10130'));
    }

    const edad = nacimiento ? edadEn(nacimiento, referencia) : null;
    const menor = edad !== null && edad < 18;
    if (menor) hayMenor = true;

    // Documento: obligatorio si la persona es mayor de edad. Si no hay fecha
    // de nacimiento válida NO se puede probar que sea menor, así que se exige
    // igual: el parte ya no va a salir sin la fecha, y darlo por menor sería
    // una suposición que nadie ha documentado.
    if (edad === null || edad >= 18) {
      const tipoDocumento = requerido(errores, p?.tipoDocumento, `${campo}.tipoDocumento`, LONGITUDES.tipoDocumento);
      const numeroDocumento = requerido(
        errores,
        p?.numeroDocumento,
        `${campo}.numeroDocumento`,
        LONGITUDES.numeroDocumento
      );
      if (esDocumentoNIFoNIE(tipoDocumento) && numeroDocumento) {
        if (!esNIF(numeroDocumento) && !esNIE(numeroDocumento)) {
          errores.push(
            error(`${campo}.numeroDocumento`, 'El número no tiene un formato válido de NIF o NIE', '10130')
          );
        }
      }
      if (esDocumentoNIFoNIE(tipoDocumento)) {
        requerido(errores, p?.soporteDocumento, `${campo}.soporteDocumento`, LONGITUDES.soporteDocumento);
      }
    } else {
      // Menor de edad: el documento no es obligatorio, pero si llega debe ser coherente.
      const tipoDocumento = texto(p?.tipoDocumento);
      if (tipoDocumento && esDocumentoNIFoNIE(tipoDocumento)) {
        const numero = texto(p?.numeroDocumento);
        if (numero && !esNIF(numero) && !esNIE(numero)) {
          errores.push(
            error(`${campo}.numeroDocumento`, 'El número no tiene un formato válido de NIF o NIE', '10130')
          );
        }
      }
    }

    // Segundo apellido y soporte: obligatorios con NIF o NIE (cualquier edad).
    const tipoDocumento = texto(p?.tipoDocumento);
    if (esDocumentoNIFoNIE(tipoDocumento)) {
      requerido(errores, p?.apellido2, `${campo}.apellido2`, LONGITUDES.apellido);
    }

    const nacionalidad = texto(p?.nacionalidad);
    if (nacionalidad) {
      if (!RE_ALFA3.test(nacionalidad)) {
        errores.push(error(`${campo}.nacionalidad`, 'La nacionalidad debe ir en ISO 3166-1 alfa-3 (3 letras)', '10130'));
      }
    } else {
      avisos.push(`${campo}: sin nacionalidad informada`);
    }

    if (texto(p?.sexo) && texto(p?.sexo).length > LONGITUDES.sexo) {
      errores.push(error(`${campo}.sexo`, 'El código de sexo no puede superar 1 carácter', '10130'));
    }

    validarDireccion(p?.direccion, `${campo}.direccion`, errores);

    // Contacto: al menos uno de teléfono, teléfono2 o correo.
    const telefono = texto(p?.telefono);
    const telefono2 = texto(p?.telefono2);
    const correo = texto(p?.correo);
    if (!telefono && !telefono2 && !correo) {
      errores.push(
        error(`${campo}.contacto`, 'Es obligatorio informar teléfono, teléfono2 o correo de la persona', '10131')
      );
    }
    if (telefono && telefono.length > LONGITUDES.telefono) {
      errores.push(error(`${campo}.telefono`, 'El teléfono no puede superar 20 caracteres', '10130'));
    }
    if (telefono2 && telefono2.length > LONGITUDES.telefono) {
      errores.push(error(`${campo}.telefono2`, 'El segundo teléfono no puede superar 20 caracteres', '10130'));
    }
    if (correo) {
      if (correo.length > LONGITUDES.correo) {
        errores.push(error(`${campo}.correo`, 'El correo no puede superar 250 caracteres', '10130'));
      } else if (!RE_CORREO.test(correo)) {
        errores.push(error(`${campo}.correo`, 'El correo no tiene un formato de dirección válido', '10130'));
      }
    }

    if (texto(p?.parentesco)) {
      if (texto(p?.parentesco).length > LONGITUDES.parentesco) {
        errores.push(error(`${campo}.parentesco`, 'El código de parentesco no puede superar 5 caracteres', '10130'));
      }
      hayParentesco = true;
    }
  });

  // Regla de menores: la especificación describe el `parentesco` como el dato
  // que relaciona a la persona menor con un adulto, y su propio ejemplo (Anexo
  // I) lo informa EN EL MENOR. Por eso la regla se aplica al parte, no a una
  // persona concreta: si hay algún menor, alguna persona del parte debe
  // informar el parentesco. Así el ejemplo oficial es válido y sigue siendo
  // imposible enviar un parte con menores sin relación declarada.
  if (hayMenor && !hayParentesco) {
    errores.push(
      error(
        'persona',
        'Si alguna persona es menor de edad, alguna persona del parte debe informar su relación de parentesco',
        '10131'
      )
    );
  }

  const numPersonas = Number(parte?.contrato?.numPersonas);
  if (Number.isFinite(numPersonas) && personas.length > 0 && numPersonas !== personas.length) {
    avisos.push(
      `numPersonas (${numPersonas}) no coincide con las personas informadas (${personas.length})`
    );
  }
  if (parte?.contrato?.internet === null || parte?.contrato?.internet === undefined) {
    avisos.push('Sin dato de conexión a internet (campo opcional)');
  }

  return { errores, avisos };
}

/** Valida la cabecera de una petición (apartado 3.1.1). */
export function validarCabeceraMIR(cabecera: CabeceraMIR | null | undefined): ValidacionMIR {
  const errores: ErrorValidacionMIR[] = [];

  const arrendador = texto(cabecera?.codigoArrendador);
  if (!arrendador) {
    errores.push(error('cabecera.codigoArrendador', 'No ha informado el código de arrendador', '10100'));
  } else if (arrendador.length > LONGITUDES.codigoArrendador) {
    errores.push(error('cabecera.codigoArrendador', 'El código de arrendador no puede superar 10 caracteres', '10130'));
  }

  const aplicacion = texto(cabecera?.aplicacion);
  if (!aplicacion) {
    errores.push(error('cabecera.aplicacion', 'No ha informado el código de aplicación', '10101'));
  } else if (aplicacion.length > LONGITUDES.aplicacion) {
    errores.push(error('cabecera.aplicacion', 'Se ha superado el número máximo de caracteres de la aplicación', '10150'));
  }

  const operacion = texto(cabecera?.tipoOperacion).toUpperCase();
  if (!operacion) {
    errores.push(error('cabecera.tipoOperacion', 'No ha informado el código de la operación', '10112'));
  } else if (!['A', 'C', 'B'].includes(operacion)) {
    errores.push(error('cabecera.tipoOperacion', "La operación sólo podrá tener como valores 'A', 'C' ó 'B'", '10117'));
  }

  if (operacion === TIPO_OPERACION.alta) {
    const comunicacion = texto(cabecera?.tipoComunicacion).toUpperCase();
    if (!comunicacion) {
      errores.push(error('cabecera.tipoComunicacion', 'No ha informado el tipo de la comunicación', '10116'));
    } else if (!Object.values(TIPO_COMUNICACION).includes(comunicacion as TipoComunicacion)) {
      errores.push(
        error('cabecera.tipoComunicacion', "Tipo de comunicación no válido. Valores aceptados: 'PV', 'RH', 'AV', 'RV'", '10122')
      );
    }
  }

  return { errores, avisos: [] };
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Construcción del XML (orden de elementos del XSD oficial)
// ────────────────────────────────────────────────────────────────────────────

function nodo(nombre: string, valor: unknown, sangria: string): string | null {
  const v = texto(valor);
  return v ? `${sangria}<${nombre}>${escaparXml(v)}</${nombre}>` : null;
}

function bloques(lineas: Array<string | null>): string {
  return lineas.filter((l): l is string => !!l).join('\n');
}

function xmlDireccion(d: DireccionMIR, sangria: string): string {
  return bloques([
    `${sangria}<direccion>`,
    nodo('direccion', d.direccion, `${sangria}  `),
    nodo('direccionComplementaria', d.direccionComplementaria, `${sangria}  `),
    nodo('codigoMunicipio', d.codigoMunicipio, `${sangria}  `),
    nodo('nombreMunicipio', d.nombreMunicipio, `${sangria}  `),
    nodo('codigoPostal', d.codigoPostal, `${sangria}  `),
    nodo('pais', d.pais, `${sangria}  `),
    `${sangria}</direccion>`,
  ]);
}

function xmlPago(p: PagoMIR, sangria: string): string {
  return bloques([
    `${sangria}<pago>`,
    nodo('tipoPago', p.tipoPago, `${sangria}  `),
    nodo('fechaPago', p.fechaPago, `${sangria}  `),
    nodo('medioPago', p.medioPago, `${sangria}  `),
    nodo('titular', p.titular, `${sangria}  `),
    nodo('caducidadTarjeta', p.caducidadTarjeta, `${sangria}  `),
    `${sangria}</pago>`,
  ]);
}

/**
 * Orden de los elementos de `persona` según el XSD oficial (nodo — ver Anexo I).
 * Se exporta para que las guardias fijen el orden y no se altere sin querer.
 */
export const ORDEN_PERSONA = [
  'rol',
  'nombre',
  'apellido1',
  'apellido2',
  'tipoDocumento',
  'numeroDocumento',
  'soporteDocumento',
  'fechaNacimiento',
  'nacionalidad',
  'sexo',
  'direccion',
  'telefono',
  'telefono2',
  'correo',
  'parentesco',
] as const;

/** Orden de los elementos de `contrato` según el XSD oficial. */
export const ORDEN_CONTRATO = [
  'referencia',
  'fechaContrato',
  'fechaEntrada',
  'fechaSalida',
  'numPersonas',
  'numHabitaciones',
  'internet',
  'pago',
] as const;

function xmlPersona(p: PersonaMIR, sangria: string): string {
  return bloques([
    `${sangria}<persona>`,
    nodo('rol', texto(p.rol) || ROL_PERSONA.viajero, `${sangria}  `),
    nodo('nombre', p.nombre, `${sangria}  `),
    nodo('apellido1', p.apellido1, `${sangria}  `),
    nodo('apellido2', p.apellido2, `${sangria}  `),
    nodo('tipoDocumento', p.tipoDocumento, `${sangria}  `),
    nodo('numeroDocumento', p.numeroDocumento, `${sangria}  `),
    nodo('soporteDocumento', p.soporteDocumento, `${sangria}  `),
    nodo('fechaNacimiento', p.fechaNacimiento, `${sangria}  `),
    nodo('nacionalidad', p.nacionalidad, `${sangria}  `),
    nodo('sexo', p.sexo, `${sangria}  `),
    p.direccion ? xmlDireccion(p.direccion, `${sangria}  `) : null,
    nodo('telefono', p.telefono, `${sangria}  `),
    nodo('telefono2', p.telefono2, `${sangria}  `),
    nodo('correo', p.correo, `${sangria}  `),
    nodo('parentesco', p.parentesco, `${sangria}  `),
    `${sangria}</persona>`,
  ]);
}

function xmlContrato(c: ContratoMIR, sangria: string): string {
  return bloques([
    `${sangria}<contrato>`,
    nodo('referencia', c.referencia, `${sangria}  `),
    nodo('fechaContrato', c.fechaContrato, `${sangria}  `),
    nodo('fechaEntrada', c.fechaEntrada, `${sangria}  `),
    nodo('fechaSalida', c.fechaSalida, `${sangria}  `),
    nodo('numPersonas', c.numPersonas, `${sangria}  `),
    nodo('numHabitaciones', c.numHabitaciones ?? '', `${sangria}  `),
    c.internet === null || c.internet === undefined
      ? null
      : `${sangria}  <internet>${c.internet ? 'true' : 'false'}</internet>`,
    c.pago ? xmlPago(c.pago, `${sangria}  `) : null,
    `${sangria}</contrato>`,
  ]);
}

/**
 * XML de alta de partes de viajeros (operación `A`, tipo `PV`), tal como lo
 * espera el XSD oficial: namespace `altaParteHospedaje`, un
 * `codigoEstablecimiento` y de 1 a n bloques `comunicacion`.
 */
export function construirXmlParteViajeros(input: {
  codigoEstablecimiento: string;
  partes: ParteViajerosMIR[];
}): string {
  const establecimiento = escaparXml(input.codigoEstablecimiento);
  const comunicaciones = input.partes
    .map((parte) =>
      bloques([
        '    <comunicacion>',
        parte.contrato ? xmlContrato(parte.contrato, '      ') : null,
        ...(Array.isArray(parte.personas) ? parte.personas.map((p) => xmlPersona(p, '      ')) : []),
        '    </comunicacion>',
      ])
    )
    .join('\n');

  return bloques([
    `<alt:peticion xmlns:alt="${NS_ALTA_PARTE}">`,
    '  <solicitud>',
    `    <codigoEstablecimiento>${establecimiento}</codigoEstablecimiento>`,
    comunicaciones || null,
    '  </solicitud>',
    '</alt:peticion>',
  ]);
}

/**
 * XML de consulta de lotes (operación `C`), del Anexo II.
 * Es el único modo de saber si un alta se procesó bien: el alta es asíncrona.
 */
export function construirXmlConsultaLotes(lotes: string[]): string {
  const filas = lotes
    .map((lote) => `  <con:lote>${escaparXml(lote)}</con:lote>`)
    .join('\n');
  return bloques([
    `<con:lotes xmlns:con="${NS_CONSULTA_LOTES}">`,
    filas || null,
    '</con:lotes>',
  ]);
}

/**
 * XML de anulación de comunicaciones (operación `B`), del Anexo III.
 * Se usa cuando la reserva se cancela o el huésped sale antes de lo previsto.
 */
export function construirXmlAnulacion(codigos: string[]): string {
  const filas = codigos
    .map((codigo) => `  <anul:codigoComunicacion>${escaparXml(codigo)}</anul:codigoComunicacion>`)
    .join('\n');
  return bloques([
    `<anul:comunicaciones xmlns:anul="${NS_ANULACION}">`,
    filas || null,
    '</anul:comunicaciones>',
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// 6.bis Alta de reservas de hospedaje (RH) — apartado 3.1.1.2
// ────────────────────────────────────────────────────────────────────────────
// La estructura sale de la tabla del apartado 3.1.1.2 del documento oficial,
// que describe en texto cada elemento, su ruta y su obligatoriedad:
//   solicitud/comunicacion/establecimiento  {codigo | datosEstablecimiento}
//   solicitud/comunicacion/contrato         (igual que en el parte de viajeros)
//   solicitud/comunicacion/persona          1..n, con un titular 'TI' obligatorio
// Lo único que no está en texto es el namespace (ver NS_ALTA_RESERVA): el
// builder lo recibe como parámetro, así que no hay ningún valor supuesto.

/** Bloque `establecimiento`: el código del Ministerio o, si no se tiene, los datos. */
export interface EstablecimientoMIR {
  /** Código del establecimiento asignado por el Sistema de Hospedajes. */
  codigo?: string | null;
  /** Datos del inmueble cuando no se dispone de código. */
  datosEstablecimiento?: {
    /** Código del catálogo TIPO_ESTABLECIMIENTO. */
    tipo: string;
    nombre: string;
    direccion: DireccionMIR;
  } | null;
}

/** Una reserva de hospedaje: establecimiento, contrato y personas. */
export interface ReservaHospedajeMIR {
  establecimiento: EstablecimientoMIR;
  contrato: ContratoMIR;
  personas: PersonaMIR[];
}

/**
 * Orden de `persona` en el XSD de reservas. Ojo: NO incluye
 * `soporteDocumento` ni `parentesco` (esos solo existen en el parte de
 * viajeros), y el documento es opcional aquí.
 */
export const ORDEN_PERSONA_RESERVA = [
  'rol',
  'nombre',
  'apellido1',
  'apellido2',
  'tipoDocumento',
  'numeroDocumento',
  'fechaNacimiento',
  'nacionalidad',
  'sexo',
  'direccion',
  'telefono',
  'telefono2',
  'correo',
] as const;

/** Orden de `establecimiento` en el XSD de reservas. */
export const ORDEN_ESTABLECIMIENTO = ['codigo', 'datosEstablecimiento'] as const;

/**
 * ¿El bloque de dirección viene vacío?
 *
 * Importa porque el mapeo construye SIEMPRE un objeto de dirección: cuando el
 * canal no manda dirección, queda con los campos en blanco. Un bloque vacío no
 * es «una dirección informada», y en la reserva la dirección es opcional.
 */
export function direccionVacia(d: DireccionMIR | null | undefined): boolean {
  if (!d) return true;
  return ![
    d.direccion,
    d.direccionComplementaria,
    d.codigoMunicipio,
    d.nombreMunicipio,
    d.codigoPostal,
    d.pais,
  ].some((v) => texto(v));
}

/** Valida una persona dentro de una reserva (reglas del apartado 3.1.1.2). */
function validarPersonaReserva(p: PersonaMIR | undefined, campo: string, errores: ErrorValidacionMIR[]) {
  const rol = texto(p?.rol);
  if (!rol) {
    errores.push(error(`${campo}.rol`, 'El rol de la persona es obligatorio (TI o VI en una reserva)', '10131'));
  } else if (rol !== ROL_PERSONA.titular && rol !== ROL_PERSONA.viajero) {
    errores.push(error(`${campo}.rol`, "En una reserva, el rol solo puede ser 'TI' (titular) o 'VI' (viajero)", '10130'));
  }

  requerido(errores, p?.nombre, `${campo}.nombre`, LONGITUDES.nombre);
  requerido(errores, p?.apellido1, `${campo}.apellido1`, LONGITUDES.apellido);

  // En la reserva el documento NO es obligatorio (a diferencia del parte de
  // viajeros): el huésped todavía no ha dado sus datos al reservar. Si llega,
  // debe ser coherente.
  const tipoDocumento = texto(p?.tipoDocumento);
  if (tipoDocumento && tipoDocumento.length > LONGITUDES.tipoDocumento) {
    errores.push(error(`${campo}.tipoDocumento`, 'El tipo de documento no puede superar 5 caracteres', '10130'));
  }
  const numeroDocumento = texto(p?.numeroDocumento);
  if (numeroDocumento && numeroDocumento.length > LONGITUDES.numeroDocumento) {
    errores.push(error(`${campo}.numeroDocumento`, 'El número de documento no puede superar 15 caracteres', '10130'));
  }
  if (esDocumentoNIFoNIE(tipoDocumento) && numeroDocumento && !esNIF(numeroDocumento) && !esNIE(numeroDocumento)) {
    errores.push(error(`${campo}.numeroDocumento`, 'El número no tiene un formato válido de NIF o NIE', '10130'));
  }

  const nacimiento = texto(p?.fechaNacimiento);
  if (nacimiento && !RE_FECHA.test(nacimiento)) {
    errores.push(error(`${campo}.fechaNacimiento`, 'La fecha de nacimiento debe tener el formato AAAA-MM-DD', '10130'));
  }

  const nacionalidad = texto(p?.nacionalidad);
  if (nacionalidad && !RE_ALFA3.test(nacionalidad)) {
    errores.push(error(`${campo}.nacionalidad`, 'La nacionalidad debe ir en ISO 3166-1 alfa-3 (3 letras)', '10130'));
  }

  // La dirección es opcional en la reserva; si se informa, se valida igual.
  // El canal casi nunca la manda, así que un bloque vacío no se valida ni
  // bloquea: la reserva sale, y el operador puede completarla cuando quiera.
  if (p?.direccion && !direccionVacia(p.direccion)) {
    validarDireccion(p.direccion, `${campo}.direccion`, errores);
  }

  const telefono = texto(p?.telefono);
  const telefono2 = texto(p?.telefono2);
  const correo = texto(p?.correo);
  if (!telefono && !telefono2 && !correo) {
    errores.push(
      error(`${campo}.contacto`, 'Es obligatorio informar teléfono, teléfono2 o correo de la persona', '10131')
    );
  }
  if (telefono && telefono.length > LONGITUDES.telefono) {
    errores.push(error(`${campo}.telefono`, 'El teléfono no puede superar 20 caracteres', '10130'));
  }
  if (telefono2 && telefono2.length > LONGITUDES.telefono) {
    errores.push(error(`${campo}.telefono2`, 'El segundo teléfono no puede superar 20 caracteres', '10130'));
  }
  if (correo) {
    if (correo.length > LONGITUDES.correo) {
      errores.push(error(`${campo}.correo`, 'El correo no puede superar 250 caracteres', '10130'));
    } else if (!RE_CORREO.test(correo)) {
      errores.push(error(`${campo}.correo`, 'El correo no tiene un formato de dirección válido', '10130'));
    }
  }
}

/**
 * Valida una reserva de hospedaje contra las reglas del apartado 3.1.1.2.
 *
 * Dos reglas propias de este tipo de comunicación:
 *  - Hace falta **el código del establecimiento o sus datos** (`datosEstablecimiento`),
 *    con su tipo del catálogo, su nombre y su dirección.
 *  - Debe haber **un titular del contrato** (`TI`); los demás son viajeros (`VI`).
 */
export function validarReservaHospedaje(reserva: ReservaHospedajeMIR): ValidacionMIR {
  const errores: ErrorValidacionMIR[] = [];
  const avisos: string[] = [];

  const establecimiento = reserva?.establecimiento;
  const codigo = texto(establecimiento?.codigo);
  const datos = establecimiento?.datosEstablecimiento ?? null;
  if (!codigo && !datos) {
    errores.push(
      error(
        'establecimiento',
        'Hay que informar el código del establecimiento (o sus datos si no se dispone del código)',
        '10131'
      )
    );
  }
  if (codigo && codigo.length > LONGITUDES.codigoEstablecimiento) {
    errores.push(error('establecimiento.codigo', 'El código de establecimiento no puede superar 10 caracteres', '10130'));
  }
  if (datos) {
    requerido(errores, datos.tipo, 'establecimiento.datosEstablecimiento.tipo', LONGITUDES.tipoDocumento);
    requerido(errores, datos.nombre, 'establecimiento.datosEstablecimiento.nombre', LONGITUDES.nombre);
    validarDireccion(datos.direccion, 'establecimiento.datosEstablecimiento.direccion', errores);
  }

  validarContrato(reserva?.contrato, 'contrato', errores);

  const personas = Array.isArray(reserva?.personas) ? reserva.personas : [];
  if (personas.length === 0) {
    errores.push(error('persona', 'Una reserva de hospedaje debe incluir al menos una persona', '10131'));
  }
  const titulares = personas.filter((p) => texto(p?.rol) === ROL_PERSONA.titular);
  if (personas.length > 0 && titulares.length === 0) {
    errores.push(
      error('persona', "La reserva debe incluir el titular del contrato con rol 'TI'", '10131')
    );
  }
  personas.forEach((p, i) => validarPersonaReserva(p, `persona[${i}]`, errores));

  const numPersonas = Number(reserva?.contrato?.numPersonas);
  if (Number.isFinite(numPersonas) && personas.length > 0 && numPersonas !== personas.length) {
    avisos.push(`numPersonas (${numPersonas}) no coincide con las personas informadas (${personas.length})`);
  }

  return { errores, avisos };
}

function xmlEstablecimiento(e: EstablecimientoMIR, sangria: string): string {
  const codigo = texto(e?.codigo);
  const datos = e?.datosEstablecimiento ?? null;
  return bloques([
    `${sangria}<establecimiento>`,
    codigo ? nodo('codigo', codigo, `${sangria}  `) : null,
    datos
      ? bloques([
          `${sangria}  <datosEstablecimiento>`,
          nodo('tipo', datos.tipo, `${sangria}    `),
          nodo('nombre', datos.nombre, `${sangria}    `),
          datos.direccion ? xmlDireccion(datos.direccion, `${sangria}    `) : null,
          `${sangria}  </datosEstablecimiento>`,
        ])
      : null,
    `${sangria}</establecimiento>`,
  ]);
}

/** Persona de una reserva: sin `soporteDocumento` ni `parentesco` (no existen en este XSD). */
function xmlPersonaReserva(p: PersonaMIR, sangria: string): string {
  return bloques([
    `${sangria}<persona>`,
    nodo('rol', texto(p.rol), `${sangria}  `),
    nodo('nombre', p.nombre, `${sangria}  `),
    nodo('apellido1', p.apellido1, `${sangria}  `),
    nodo('apellido2', p.apellido2, `${sangria}  `),
    nodo('tipoDocumento', p.tipoDocumento, `${sangria}  `),
    nodo('numeroDocumento', p.numeroDocumento, `${sangria}  `),
    nodo('fechaNacimiento', p.fechaNacimiento, `${sangria}  `),
    nodo('nacionalidad', p.nacionalidad, `${sangria}  `),
    nodo('sexo', p.sexo, `${sangria}  `),
    p.direccion ? xmlDireccion(p.direccion, `${sangria}  `) : null,
    nodo('telefono', p.telefono, `${sangria}  `),
    nodo('telefono2', p.telefono2, `${sangria}  `),
    nodo('correo', p.correo, `${sangria}  `),
    `${sangria}</persona>`,
  ]);
}

/**
 * XML de alta de reservas de hospedaje (operación `A`, tipo `RH`).
 *
 * El `namespace` se recibe como parámetro (no hay valor por defecto) porque es
 * el único dato del contrato que no está disponible en fuentes oficiales: ver
 * `NS_ALTA_RESERVA`. En producción se obtiene con
 * `namespaceAltaReservaHospedaje()`, que falla mientras no se haya copiado del
 * XSD oficial; en los tests se pasa un valor de ejemplo para fijar el XML.
 */
export function construirXmlAltaReservaHospedaje(input: {
  namespace: string;
  reservas: ReservaHospedajeMIR[];
}): string {
  const comunicaciones = input.reservas
    .map((reserva) =>
      bloques([
        '    <comunicacion>',
        reserva.establecimiento ? xmlEstablecimiento(reserva.establecimiento, '      ') : null,
        reserva.contrato ? xmlContrato(reserva.contrato, '      ') : null,
        ...(Array.isArray(reserva.personas)
          ? reserva.personas.map((p) => xmlPersonaReserva(p, '      '))
          : []),
        '    </comunicacion>',
      ])
    )
    .join('\n');

  return bloques([
    `<alt:peticion xmlns:alt="${escaparXml(input.namespace)}">`,
    '  <solicitud>',
    comunicaciones || null,
    '  </solicitud>',
    '</alt:peticion>',
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Empaquetado ZIP + Base64 (apartado 2: «comprimido y codificado»)
// ────────────────────────────────────────────────────────────────────────────

/** Tabla CRC-32 (la exige el contenedor ZIP). Se calcula una sola vez. */
const TABLA_CRC32 = (() => {
  const tabla = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

export function crc32(datos: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < datos.length; i++) {
    crc = TABLA_CRC32[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Crea un fichero ZIP real (un único fichero, deflate) con el XML de la
 * solicitud. La especificación exige ZIP, no deflate suelto: el servicio
 * descomprime el Base64 esperando un contenedor.
 *
 * La marca temporal del ZIP se fija en 1980-01-01 (mínimo válido): así el
 * paquete es determinista y los tests pueden compararlo byte a byte.
 */
export function crearZip(nombreFichero: string, contenido: string | Buffer): Buffer {
  const nombre = Buffer.from(nombreFichero, 'utf8');
  const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
  const comprimido = deflateRawSync(datos);
  const crc = crc32(datos);
  const horaDos = 0;
  const fechaDos = 0x21; // 1980-01-01

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // versión necesaria
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // método: deflate
  local.writeUInt16LE(horaDos, 10);
  local.writeUInt16LE(fechaDos, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comprimido.length, 18);
  local.writeUInt32LE(datos.length, 22);
  local.writeUInt16LE(nombre.length, 26);
  local.writeUInt16LE(0, 28); // extra

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // versión que lo creó
  central.writeUInt16LE(20, 6); // versión necesaria
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(8, 10); // método
  central.writeUInt16LE(horaDos, 12);
  central.writeUInt16LE(fechaDos, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comprimido.length, 20);
  central.writeUInt32LE(datos.length, 24);
  central.writeUInt16LE(nombre.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comentario
  central.writeUInt16LE(0, 34); // disco
  central.writeUInt16LE(0, 36); // atributos internos
  central.writeUInt32LE(0, 38); // atributos externos
  central.writeUInt32LE(0, 42); // desplazamiento del registro local

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(1, 8); // entradas en este disco
  fin.writeUInt16LE(1, 10); // entradas totales
  fin.writeUInt32LE(central.length + nombre.length, 12);
  fin.writeUInt32LE(local.length + nombre.length + comprimido.length, 16);
  fin.writeUInt16LE(0, 20); // comentario

  return Buffer.concat([local, nombre, comprimido, central, nombre, fin]);
}

/** Empaqueta el XML en ZIP y lo codifica en Base64, como exige el servicio. */
export function empaquetarSolicitud(
  xml: string,
  nombreFichero: string = NOMBRE_FICHERO_SOLICITUD
): string {
  return crearZip(nombreFichero, xml).toString('base64');
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Sobre SOAP (apartado 3.1 y Anexo I)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construye el `comunicacionRequest` del servicio oficial. El `solicitud` va
 * ya comprimido y en Base64; la cabecera lleva arrendador, aplicación y tipo de
 * operación (y el tipo de comunicación solo en el alta).
 */
export function construirSobreSoap(cabecera: CabeceraMIR, solicitudBase64: string): string {
  const operacion = texto(cabecera.tipoOperacion).toUpperCase();
  return bloques([
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:com="${NS_COMUNICACION}">`,
    '  <soapenv:Header/>',
    '  <soapenv:Body>',
    '    <com:comunicacionRequest>',
    '      <peticion>',
    '        <cabecera>',
    `          <codigoArrendador>${escaparXml(cabecera.codigoArrendador)}</codigoArrendador>`,
    `          <aplicacion>${escaparXml(cabecera.aplicacion)}</aplicacion>`,
    `          <tipoOperacion>${escaparXml(operacion)}</tipoOperacion>`,
    operacion === TIPO_OPERACION.alta
      ? `          <tipoComunicacion>${escaparXml(texto(cabecera.tipoComunicacion).toUpperCase())}</tipoComunicacion>`
      : null,
    '        </cabecera>',
    `        <solicitud>${solicitudBase64}</solicitud>`,
    '      </peticion>',
    '    </com:comunicacionRequest>',
    '  </soapenv:Body>',
    '</soapenv:Envelope>',
  ]);
}

/** ¿La respuesta trae un `soap:Fault`? (error de transporte, no del contrato). */
export function tieneFaultSoap(xml: string): boolean {
  return /<(?:[\w.-]+:)?Fault\b/i.test(xml || '');
}

// ────────────────────────────────────────────────────────────────────────────
// 9. Lectura de la respuesta (apartado 3.1.2)
// ────────────────────────────────────────────────────────────────────────────

/** Extrae el contenido de la primera etiqueta con ese nombre local. */
function etiqueta(xml: string, nombre: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombre}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`, 'i');
  const m = re.exec(xml || '');
  return m ? m[1].trim() : null;
}

/** Extrae todos los bloques con ese nombre local. */
function bloquesDe(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombre}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${nombre}>`, 'gi');
  const salida: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml || '')) !== null) salida.push(m[1]);
  return salida;
}

/**
 * Bloques `resultadoComunicacion` en orden de documento.
 * El Anexo II del documento oficial los rotula «resutadoComunicacion» (sin la
 * letra intermedia): el servicio devuelve una de las dos grafías y el cliente
 * no puede elegir, así que se aceptan ambas.
 */
function bloquesComunicacion(bloque: string): string[] {
  const re = /<(?:[\w.-]+:)?res(?:ul|u)tadoComunicacion\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?res(?:ul|u)tadoComunicacion>/gi;
  const salida: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque || '')) !== null) salida.push(m[1]);
  return salida;
}

/**
 * ¿El cuerpo es una respuesta legible del servicio?
 *
 * `leerRespuestaMIR` devuelve SIEMPRE un objeto: con un cuerpo que no es SOAP
 * (un `503 Service Unavailable` en texto plano, una página de proxy, un cuerpo
 * vacío) devuelve todos los campos a `null`, que es un objeto verdadero. Esa
 * verdad a medias es la que hacía que una caída del servicio se guardara como
 * «rechazada» y que el hotel leyera «el Ministerio rechazó este parte» con los
 * datos perfectos. Una respuesta de verdad trae código, descripción, lote o
 * resultados; si no trae nada de eso, no hubo respuesta.
 *
 * Un `Fault` de SOAP tampoco cuenta: el servicio contesta que no pudo atender
 * la petición, pero no decide nada sobre esta comunicación, así que no se puede
 * presentar como un rechazo del parte.
 */
export function esRespuestaMIR(respuesta: RespuestaMIR | null | undefined): boolean {
  if (!respuesta) return false;
  return Boolean(
    respuesta.codigo ||
      respuesta.descripcion ||
      respuesta.lote ||
      (respuesta.resultados?.length ?? 0) > 0
  );
}

/**
 * Interpreta la respuesta del servicio.
 *
 * Ojo con un detalle del propio documento oficial: la tabla y un ejemplo del
 * Anexo I llaman al código `codigo`/`codigoRetorno` indistintamente. Aquí se
 * aceptan los dos para no depender de cuál devuelva el entorno.
 */
export function leerRespuestaMIR(xml: string): RespuestaMIR {
  const codigo = etiqueta(xml, 'codigo') ?? etiqueta(xml, 'codigoRetorno');
  const respuesta: RespuestaMIR = {
    codigo,
    descripcion: etiqueta(xml, 'descripcion'),
    lote: etiqueta(xml, 'lote'),
    resultados: [],
  };

  for (const bloque of bloquesDe(xml, 'resultado')) {
    // El Anexo II escribe «resutadoComunicacion» (sic): se aceptan las dos
    // grafías en una sola pasada para conservar el ORDEN del documento (que es
    // el `orden` de cada comunicación en la petición).
    const comunicaciones = bloquesComunicacion(bloque).map((c) => {
      const orden = etiqueta(c, 'orden');
      return {
        orden: orden && /^\d+$/.test(orden) ? Number(orden) : null,
        codigoComunicacion: etiqueta(c, 'codigoComunicacion'),
        anulada: (etiqueta(c, 'anulada') ?? '').toLowerCase() === 'true',
        tipoError: etiqueta(c, 'tipoError'),
        error: etiqueta(c, 'error'),
      };
    });

    respuesta.resultados.push({
      lote: etiqueta(bloque, 'lote'),
      tipoComunicacion: etiqueta(bloque, 'tipoComunicacion') ?? etiqueta(bloque, 'tipoComuniacion'),
      tipoOperacion: etiqueta(bloque, 'tipoOperacion'),
      codigoEstado: etiqueta(bloque, 'codigoEstado'),
      descEstado: etiqueta(bloque, 'descEstado'),
      comunicaciones,
    });
  }

  if (!respuesta.lote && respuesta.resultados.length > 0) {
    respuesta.lote = respuesta.resultados[0].lote;
  }

  return respuesta;
}

/** Descripción del estado de un lote consultado. */
export function describirEstadoLote(codigoEstado: string | null | undefined): string {
  const clave = texto(codigoEstado);
  return ESTADOS_LOTE[clave] ?? (clave ? `Estado no documentado (${clave})` : 'Sin estado informado');
}
