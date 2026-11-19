/**
 * Trazabilidad por herramienta del agente (P5).
 *
 * `chatbotAuditLog` registra la intención del turno y su éxito/error; aquí se
 * guarda el detalle de **cada** tool que ejecuta el agente: con qué argumentos,
 * cuánto tardó y qué devolvió. Es la fuente para auditar «qué hizo la IA con
 * qué datos» sin volcar todo el contenido de la conversación.
 *
 * El registro nunca rompe la operación: si la tabla no está disponible, la
 * herramienta se ejecuta igual. Por eso `registrarEjecucion` se traga su propio
 * fallo y no propaga errores al bucle del agente.
 */

import { prisma } from '@/lib/db';

export type EstadoEjecucion = 'ok' | 'error' | 'denegado';

/** Datos de una ejecución, ya listos para persistir (resultado crudo). */
export interface DatosTraza {
  tenantId: string;
  userId?: string;
  conversationId?: string;
  herramienta: string;
  origen?: string;
  argumentos?: unknown;
  resultado?: unknown;
  duracionMs?: number;
  estado?: EstadoEjecucion;
  error?: string;
  idempotente?: boolean;
}

/** Límites de saneo: suficiente para auditar, sin guardar el CRM entero. */
const MAX_LONGITUD_TEXTO = 500;
const MAX_CLAVES = 20;
const MAX_ELEMENTOS = 10;
const MAX_PROFUNDIDAD = 4;
const CLAVES_SENSIBLES = new Set([
  'password',
  'contraseña',
  'contrasena',
  'token',
  'secret',
  'apiKey',
  'apikey',
  'api_key',
  'authorization',
  'accessToken',
  'access_token',
]);

/**
 * Recorta un valor para la traza: trunca textos largos, oculta secretos,
 * limita la profundidad y el tamaño de objetos y listas, y convierte fechas a
 * cadena. El objetivo es un registro legible y acotado, no un clon del dato.
 */
export function sanearParaTraza(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === 'string') {
    return valor.length > MAX_LONGITUD_TEXTO
      ? `${valor.slice(0, MAX_LONGITUD_TEXTO)}…`
      : valor;
  }

  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;

  if (Array.isArray(valor)) {
    if (profundidad >= MAX_PROFUNDIDAD) return '[recortado]';
    return valor.slice(0, MAX_ELEMENTOS).map((item) => sanearParaTraza(item, profundidad + 1));
  }

  if (typeof valor === 'object') {
    if (profundidad >= MAX_PROFUNDIDAD) return '[recortado]';
    const entradas = Object.entries(valor as Record<string, unknown>);
    const acotadas = entradas.slice(0, MAX_CLAVES);
    const saneado: Record<string, unknown> = {};
    for (const [clave, contenido] of acotadas) {
      saneado[clave] = CLAVES_SENSIBLES.has(clave)
        ? '[oculto]'
        : sanearParaTraza(contenido, profundidad + 1);
    }
    if (entradas.length > MAX_CLAVES) saneado['…'] = `[${entradas.length - MAX_CLAVES} claves más]`;
    return saneado;
  }

  return String(valor);
}

/**
 * Guarda una fila de `ToolExecution`. No lanza: un fallo de trazabilidad no
 * puede tumbar una operación que ya se ejecutó.
 */
export async function registrarEjecucion(datos: DatosTraza): Promise<void> {
  try {
    await prisma.toolExecution.create({
      data: {
        tenantId: datos.tenantId,
        userId: datos.userId ?? null,
        conversationId: datos.conversationId ?? null,
        toolName: datos.herramienta,
        origin: datos.origen ?? null,
        arguments:
          datos.argumentos !== undefined ? (sanearParaTraza(datos.argumentos) as any) : undefined,
        result: datos.resultado !== undefined ? (sanearParaTraza(datos.resultado) as any) : undefined,
        durationMs: Math.max(0, Math.round(datos.duracionMs ?? 0)),
        status: datos.estado ?? 'ok',
        errorMessage: datos.error ?? null,
        idempotent: datos.idempotente ?? false,
      },
    });
  } catch {
    // Trazabilidad best-effort: la operación ya devolvió (o ya falló) y no
    // debe repetirse ni abortarse por no poder auditarla.
  }
}
