/**
 * Hybrid analytics event store — memory + PostgreSQL.
 *
 * Los eventos se persisten en la tabla PublicAnalyticsEvent y se cachean
 * en memoria para consultas rápidas desde el dashboard. Sobreviven reinicios.
 */

import { prisma } from '@/lib/db';

export interface AnalyticsEvent {
  event: string;
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  referer: string;
  timestamp: string;
}

const MAX_EVENTS = 1000;

// Cache en memoria (más recientes primero)
let memoryCache: AnalyticsEvent[] = [];
let cacheHydrated = false;

/** Hidrata la cache desde la BD al iniciar el módulo */
async function hydrateCache(): Promise<void> {
  if (cacheHydrated) return;
  try {
    const rows = await prisma.publicAnalyticsEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take: MAX_EVENTS,
      select: { event: true, metadata: true, ip: true, userAgent: true, referer: true, timestamp: true },
    });
    memoryCache = rows.map((r) => ({
      event: r.event,
      metadata: (r.metadata as Record<string, unknown>) || {},
      ip: r.ip,
      userAgent: r.userAgent,
      referer: r.referer,
      timestamp: r.timestamp.toISOString(),
    }));
    cacheHydrated = true;
  } catch (e) {
    console.error('[analytics/store] Error hydrating cache from DB:', e);
    cacheHydrated = true; // evitar reintentos infinitos si la BD falla
  }
}

/** Añade un evento — persiste en BD (async) + cache en memoria (sync) */
export function addEvent(event: AnalyticsEvent): void {
  // Guardar en memoria inmediatamente
  memoryCache.unshift(event);
  if (memoryCache.length > MAX_EVENTS) memoryCache.pop();

  // Persistir en BD de forma asíncrona (fire-and-forget)
  prisma.publicAnalyticsEvent
    .create({
      data: {
        event: event.event,
        metadata: event.metadata || {},
        ip: event.ip,
        userAgent: event.userAgent,
        referer: event.referer,
        timestamp: new Date(event.timestamp),
      },
    })
    .catch((e) => console.error('[analytics/store] Error persisting event:', e));
}

/** Obtiene eventos de la cache en memoria */
export async function getEvents(filter?: {
  eventPrefix?: string;
  since?: string;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  await hydrateCache();
  let result = [...memoryCache];

  if (filter?.eventPrefix) {
    result = result.filter((e) => e.event.startsWith(filter.eventPrefix!));
  }
  if (filter?.since) {
    result = result.filter((e) => e.timestamp >= filter.since!);
  }

  if (filter?.limit && filter.limit > 0) {
    result = result.slice(0, filter.limit);
  }

  return result;
}

/** Obtiene conteos por tipo de evento desde la cache */
export async function getEventCounts(filter?: {
  eventPrefix?: string;
  since?: string;
}): Promise<Record<string, number>> {
  await hydrateCache();
  let events = [...memoryCache];
  if (filter?.eventPrefix) {
    events = events.filter((e) => e.event.startsWith(filter.eventPrefix!));
  }
  if (filter?.since) {
    events = events.filter((e) => e.timestamp >= filter.since!);
  }

  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event] = (counts[e.event] || 0) + 1;
  }
  return counts;
}

/** Limpia todos los eventos — BD + memoria */
export async function clearEvents(): Promise<void> {
  memoryCache = [];
  cacheHydrated = false;
  try {
    await prisma.publicAnalyticsEvent.deleteMany();
  } catch (e) {
    console.error('[analytics/store] Error clearing events from DB:', e);
  }
}

/**
 * Elimina eventos de analytics con más de `days` días de antigüedad.
 * Solo limpia la BD; la cache en memoria se rehidratará en el próximo acceso.
 */
export async function cleanupOldEvents(days: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  try {
    const result = await prisma.publicAnalyticsEvent.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[analytics/store] Cleanup: deleted ${result.count} events older than ${days} days (before ${cutoff.toISOString()})`);
      // Invalidar cache para que se rehidrate sin los eventos viejos
      memoryCache = [];
      cacheHydrated = false;
    }
    return result.count;
  } catch (e) {
    console.error('[analytics/store] Error cleaning up old events:', e);
    return 0;
  }
}
