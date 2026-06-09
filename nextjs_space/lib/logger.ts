/**
 * Logger estructurado con pino
 *
 * - JSON estructurado en producción
 * - pretty-print en desarrollo (sin worker threads para compatibilidad con Next.js)
 * - requestId automático vía AsyncLocalStorage (dbContext)
 * - Niveles: trace < debug < info < warn < error < fatal
 *
 * Uso:
 *   import { logger } from '@/lib/logger'
 *   logger.info({ tenantId: '...' }, 'Mensaje estructurado')
 *   logger.error({ err }, 'Error al procesar')
 */

import pino, { type Logger as PinoLogger } from 'pino'

// ── Configuración de pino ──────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Instancia base de pino.
 *
 * IMPORTANTE: NO usar transport/worker threads en desarrollo porque Next.js
 * 14.x no resuelve correctamente los workers de thread-stream/pino-pretty
 * en modo dev (MODULE_NOT_FOUND). En su lugar, usamos el output por defecto
 * de pino (stdout JSON) que es simple, fiable y no requiere workers.
 *
 * Para formatear la salida en desarrollo, se puede pipear a pino-pretty:
 *   yarn dev 2>&1 | npx pino-pretty
 */
const baseLogger: PinoLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {
        // JSON puro para ingesta en sistemas de observabilidad
        formatters: {
          level(label) {
            return { level: label }
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {}),
  // Redactar datos sensibles en producción (claves top-level, no rutas anidadas)
  redact: isProduction
    ? ['apiKey', 'password', 'token', 'secret', 'keyHash', 'vaultSeed', 'dbUrl']
    : [],
})

// ── requestId vía AsyncLocalStorage ─────────────────────────────────────────

/**
 * Obtiene el requestId del AsyncLocalStorage (inyectado por dbContext).
 * Si no hay requestId, genera uno nuevo.
 */
function getRequestId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dbContext } = require('./db')
    const store = dbContext.getStore()
    if (store?.requestId) return store.requestId as string
  } catch {
    // dbContext no disponible (ej. durante build)
  }
  // Generar uno local si no hay contexto
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Logger wrapper ──────────────────────────────────────────────────────────

/**
 * Logger estructurado que inyecta automáticamente requestId y contexto.
 *
 * API compatible con console.log/.error/.warn pero con salida JSON estructurada:
 *   logger.info('mensaje')  →  {"level":"info","msg":"mensaje","requestId":"..."}
 *   logger.info({ tenantId: 'x' }, 'mensaje con datos')
 *   logger.error({ err }, 'error con stack trace')
 *   logger.warn('advertencia')
 */
export const logger = {
  trace: (obj: unknown, msg?: string, ...args: unknown[]) => {
    const { message, data } = normalizeArgs(obj, msg, ...args)
    baseLogger.trace({ requestId: getRequestId(), ...data }, message)
  },
  debug: (obj: unknown, msg?: string, ...args: unknown[]) => {
    const { message, data } = normalizeArgs(obj, msg, ...args)
    baseLogger.debug({ requestId: getRequestId(), ...data }, message)
  },
  info: (obj: unknown, msg?: string, ...args: unknown[]) => {
    const { message, data } = normalizeArgs(obj, msg, ...args)
    baseLogger.info({ requestId: getRequestId(), ...data }, message)
  },
  warn: (obj: unknown, msg?: string, ...args: unknown[]) => {
    const { message, data } = normalizeArgs(obj, msg, ...args)
    baseLogger.warn({ requestId: getRequestId(), ...data }, message)
  },
  error: (obj: unknown, msg?: string, ...args: unknown[]) => {
    const { message, data, err } = normalizeArgs(obj, msg, ...args)
    const payload: Record<string, unknown> = { requestId: getRequestId(), ...data }
    if (err) {
      payload.err = pino.stdSerializers.err(err)
    }
    baseLogger.error(payload, message)
  },
  fatal: (obj: unknown, msg?: string, ...args: unknown[]) => {
    const { message, data, err } = normalizeArgs(obj, msg, ...args)
    const payload: Record<string, unknown> = { requestId: getRequestId(), ...data }
    if (err) {
      payload.err = pino.stdSerializers.err(err)
    }
    baseLogger.fatal(payload, message)
  },
  /**
   * Crea un child logger con contexto pre-establecido (tenantId, userId, etc.)
   * Útil para logs de un tenant específico.
   */
  child: (bindings: Record<string, unknown>): PinoLogger => {
    return baseLogger.child(bindings)
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface NormalizedArgs {
  message: string
  data: Record<string, unknown>
  err?: Error
}

/**
 * Normaliza argumentos estilo console.log para pino.
 * Soporta:
 *   logger.info('mensaje')
 *   logger.info({ tenantId: 'x' }, 'mensaje')
 *   logger.error({ err: new Error('...') }, 'mensaje')
 *   logger.error(new Error('...'), 'mensaje')
 */
function normalizeArgs(obj: unknown, msg?: string, ...args: unknown[]): NormalizedArgs {
  // Caso: logger.error(error, 'mensaje')
  if (obj instanceof Error) {
    return {
      message: msg || obj.message,
      data: args.length > 0 && typeof args[0] === 'object' ? (args[0] as Record<string, unknown>) : {},
      err: obj,
    }
  }

  // Caso: logger.info({ tenantId: 'x' }, 'mensaje')
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const dataObj = obj as Record<string, unknown>
    if ('err' in dataObj && dataObj.err instanceof Error) {
      const { err, ...rest } = dataObj
      return { message: msg || '', data: rest, err: err as Error }
    }
    return { message: msg || '', data: dataObj }
  }

  // Caso: logger.info('mensaje')
  return { message: typeof obj === 'string' ? obj : (msg || String(obj)), data: {} }
}

// ── Re-export pino types ────────────────────────────────────────────────────

export type { PinoLogger }

export default logger
