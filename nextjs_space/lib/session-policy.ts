/**
 * lib/session-policy.ts
 *
 * Política de sesión para el ERP (next-auth v4, estrategia JWT):
 *
 * 1. SESIÓN ÚNICA POR USUARIO
 *    Al iniciar sesión (credentials authorize) se incrementa `tokenVersion`
 *    del usuario en BD y se guarda como `sessionVersion` en el JWT. La
 *    validación (session callback + middleware) exige que el `sessionVersion`
 *    del JWT coincida con el vigente en BD: si no, la sesión es inválida.
 *    Con esto, el login en un dispositivo B invalida la sesión del
 *    dispositivo A (una sola sesión activa por usuario).
 *
 * 2. CIERRE POR INACTIVIDAD
 *    El middleware comprueba el claim `lastActivity` (epoch segundos) del
 *    JWT en cada petición a ruta protegida. Si pasan más de
 *    SESSION_IDLE_TIMEOUT_SECONDS sin peticiones (por defecto 30 min), la
 *    sesión expira aunque el JWT siga dentro de su vida absoluta de 24 h
 *    (session.maxAge). Con cada request válida se refresca `lastActivity`
 *    y, de forma deslizante, la cookie (rolling session).
 *
 * Este módulo es edge-safe: solo lógica pura y tipos (sin Prisma ni Node
 * crypto), para poder importarlo desde `middleware.ts` (Edge Runtime).
 */

/** Claims extra que el ERP añade al JWT de next-auth (además de los estándar). */
export interface SessionClaims {
  /** Versión de la sesión vigente (= tokenVersion en BD al hacer login). */
  sessionVersion?: number
  /** Última actividad del usuario, epoch en segundos. */
  lastActivity?: number
  /** Claims legacy del ERP (se preservan; tokenVersion sigue en BD). */
  tenantId?: string
  roleId?: string
  roleName?: string
  accountType?: string
  tokenVersion?: number
  tenantSubdomain?: string
  [key: string]: unknown
}

/**
 * Tiempo de inactividad máximo antes de cerrar sesión, en segundos.
 * Configurable con SESSION_IDLE_TIMEOUT_SECONDS (por defecto 30 min).
 * "Inactividad" = sin requests válidas del usuario (lo mide el middleware).
 */
export function getSessionIdleTimeoutSeconds(): number {
  const raw = process.env.SESSION_IDLE_TIMEOUT_SECONDS
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60
}

/** Vida absoluta del JWT, en segundos (igual que session.maxAge en authOptions). */
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 24 * 60 * 60

/**
 * ¿Ha expirado la sesión por inactividad?
 * Las sesiones sin `lastActivity` (acuñadas a mano o anteriores al cambio)
 * NO expiran por inactividad: evita cerrar en bloque sesiones legítimas al
 * desplegar; caducarán solas por su exp absoluta de 24 h.
 */
export function isSessionIdleExpired(
  token: SessionClaims | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!token) return false // sin token decide el middleware (login redirect)
  if (typeof token.lastActivity !== 'number') return false
  return nowSeconds - token.lastActivity > getSessionIdleTimeoutSeconds()
}

/**
 * Devuelve los claims refrescados para re-emitir la cookie deslizante:
 * actualiza lastActivity a ahora. (iat/exp los pone encode() con maxAge.)
 */
export function refreshSessionClaims(
  token: SessionClaims,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SessionClaims {
  return { ...token, lastActivity: nowSeconds }
}

/** Nombre de la cookie de sesión (idéntico a authOptions.cookies.sessionToken.name). */
export const SESSION_COOKIE_NAME = 'next-auth.session-token'

/**
 * Antelación con la que se avisa al usuario de que su sesión se cierra por
 * inactividad, en segundos (2 min).
 */
export const SESSION_EXPIRY_WARNING_SECONDS = 2 * 60

/**
 * Ventana real de aviso: nunca superior a la mitad del timeout, para que un
 * timeout corto no deje el aviso visible de forma permanente.
 */
export function getSessionWarningSeconds(
  timeoutSeconds: number = getSessionIdleTimeoutSeconds()
): number {
  return Math.max(1, Math.min(SESSION_EXPIRY_WARNING_SECONDS, Math.floor(timeoutSeconds / 2)))
}

/**
 * Segundos que le quedan a la sesión antes del cierre por inactividad.
 * `null` si el token no lleva `lastActivity` (sesión legacy: no expira por
 * inactividad). Puede ser negativo si ya expiró.
 */
export function secondsUntilIdleExpiry(
  token: SessionClaims | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): number | null {
  if (!token || typeof token.lastActivity !== 'number') return null
  return token.lastActivity + getSessionIdleTimeoutSeconds() - nowSeconds
}

/** ¿Toca avisar al usuario de que la sesión está a punto de expirar? */
export function shouldWarnIdleExpiry(
  token: SessionClaims | null | undefined,
  warnSeconds: number = getSessionWarningSeconds(),
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const remaining = secondsUntilIdleExpiry(token, nowSeconds)
  return remaining !== null && remaining <= warnSeconds
}

/**
 * Rutas del aviso de sesión. `status` solo informa (el middleware NO refresca
 * la cookie, para que consultarlo no mantenga viva la sesión por inactividad);
 * `renew` sí la refresca (es su propósito).
 */
export const SESSION_STATUS_PATH = '/api/session/status'
export const SESSION_RENEW_PATH = '/api/session/renew'
