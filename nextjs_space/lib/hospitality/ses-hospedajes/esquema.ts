/**
 * El esquema del mensaje: interface v3.0.0 de SES.HOSPEDAJES (Ministerio del Interior).
 *
 * De dónde sale esto. Del contrato oficial del servicio web: el WSDL
 * `comunicacion.wsdl` define el sobre SOAP y la respuesta, y los XSD de alta
 * (`altaReservaHospedaje`, `altaParteHospedaje`, `anularComunicacion` y
 * `tiposGenerales`) fijan los cuerpos, los catálogos (roles TI/VI/CP/CS, tipos de
 * pago, países ISO 3166-1 alfa-3) y qué elemento es obligatorio. Nada aquí se
 * inventa: si un campo no está en el XSD, no existe.
 *
 * Cómo viaja. El servicio es SOAP 1.1 document/literal con una única operación:
 * `com:comunicacionRequest`, con una cabecera de lote (código de arrendador,
 * aplicación, tipo de operación A/C/B y tipo de comunicación RH/PV) y una
 * `solicitud` que es el XML del alta **comprimido en ZIP y codificado en Base64**
 * (el empaquetado vive en `zip.ts`). El Ministerio responde `comunicacionResponse`
 * con un estado de lote y resultados por comunicación.
 *
 * Dato pequeño pero real: el XSD oficial llama a los resultados
 * `resutadoComunicacion` (sic, sin la «l»). El lector acepta ese nodo y su
 * variante correcta, porque el día que el Ministerio arregle la errata el
 * integrador no puede dejar de leer su respuesta.
 */

import { parseStringPromise } from 'xml2js';

/** El namespace SOAP 1.1, tal cual lo pide el binding del WSDL. */
export const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
/** El namespace del servicio de comunicación del Ministerio. */
export const NS_COMUNICACION = 'http://www.soap.servicios.hospedajes.mir.es/comunicacion';
/** Namespaces de los tres esquemas de alta. */
export const NS_ALTA_RESERVA = 'http://www.neg.hospedajes.mir.es/altaReservaHospedaje';
export const NS_ALTA_PARTE = 'http://www.neg.hospedajes.mir.es/altaParteHospedaje';
export const NS_ANULAR = 'http://www.neg.hospedajes.mir.es/anularComunicacion';

/** Roles del XSD: titular de la reserva, viajero, contratante, acompañante. */
export const ROLES = ['TI', 'VI', 'CP', 'CS'] as const;
export type RolPersona = (typeof ROLES)[number];

/** Tipos de operación del XSD: alta, consulta, anulación. */
export type OperacionSes = 'A' | 'C' | 'B';
/** Tipos de comunicación del XSD: reserva de hospedaje, parte de viajeros. */
export type ComunicacionSes = 'RH' | 'PV';

/** Catálogo de tipos de pago documentado en el XSD del contrato. */
export const TIPOS_PAGO = ['DESTI', 'EFECT', 'TARJT', 'PLATF', 'TRANS', 'MOVIL', 'TREG', 'OTRO'] as const;
export type TipoPago = (typeof TIPOS_PAGO)[number];

/** Límites del XSD que conviene respetar antes de que los rechacen. */
export const LIMITES = {
  codigoArrendador: 10,
  aplicacion: 50,
  establecimiento: 10,
  referencia: 50,
  nombre: 50,
  apellido: 50,
  numeroDocumento: 15,
  soporteDocumento: 9,
  telefono: 20,
  correo: 50,
  direccion: 100,
  municipio: 100,
  codigoPostal: 20,
} as const;

// ─── Datos que componen una comunicación ────────────────────────────────────

/** La dirección que exigen los XSD (una por persona; obligatoria en el parte). */
export interface DireccionSes {
  direccion: string;
  direccionComplementaria?: string | null;
  /** Código INE de 5 dígitos (obligatorio si el país es España). */
  codigoMunicipio?: string | null;
  /** Nombre del municipio (obligatorio si el país no es España). */
  nombreMunicipio?: string | null;
  codigoPostal: string;
  /** ISO 3166-1 alfa-3: ESP, FRA… */
  pais: string;
}

export interface PersonaSes {
  rol: RolPersona;
  nombre: string;
  apellido1: string;
  apellido2?: string | null;
  /** DNI/NIE/PAS/OTRO/CIF según catálogo del manual. */
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  soporteDocumento?: string | null;
  fechaNacimiento: string;
  nacionalidad?: string | null;
  sexo?: string | null;
  /** Obligatoria en el parte de viajeros; en la reserva es opcional. */
  direccion?: DireccionSes | null;
  telefono?: string | null;
  telefono2?: string | null;
  correo?: string | null;
  parentesco?: string | null;
}

export interface ContratoSes {
  referencia: string;
  /** Fecha del contrato (formato fecha). */
  fechaContrato: string;
  /** Entrada y salida con hora (formato dateTime). */
  fechaEntrada: string;
  fechaSalida: string;
  numPersonas: number;
  numHabitaciones?: number | null;
  internet?: boolean | null;
  pago: PagoSes;
}

export interface PagoSes {
  tipoPago: TipoPago;
  fechaPago?: string | null;
  medioPago?: string | null;
  titular?: string | null;
  fechaCaducidadTarjeta?: string | null;
}

/** Un establecimiento: su código oficial (lo da el alta de la entidad) o sus datos. */
export interface EstablecimientoSes {
  /** Código oficial del establecimiento, como llega en el documento de alta. */
  codigo?: string | null;
  datosEstablecimiento?: {
    tipo: string;
    nombre: string;
    direccion: DireccionSes;
  } | null;
}

export interface ComunicacionReserva {
  establecimiento: EstablecimientoSes;
  contrato: ContratoSes;
  personas: PersonaSes[];
}

export interface ComunicacionParte {
  /** Código del establecimiento: el parte lo exige a nivel de solicitud. */
  codigoEstablecimiento: string;
  comunicaciones: {
    contrato: ContratoSes;
    personas: PersonaSes[];
  }[];
}

/** Los códigos de comunicación a anular, tal como los pide el XSD de anulación. */
export interface SolicitudAnulacion {
  codigos: string[];
}

export interface CabeceraSes {
  /** Código de arrendador de la entidad (lo da el registro ante el Ministerio). */
  codigoArrendador: string;
  /** Nombre de la aplicación que comunica; se recomienda identificar el software. */
  aplicacion: string;
}

// ─── Utilidades de construcción ─────────────────────────────────────────────

/** Escapa el texto para que viaje dentro de un nodo XML. */
export function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // La comilla simple no se escapa: dentro de contenido de nodo es literal y
  // el Ministerio no la rechaza; escaparla ensuciaría nombres como O'Brien.
}

const limpiar = (valor: string | null | undefined): string =>
  (valor ?? '').replace(/\s+/g, ' ').trim();

/**
 * Recorta un campo a la longitud que admite el XSD.
 *
 * El Ministerio rechaza un campo que sobra, y una referencia de 51 letras no
 * merece rechazar un parte entero: se recorta, se respeta el significado y viaja.
 */
const recortar = (valor: string | null | undefined, longitud: number): string =>
  limpiar(valor).slice(0, longitud);

const texto = (etiqueta: string, valor: string | null | undefined, longitud?: number): string => {
  const limpio = longitud ? recortar(valor, longitud) : limpiar(valor);
  return limpio ? `<${etiqueta}>${escaparXml(limpio)}</${etiqueta}>` : '';
};

const opcional = (etiqueta: string, valor: string | null | undefined, longitud?: number): string =>
  limpiar(valor) ? texto(etiqueta, valor, longitud) : '';

/** Formatea una fecha para los nodos `xsd:date` (solo el día, sin hora). */
export function aFechaSes(valor: Date | string): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) throw new Error(`Fecha inválida: ${String(valor)}`);
  return fecha.toISOString().slice(0, 10);
}

/** Formatea una fecha y hora para los nodos `xsd:dateTime` del contrato. */
export function aFechaHoraSes(valor: Date | string): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) throw new Error(`Fecha inválida: ${String(valor)}`);
  // El XSD pide dateTime; la hora local del alojamiento es la que importa, así
  // que se envía sin desplazamiento (00:00 de la medianoche del día que toca).
  return `${fecha.toISOString().slice(0, 10)}T${fecha.toISOString().slice(11, 19)}`;
}

/** `siNoType` del XSD: el booleano del esquema, tal cual. */
const siNo = (valor: boolean | null | undefined): string =>
  valor == null ? '' : `<internet>${valor ? 'true' : 'false'}</internet>`;

/** La dirección del XSD `tiposGenerales`. */
export function construirDireccion(direccion: DireccionSes): string {
  const esEspana = limpiar(direccion.pais).toUpperCase() === 'ESP';
  const municipio = esEspana
    ? texto('codigoMunicipio', direccion.codigoMunicipio)
    : texto('nombreMunicipio', direccion.nombreMunicipio);
  return [
    texto('direccion', direccion.direccion, LIMITES.direccion),
    opcional('direccionComplementaria', direccion.direccionComplementaria, LIMITES.direccion),
    municipio,
    texto('codigoPostal', direccion.codigoPostal, LIMITES.codigoPostal),
    texto('pais', direccion.pais),
  ]
    .filter(Boolean)
    .join('');
}

/** El pago del contrato, con su catálogo de tipos. */
export function construirPago(pago: PagoSes): string {
  return [
    `<tipoPago>${escaparXml(limpiar(pago.tipoPago))}</tipoPago>`,
    opcional('fechaPago', pago.fechaPago),
    opcional('medioPago', pago.medioPago, LIMITES.nombre),
    opcional('titular', pago.titular, LIMITES.direccion),
    opcional('fechaCaducidadTarjeta', pago.fechaCaducidadTarjeta),
  ]
    .filter(Boolean)
    .join('');
}

/** El contrato de hospedaje (`contratoHospedajeType` del XSD). */
export function construirContrato(contrato: ContratoSes): string {
  const habitaciones =
    contrato.numHabitaciones != null
      ? `<numHabitaciones>${Math.trunc(contrato.numHabitaciones)}</numHabitaciones>`
      : '';
  return [
    texto('referencia', contrato.referencia, LIMITES.referencia),
    texto('fechaContrato', contrato.fechaContrato),
    texto('fechaEntrada', contrato.fechaEntrada),
    texto('fechaSalida', contrato.fechaSalida),
    `<numPersonas>${Math.trunc(contrato.numPersonas)}</numPersonas>`,
    habitaciones,
    siNo(contrato.internet),
    `<pago>${construirPago(contrato.pago)}</pago>`,
  ].join('');
}

/** La persona, según su rol y con sus campos del XSD. */
export function construirPersona(persona: PersonaSes, conDireccion: boolean): string {
  const documento = [
    opcional('tipoDocumento', persona.tipoDocumento, LIMITES.codigoArrendador),
    opcional('numeroDocumento', persona.numeroDocumento, LIMITES.numeroDocumento),
    opcional('soporteDocumento', persona.soporteDocumento, LIMITES.soporteDocumento),
  ]
    .filter(Boolean)
    .join('');

  const extras = [
    opcional('nacionalidad', persona.nacionalidad),
    opcional('sexo', persona.sexo, LIMITES.codigoArrendador),
  ]
    .filter(Boolean)
    .join('');

  const contacto = [
    conDireccion && persona.direccion ? `<direccion>${construirDireccion(persona.direccion)}</direccion>` : '',
    opcional('telefono', persona.telefono, LIMITES.telefono),
    opcional('telefono2', persona.telefono2, LIMITES.telefono),
    opcional('correo', persona.correo, LIMITES.correo),
  ]
    .filter(Boolean)
    .join('');

  return [
    `<rol>${escaparXml(limpiar(persona.rol))}</rol>`,
    texto('nombre', persona.nombre, LIMITES.nombre),
    texto('apellido1', persona.apellido1, LIMITES.nombre),
    opcional('apellido2', persona.apellido2, LIMITES.nombre),
    documento,
    texto('fechaNacimiento', persona.fechaNacimiento),
    extras,
    contacto,
    opcional('parentesco', persona.parentesco, LIMITES.codigoArrendador),
  ].join('');
}

// ─── Los tres cuerpos del contrato ──────────────────────────────────────────

/**
 * RH — alta de reserva de hospedaje (`altaReservaHospedaje.xsd`).
 *
 * El establecimiento va por comunicación (código o datos), el contrato y **todas**
 * las personas de la reserva (titular y viajeros declarados) van dentro.
 */
export function construirXmlReserva(comunicacion: ComunicacionReserva): string {
  const establecimiento = comunicacion.establecimiento.codigo
    ? `<codigo>${escaparXml(limpiar(comunicacion.establecimiento.codigo).slice(0, LIMITES.establecimiento))}</codigo>`
    : comunicacion.establecimiento.datosEstablecimiento
      ? `<datosEstablecimiento>${[
          texto('tipo', comunicacion.establecimiento.datosEstablecimiento.tipo),
          texto('nombre', comunicacion.establecimiento.datosEstablecimiento.nombre, LIMITES.nombre),
          `<direccion>${construirDireccion(comunicacion.establecimiento.datosEstablecimiento.direccion)}</direccion>`,
        ].join('')}</datosEstablecimiento>`
      : '';

  const personas = comunicacion.personas
    .map((persona) => `<persona>${construirPersona(persona, false)}</persona>`)
    .join('');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<peticion xmlns="${NS_ALTA_RESERVA}">`,
    `<solicitud>`,
    `<comunicacion>`,
    `<establecimiento>${establecimiento}</establecimiento>`,
    `<contrato>${construirContrato(comunicacion.contrato)}</contrato>`,
    personas,
    `</comunicacion>`,
    `</solicitud>`,
    `</peticion>`,
  ].join('');
}

/**
 * PV — alta de parte de hospedaje (`altaParteHospedaje.xsd`).
 *
 * Aquí el código de establecimiento va a nivel de solicitud y cada comunicación
 * lleva su contrato con sus personas (titular + viajeros), **con dirección**:
 * el parte es el que informa dónde vive cada persona.
 */
export function construirXmlParte(solicitud: ComunicacionParte): string {
  const comunicaciones = solicitud.comunicaciones
    .map(
      (comunicacion) =>
        `<comunicacion>` +
        `<contrato>${construirContrato(comunicacion.contrato)}</contrato>` +
        comunicacion.personas.map((persona) => `<persona>${construirPersona(persona, true)}</persona>`).join('') +
        `</comunicacion>`
    )
    .join('');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<peticion xmlns="${NS_ALTA_PARTE}">`,
    `<solicitud>`,
    `<codigoEstablecimiento>${escaparXml(
      limpiar(solicitud.codigoEstablecimiento).slice(0, LIMITES.establecimiento)
    )}</codigoEstablecimiento>`,
    comunicaciones,
    `</solicitud>`,
    `</peticion>`,
  ].join('');
}

/**
 * Anulación (`anularComunicacion.xsd`): los códigos que el Ministerio devolvió
 * en el alta y que ahora se retiran.
 */
export function construirXmlAnulacion(codigos: string[]): string {
  const limpios = codigos.map((codigo) => limpiar(codigo).slice(0, 36)).filter(Boolean);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<comunicaciones xmlns="${NS_ANULAR}">`,
    limpios.map((codigo) => `<codigoComunicacion>${escaparXml(codigo)}</codigoComunicacion>`).join(''),
    `</comunicaciones>`,
  ].join('');
}

// ─── El sobre SOAP ──────────────────────────────────────────────────────────

/** Lo que va en la cabecera del lote: quién comunica y qué comunica. */
export interface CabeceraLote {
  codigoArrendador: string;
  aplicacion: string;
  /** A = alta, B = anulación (la consulta, C, no se usa todavía). */
  tipoOperacion: OperacionSes;
  tipoComunicacion: ComunicacionSes;
}

/**
 * El sobre SOAP 1.1 de la operación `comunicacion` del WSDL.
 *
 * La `solicitud` viaja ya empaquetada (ZIP + Base64) dentro del elemento: no es
 * texto libre, es el contenido del XSD del tipo `solicitudType`.
 */
export function construirSobreSoap(
  cabecera: CabeceraLote,
  solicitudEmpaquetada: string
): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soapenv:Envelope xmlns:soapenv="${SOAP_NS}" xmlns:com="${NS_COMUNICACION}">`,
    `<soapenv:Header/>`,
    `<soapenv:Body>`,
    `<com:comunicacionRequest>`,
    `<peticion>`,
    `<cabecera>`,
    `<codigoArrendador>${escaparXml(limpiar(cabecera.codigoArrendador).slice(0, LIMITES.codigoArrendador))}</codigoArrendador>`,
    `<aplicacion>${escaparXml(limpiar(cabecera.aplicacion).slice(0, LIMITES.aplicacion))}</aplicacion>`,
    `<tipoOperacion>${cabecera.tipoOperacion}</tipoOperacion>`,
    `<tipoComunicacion>${cabecera.tipoComunicacion}</tipoComunicacion>`,
    `</cabecera>`,
    `<solicitud>${solicitudEmpaquetada}</solicitud>`,
    `</peticion>`,
    `</com:comunicacionRequest>`,
    `</soapenv:Body>`,
    `</soapenv:Envelope>`,
  ].join('');
}

// ─── Lectura de la respuesta ────────────────────────────────────────────────

/** El estado de una comunicación individual dentro del lote. */
export interface ResultadoComunicacion {
  /** La posición dentro del lote, tal como la numera el Ministerio. */
  orden: number;
  /** El código que el Ministerio asignó (lo que luego se puede anular). */
  codigoComunicacion: string | null;
  tipoError: string | null;
  error: string | null;
}

/** La respuesta completa de la operación `comunicacion`. */
export interface RespuestaLote {
  /** ¿Procesó el lote sin errores generales? */
  ok: boolean;
  /** Código de estado del lote (0 = procesado, el resto es lo que hay que leer). */
  codigo: number | null;
  descripcion: string;
  /** Identificador del lote, para trazabilidad. */
  lote: string | null;
  resultados: ResultadoComunicacion[];
  /** El cuerpo tal cual llegó, para la bitácora y el diagnóstico. */
  cuerpo: string;
}

/** Extrae de un nodo xml2js (u objeto) su valor de texto, si lo tiene. */
function valorTexto(nodo: unknown): string | null {
  if (nodo == null) return null;
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (typeof nodo === 'object') {
    const guion = (nodo as Record<string, unknown>)['_'];
    if (typeof guion === 'string') return guion;
    if (typeof (nodo as Record<string, unknown>).toString === 'function' && !(nodo instanceof Array)) {
      const texto = String(nodo);
      return texto === '[object Object]' ? null : texto;
    }
  }
  return null;
}

/** Normaliza un elemento xml2js (puede venir como objeto, array o ausente). */
function comoArray<T>(valor: unknown): T[] {
  if (valor == null) return [];
  return (Array.isArray(valor) ? valor : [valor]) as T[];
}

/** Lee un número entero que el Ministerio puede mandar como texto. */
function comoNumero(valor: unknown): number | null {
  const texto = valorTexto(valor);
  if (texto == null || texto.trim() === '') return null;
  const numero = Number.parseInt(texto.trim(), 10);
  return Number.isNaN(numero) ? null : numero;
}

/**
 * Lee la respuesta del Ministerio.
 *
 * La forma la fija el WSDL: un `respuesta` con el estado del lote (código,
 * descripción e identificador) y cero o más `resultado` —uno por lote de la
 * petición—, cada uno con su `codigoEstado` y sus resultados individuales en
 * `resultadoComunicaciones > resutadoComunicacion` (sic: el XSD oficial lleva la
 * errata; también se acepta la grafía correcta). Cada resultado individual lleva
 * su `orden` y el par exclusivo del XSD: o `codigoComunicacion` (aceptada) o
 * `tipoError` + `error` (rechazada).
 *
 * Lanza un error tipado si el cuerpo no es un `comunicacionResponse`: un HTML de
 * error o un sobre vacío no es una respuesta, y tratarlo como «procesado» sería
 * exactamente el error que este módulo existe para evitar.
 */
export async function leerRespuestaLote(cuerpo: string): Promise<RespuestaLote> {
  const procesado = await parseStringPromise(cuerpo, {
    explicitArray: false,
    explicitCharkey: false,
    trim: true,
  });

  const envelope = procesado?.['soapenv:Envelope'] ?? procesado?.Envelope ?? procesado;
  const body = envelope?.['soapenv:Body'] ?? envelope?.Body;
  const respuesta = body?.['com:comunicacionResponse'] ?? body?.comunicacionResponse;

  if (!respuesta) {
    throw new RespuestaNoValidaError(cuerpo);
  }

  const estado = respuesta.respuesta ?? {};
  const codigoEstado = comoNumero(estado.codigo);

  // Cada `resultado` es el estado de un lote; sus comunicaciones, lo que nos
  // interesa: qué código se asignó a cada una o qué error recibió.
  const lotes = comoArray<Record<string, unknown>>(respuesta.resultado);
  const resultados: ResultadoComunicacion[] = [];

  for (const lote of lotes) {
    const contenedor = (lote.resultadoComunicaciones ?? {}) as Record<string, unknown>;
    // El XSD oficial lleva la errata «resutadoComunicacion»; también se acepta
    // la grafía correcta por si el Ministerio la corrige algún día.
    const individuales = comoArray<Record<string, unknown>>(
      contenedor.resutadoComunicacion ?? contenedor.resultadoComunicacion
    );

    if (individuales.length === 0) {
      // El lote completo falló antes de mirar comunicaciones (p. ej. cabecera
      // inválida): su descEstado es el único diagnóstico disponible.
      const codigoLote = comoNumero(lote.codigoEstado);
      if (codigoLote != null && codigoLote !== 0) {
        resultados.push({
          orden: 0,
          codigoComunicacion: null,
          tipoError: String(codigoLote),
          error: valorTexto(lote.descEstado) ?? '',
        });
      }
      continue;
    }

    individuales.forEach((individual, indice) => {
      resultados.push({
        orden: comoNumero(individual.orden) ?? indice,
        codigoComunicacion: valorTexto(individual.codigoComunicacion),
        tipoError: valorTexto(individual.tipoError),
        error: valorTexto(individual.error),
      });
    });
  }

  // El XSD permite un lote aceptado sin ningún resultado individual (todos los
  // partes correctos), así que el éxito es exactamente ese: lote procesado con
  // código 0 y ningún error por comunicación. Cualquier otra cosa es revisable.
  const hayErrores = resultados.some((r) => r.tipoError != null || r.error != null);

  return {
    ok: codigoEstado === 0 && !hayErrores,
    codigo: codigoEstado,
    descripcion: valorTexto(estado.descripcion) ?? '',
    lote: valorTexto(estado.lote),
    cuerpo,
    resultados,
  };
}

/** La respuesta no era un `comunicacionResponse` del Ministerio. */
export class RespuestaNoValidaError extends Error {
  constructor(cuerpo: string) {
    const corto = cuerpo.length > 200 ? `${cuerpo.slice(0, 200)}…` : cuerpo;
    super(
      `La respuesta del Ministerio no es un resultado de comunicación válido: ${corto || '(vacía)'}`
    );
    this.name = 'RespuestaNoValidaError';
  }
}

// ─── Composición de alto nivel: del negocio al paquete ──────────────────────

/** Los tipos de comunicación que construye el conector, tal como los pide la ruta. */
export type TipoComunicacion = 'reserva' | 'viajeros' | 'anulacion';

/** Qué operación y qué etiqueta corresponden a cada tipo de comunicación. */
export const OPERACION_POR_TIPO: Record<TipoComunicacion, OperacionSes> = {
  reserva: 'A',
  viajeros: 'A',
  anulacion: 'B',
};

export const ETIQUETA_COMUNICACION: Record<TipoComunicacion, ComunicacionSes> = {
  reserva: 'RH',
  viajeros: 'PV',
  anulacion: 'RH',
};
