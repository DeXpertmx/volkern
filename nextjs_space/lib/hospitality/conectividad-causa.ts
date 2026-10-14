/**
 * Causa en palabras de un fallo de conectividad, a partir del último SyncLog
 * fallido (401/403 → credenciales rechazadas; 5xx/timeout → sin respuesta del
 * servicio; otro → error). Módulo puro: sin BD, sin UI, importable desde el
 * servidor (API) y desde el panel (cliente).
 *
 * El diagnóstico lo produce la MISMA regla en los dos sitios: el badge global
 * del panel y la columna de errores de la tabla por propiedad. La información
 * ya existía en `HospitalitySyncLog.httpStatus`/`errorMensaje`; esto solo la
 * nombra — la misma filosofía que las causas de los partes de viajeros
 * («rechazado por el Ministerio» ≠ «sin respuesta del servicio»: se arreglan
 * distinto).
 *
 * Las tres causas que NO son «rotar credenciales» se reconocen por el texto del
 * proveedor: ID de socio deshabilitado (400 «Partner is disabled!»), ID de socio
 * desconocido (403 «partner desconocido») y hotel no concedido a ese ID (403
 * «Access Denied - <hotelCode>», que es lo que responde el proveedor cuando el
 * hotel no está asignado a la cuenta y que durante semanas se leyó como
 * «credenciales rechazadas»).
 */

/** Un SyncLog fallido, reducido a lo que la regla necesita. */
export interface FalloConectividad {
  /** Código HTTP que devolvió el servicio, si la llamada llegó a salir. */
  httpStatus?: number | null;
  /** Mensaje de error guardado (texto del proveedor, error de red…). */
  errorMensaje?: string | null;
  /** Cuándo falló (para mostrar «hace 2 h» junto al diagnóstico). */
  fechaCreacion?: Date | string | null;
}

/**
 * Tipos de SyncLog que representan tráfico con la capa de conectividad
 * (pushes de inventario/tarifas y fetches de reconciliación). La tabla
 * `HospitalitySyncLog` se comparte con los partes de viajeros — un 401 de
 * esos no dice nada de las credenciales de canales —, así que cualquier
 * consulta de diagnóstico debe filtrar por estos tipos.
 */
export const TIPOS_SYNC_CONECTIVIDAD = [
  'inventory',
  'rates',
  'inventory_restrictions',
  'rates_restrictions',
  'reconciliacion',
] as const;

export interface CausaConectividad {
  /** Clave estable para tests y para elegir el estilo del badge. */
  clave:
    | 'credenciales_rechazadas'
    | 'partner_deshabilitado'
    | 'partner_desconocido'
    | 'hotel_sin_concesion'
    | 'sin_respuesta_servicio'
    | 'otro_error';
  /** Lo que se muestra al operador. */
  texto: string;
  /** Qué hacer, en una frase. */
  consejo: string;
}

/**
 * Cómo nombra el proveedor al ID de socio en su respuesta. El contrato
 * documenta los dos textos (docs/hospitality-connectivity-contract.md):
 * `400 {"success":false,"message":"Partner is disabled!"}` cuando el ID existe
 * pero está deshabilitado, y 403 «partner desconocido» cuando el que usamos no
 * es el suyo. Son dos arreglos distintos —hablar con el proveedor o corregir el
 * valor— y ninguno es «rotar credenciales», que es lo que decía el panel antes de
 * distinguirlos.
 */
const INDICIOS_ID_SOCIO_DESHABILITADO = [
  'partner is disabled',
  'partner disabled',
  'partner deshabilitad',
];

const INDICIOS_ID_SOCIO_DESCONOCIDO = [
  'partner desconocido',
  'partner not found',
  'partner unknown',
  'unknown partner',
  'partner invalid',
  'partner inválid',
  'invalid partner',
];

/**
 * Cómo responde el proveedor cuando el hotel NO está concedido al ID de socio.
 * Texto verificado contra el servicio (2026-10-09):
 * `403 {"success":false,"message":"Access Denied - 75fdbbce2e"}` — con el par
 * Basic y el ID de socio correctos. No es un fallo de credenciales: el
 * proveedor contesta eso tanto para el hotel de pruebas retirado
 * (`sandbox-pms`) como para un hotel que aún no ha asignado a la cuenta.
 */
const INDICIOS_HOTEL_SIN_CONCESION = ['access denied', 'not granted', 'no access to'];

/** Motivo del ID de socio que el proveedor nombra en su mensaje, si lo nombra. */
function motivoDelIdSocio(mensaje?: string | null): 'deshabilitado' | 'desconocido' | null {
  if (!mensaje) return null;
  const texto = mensaje.toLowerCase();
  if (INDICIOS_ID_SOCIO_DESHABILITADO.some((indicio) => texto.includes(indicio))) {
    return 'deshabilitado';
  }
  if (INDICIOS_ID_SOCIO_DESCONOCIDO.some((indicio) => texto.includes(indicio))) {
    return 'desconocido';
  }
  return null;
}

/**
 * ¿El mensaje del proveedor dice que el hotel no está concedido a ese ID de
 * socio? Es el `Access Denied - <hotelCode>` del servicio. Se separa de
 * «partner desconocido» porque el arreglo es distinto: aquí el ID de socio es el
 * correcto y lo que falta es la asignación del hotel (y a veces el código de
 * propiedad está mal copiado).
 */
function hotelSinConcesion(mensaje?: string | null): boolean {
  if (!mensaje) return false;
  const texto = mensaje.toLowerCase();
  return INDICIOS_HOTEL_SIN_CONCESION.some((indicio) => texto.includes(indicio));
}

const INDICIOS_RED = [
  'timeout',
  'timed out',
  'aborted',
  'abort',
  'econnrefused',
  'econnreset',
  'enotfound',
  'eai_again',
  'ehostunreach',
  'enetunreach',
  'etimedout',
  'econnaborted',
  'socket hang up',
  'network',
  'fetch failed',
];

function pareceErrorDeRed(mensaje?: string | null): boolean {
  if (!mensaje) return false;
  const texto = mensaje.toLowerCase();
  return INDICIOS_RED.some((indicio) => texto.includes(indicio));
}

/**
 * Deriva la causa del último fallo de conectividad.
 *
 * Regla:
 * - El mensaje del proveedor nombra el ID de socio (deshabilitado o
 *   desconocido) → esa es la causa, aunque el código sea 400 o 403: se arregla
 *   hablando con el proveedor o corrigiendo el valor, no rotando credenciales.
 * - El mensaje dice «Access Denied - <hotelCode>» → «Hotel no concedido a este
 *   ID de socio»: el par Basic y el ID son válidos, lo que falta es la
 *   asignación del hotel. Sigue siendo un 403, pero no de credenciales.
 * - 401/403 → «Credenciales rechazadas»: el servicio respondió y dijo no.
 * - 5xx, o sin HTTP con indicio de red/timeout en el mensaje → «Sin respuesta
 *   del servicio»: el servicio no llegó a contestar con sentido.
 * - Todo lo demás (4xx de datos, error del proveedor sin código…) → «Error»
 *   con el detalle disponible.
 */
export function causaDeFalloConectividad(fallo?: FalloConectividad | null): CausaConectividad {
  if (!fallo) {
    return {
      clave: 'otro_error',
      texto: 'Error',
      consejo: 'Revisa el historial de sincronización para ver el detalle.',
    };
  }

  const status = fallo.httpStatus ?? null;
  const mensaje = fallo.errorMensaje ?? null;

  // El ID de socio, antes que nada: el proveedor lo nombra en el mensaje y ese
  // caso gana al código HTTP (un «Partner is disabled!» llega como 400 y un
  // «partner desconocido» como 403 — sin este paso, el segundo se diagnosticaba
  // como credenciales rechazadas y el consejo mandaba a rotar credenciales).
  const motivoIdSocio = motivoDelIdSocio(mensaje);
  if (motivoIdSocio === 'deshabilitado') {
    return {
      clave: 'partner_deshabilitado',
      texto: 'ID de socio deshabilitado',
      consejo:
        'El servicio reconoce el ID de socio del hotel pero lo tiene deshabilitado: pide que lo habiliten. Mientras tanto, si el hotel está registrado con el ID de la plataforma, quitar el suyo lo devuelve a funcionar.',
    };
  }
  if (motivoIdSocio === 'desconocido') {
    return {
      clave: 'partner_desconocido',
      texto: 'El servicio no reconoce el ID de socio',
      consejo:
        'El ID de socio guardado no es el que el servicio tiene para este hotel: revisa el que te dieron al registrar el hotel, o quítalo para usar el de la plataforma.',
    };
  }

  // Y el hotel sin conceder a ese ID de socio: mismo código 403, otro arreglo
  // (el ID de socio es correcto; falta que el proveedor asigne el hotel).
  if (hotelSinConcesion(mensaje)) {
    return {
      clave: 'hotel_sin_concesion',
      texto: 'El hotel no está concedido a este ID de socio',
      consejo:
        'El servicio reconoce las credenciales y el ID de socio: lo que no tiene es ese hotel asignado a la cuenta. Comprueba que el código de propiedad es el correcto y pide que lo asignen a tu ID de socio: hasta entonces no fluyen ni el inventario ni las reservas de ese hotel.',
    };
  }

  // Credenciales rechazadas: el servicio contestó y rechazó la autenticación.
  if (status === 401 || status === 403) {
    return {
      clave: 'credenciales_rechazadas',
      texto: 'Credenciales rechazadas',
      consejo:
        'El servicio responde pero rechaza la autenticación: revisa o rota las credenciales en este panel y confirma con el proveedor que no las haya revocado.',
    };
  }

  // Sin respuesta del servicio: 5xx explícito, o sin HTTP con pinta de
  // red/timeout en el mensaje del cliente HTTP.
  const esServidor = status !== null && status >= 500 && status <= 599;
  const sinRespuesta = status === null && (pareceErrorDeRed(mensaje) || !mensaje);
  if (esServidor || sinRespuesta) {
    return {
      clave: 'sin_respuesta_servicio',
      texto: 'Sin respuesta del servicio',
      consejo:
        'No es un problema de credenciales: el servicio no llegó a contestar. Reintenta más tarde; si persiste, avisa al proveedor.',
    };
  }

  // Todo lo demás: 4xx de datos, fallos del proveedor sin código HTTP…
  const detalle = mensaje?.trim() || (status !== null ? `HTTP ${status}` : 'Error desconocido');
  return {
    clave: 'otro_error',
    texto: 'Error',
    consejo: `Revisa el historial de sincronización: ${detalle}`,
  };
}
