/**
 * Saneador de respuestas externas de la capa de conectividad.
 *
 * El proveedor puede reflejar en sus errores cosas que no deben verse: el
 * header `Authorization` (Basic Auth de la capa), API keys en la URL
 * reenviada, cookies… Los cuerpos de error se muestran en el diálogo de
 * prueba del panel y se persisten en `HospitalitySyncLog.responseBody`
 * (visible en el historial de sync-logs) — la redacción ocurre en la FUENTE
 * (`connectivity.ts`), no en cada pantalla, y el diálogo aplica una segunda
 * capa por defensa en profundidad.
 *
 * Módulo puro: sin BD, sin UI, importable desde servidor y cliente.
 */

/** Marcador que sustituye a todo valor sensible. */
export const MARCA_OCULTA = '[oculto]';

/** Marcador de profundidad excedida (cuerpos patológicos). */
export const MARCA_TRUNCADO = '[truncado]';

/** Marcador de referencias circulares (no deberían llegar de JSON, por defensiva). */
export const MARCA_CIRCULAR = '[circular]';

/** Profundidad máxima de recursión sobre objetos/anidamientos. */
const MAX_PROFUNDIDAD = 8;

/** Longitud máxima de cada cadena (los 404 de nginx pueden traer HTML enorme). */
const MAX_CADENA = 4000;

/**
 * Claves que delatan secretos, comparadas NORMALIZANDO la clave (minúsculas,
 * sin separadores: `X-API-Key` → `xapikey`). Por substring para cubrir
 * variantes (`access_token`, `authHeader`, `api-key`…).
 */
const CLAVES_SENSIBLES = [
  'authorization',
  'apikey',
  'apisecret',
  'accesskey',
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'cookie',
  'credential',
  'privatekey',
  'signature',
  'sessionid',
  'basicauth',
];

function claveSensible(clave: string): boolean {
  const normalizada = clave.toLowerCase().replace(/[^a-z0-9]/g, '');
  return CLAVES_SENSIBLES.some((patron) => normalizada.includes(patron));
}

/**
 * Patrones de VALOR: aunque la clave no delate nada, un string que traiga un
 * header completo incrustado (`"received: Authorization: Basic dXNlcjpwYXNz"`)
 * no debe salir en claro.
 */
const PATRON_BASIC = /basic\s+[a-z0-9+/=._-]+/gi;
const PATRON_BEARER = /bearer\s+[a-z0-9._~+/=-]+/gi;

function sanitizarCadena(valor: string): string {
  let limpio = valor.replace(PATRON_BASIC, 'basic [oculto]').replace(PATRON_BEARER, 'bearer [oculto]');
  if (limpio.length > MAX_CADENA) {
    limpio = `${limpio.slice(0, MAX_CADENA)}…[truncado]`;
  }
  return limpio;
}

/**
 * Redacta secretos de un cuerpo externo (JSON del proveedor o texto plano).
 *
 * Reglas:
 * - Clave sensible (normalizada) → su valor se sustituye por `[oculto]`,
 *   sea objeto, string o número.
 * - Cualquier string con pinta de `Basic …`/`Bearer …` → credencial oculta.
 * - Cadenas acotadas a 4000 caracteres; profundidad acotada a 8 niveles.
 * - Primitivas, fechas y null pasan intactos.
 */
export function sanitizarRespuestaExterna(
  cuerpo: unknown,
  profundidad = 0,
  vistos: WeakSet<object> = new WeakSet(),
): unknown {
  if (cuerpo === null || cuerpo === undefined) return cuerpo;

  const tipo = typeof cuerpo;
  if (tipo === 'string') return sanitizarCadena(cuerpo as string);
  if (tipo === 'number' || tipo === 'boolean') return cuerpo;
  if (tipo === 'bigint' || tipo === 'function' || tipo === 'symbol') return String(cuerpo);
  if (cuerpo instanceof Date) return cuerpo;

  if (profundidad >= MAX_PROFUNDIDAD) return MARCA_TRUNCADO;
  const comoObjeto = cuerpo as object;
  if (vistos.has(comoObjeto)) return MARCA_CIRCULAR;
  vistos.add(comoObjeto);

  if (Array.isArray(cuerpo)) {
    return cuerpo.map((valor) => sanitizarRespuestaExterna(valor, profundidad + 1, vistos));
  }

  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(cuerpo as Record<string, unknown>)) {
    if (claveSensible(clave)) {
      salida[clave] = MARCA_OCULTA;
    } else {
      salida[clave] = sanitizarRespuestaExterna(valor, profundidad + 1, vistos);
    }
  }
  return salida;
}
