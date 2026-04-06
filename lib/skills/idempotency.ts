/**
 * Idempotency Layer - Prevenir ejecuciones duplicadas
 * 
 * Estrategias:
 * - In-memory cache con TTL (para desarrollo)
 * - Redis/Database para producción
 * - Idempotency keys basadas en contenido
 */

import prisma from '@/lib/db';

// ============================================================
// TIPOS
// ============================================================

export interface IdempotencyRecord {
  key: string;
  result: unknown;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Date;
  expiresAt: Date;
  correlationId?: string;
}

export interface IdempotencyOptions {
  ttlSeconds?: number;      // Default: 3600 (1 hora)
  scope?: string;           // Para agrupar keys (e.g., 'skill', 'automation')
}

// ============================================================
// IN-MEMORY STORE (Fallback/Desarrollo)
// ============================================================

const memoryStore = new Map<string, IdempotencyRecord>();

function cleanupExpired(): void {
  const now = new Date();
  for (const [key, record] of memoryStore.entries()) {
    if (record.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}

// Limpiar cada 5 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpired, 5 * 60 * 1000);
}

// ============================================================
// IDEMPOTENCY SERVICE
// ============================================================

export class IdempotencyService {
  private useDatabase: boolean;
  
  constructor(useDatabase = true) {
    this.useDatabase = useDatabase;
  }
  
  /**
   * Generar key de idempotencia
   */
  generateKey(
    scope: string,
    action: string,
    uniqueParams: Record<string, unknown>
  ): string {
    const sorted = Object.keys(uniqueParams).sort();
    const values = sorted.map(k => `${k}=${JSON.stringify(uniqueParams[k])}`).join('&');
    
    // Hash simple
    const raw = `${scope}:${action}:${values}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${scope}_${action}_${Math.abs(hash).toString(36)}`;
  }
  
  /**
   * Verificar si ya existe una ejecución
   */
  async check(key: string): Promise<IdempotencyRecord | null> {
    if (this.useDatabase) {
      try {
        const record = await prisma.idempotencyRecord.findUnique({
          where: { key },
        });
        
        if (record && record.expiresAt > new Date()) {
          return {
            key: record.key,
            result: record.result as unknown,
            status: record.status as 'processing' | 'completed' | 'failed',
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
            correlationId: record.correlationId || undefined,
          };
        }
        return null;
      } catch {
        // Fallback a memoria si la tabla no existe
        return memoryStore.get(key) || null;
      }
    }
    
    const record = memoryStore.get(key);
    if (record && record.expiresAt > new Date()) {
      return record;
    }
    return null;
  }
  
  /**
   * Iniciar una operación (marcar como processing)
   */
  async start(
    key: string,
    options: IdempotencyOptions = {},
    correlationId?: string
  ): Promise<boolean> {
    const ttl = options.ttlSeconds || 3600;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    
    if (this.useDatabase) {
      try {
        await prisma.idempotencyRecord.create({
          data: {
            key,
            status: 'processing',
            result: undefined,
            expiresAt,
            correlationId,
          },
        });
        return true;
      } catch (e: unknown) {
        // Si ya existe, es duplicado
        const error = e as { code?: string };
        if (error.code === 'P2002') {
          return false;
        }
        // Fallback a memoria
        console.warn('[Idempotency] DB error, using memory:', e);
      }
    }
    
    // Memory store
    if (memoryStore.has(key)) {
      const existing = memoryStore.get(key)!;
      if (existing.expiresAt > new Date()) {
        return false; // Duplicado
      }
    }
    
    memoryStore.set(key, {
      key,
      result: null,
      status: 'processing',
      createdAt: new Date(),
      expiresAt,
      correlationId,
    });
    
    return true;
  }
  
  /**
   * Completar una operación
   */
  async complete(key: string, result: unknown): Promise<void> {
    if (this.useDatabase) {
      try {
        await prisma.idempotencyRecord.update({
          where: { key },
          data: {
            status: 'completed',
            result: result ? JSON.parse(JSON.stringify(result)) : undefined,
          },
        });
        return;
      } catch {
        // Fallback a memoria
      }
    }
    
    const record = memoryStore.get(key);
    if (record) {
      record.status = 'completed';
      record.result = result;
    }
  }
  
  /**
   * Marcar como fallida
   */
  async fail(key: string, error: unknown): Promise<void> {
    if (this.useDatabase) {
      try {
        await prisma.idempotencyRecord.update({
          where: { key },
          data: {
            status: 'failed',
            result: JSON.parse(JSON.stringify({ error: String(error) })),
          },
        });
        return;
      } catch {
        // Fallback a memoria
      }
    }
    
    const record = memoryStore.get(key);
    if (record) {
      record.status = 'failed';
      record.result = { error: String(error) };
    }
  }
  
  /**
   * Eliminar registro (para retry forzado)
   */
  async clear(key: string): Promise<void> {
    if (this.useDatabase) {
      try {
        await prisma.idempotencyRecord.delete({
          where: { key },
        });
      } catch {
        // Ignorar si no existe
      }
    }
    memoryStore.delete(key);
  }
}

// Singleton
const idempotencyService = new IdempotencyService();
export default idempotencyService;

// ============================================================
// DECORATOR / WRAPPER FUNCTION
// ============================================================

/**
 * Ejecutar función con idempotencia
 */
export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
  options: IdempotencyOptions = {}
): Promise<{ result: T; cached: boolean }> {
  // Verificar si ya existe
  const existing = await idempotencyService.check(key);
  
  if (existing) {
    if (existing.status === 'processing') {
      throw new Error(`Operation ${key} is already in progress`);
    }
    if (existing.status === 'completed') {
      return { result: existing.result as T, cached: true };
    }
    // Si falló, permitir retry
  }
  
  // Iniciar nueva operación
  const started = await idempotencyService.start(key, options);
  if (!started) {
    throw new Error(`Operation ${key} is already in progress (race condition)`);
  }
  
  try {
    const result = await fn();
    await idempotencyService.complete(key, result);
    return { result, cached: false };
  } catch (error) {
    await idempotencyService.fail(key, error);
    throw error;
  }
}

/**
 * Generar key para skill execution
 */
export function skillIdempotencyKey(
  skillName: string,
  tenantId: string,
  params: Record<string, unknown>
): string {
  return idempotencyService.generateKey('skill', `${tenantId}:${skillName}`, params);
}

/**
 * Generar key para automation execution
 */
export function automationIdempotencyKey(
  automationId: string,
  triggerId: string,
  triggerData: Record<string, unknown>
): string {
  return idempotencyService.generateKey('automation', automationId, {
    triggerId,
    ...triggerData,
  });
}
