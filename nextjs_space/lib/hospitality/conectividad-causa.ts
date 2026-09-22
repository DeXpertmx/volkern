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
  clave: 'credenciales_rechazadas' | 'sin_respuesta_servicio' | 'otro_error';
  /** Lo que se muestra al operador. */
  texto: string;
  /** Qué hacer, en una frase. */
  consejo: string;
}

/**
 * Palabras clave de error de red/timeout del cliente HTTP (Node `fetch`):
 * aborts, DNS, conexión rechazada, socket colgado. Cualquiera de ellas sin
 * `httpStatus` significa que la petición no obtuvo respuesta.
 */
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
