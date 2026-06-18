/**
 * In-memory analytics event store.
 *
 * Accumula eventos de analytics en memoria para consulta en tiempo real
 * desde el dashboard de admin. Los eventos también se escriben a los logs
 * estructurados vía console.info (StructuredLogger).
 */

export interface AnalyticsEvent {
  event: string;
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  referer: string;
  timestamp: string;
}

const MAX_EVENTS = 1000;

const store: AnalyticsEvent[] = [];

export function addEvent(event: AnalyticsEvent): void {
  store.push(event);
  if (store.length > MAX_EVENTS) {
    store.shift();
  }
}

export function getEvents(filter?: {
  eventPrefix?: string;
  since?: string;
  limit?: number;
}): AnalyticsEvent[] {
  let result = [...store];

  if (filter?.eventPrefix) {
    result = result.filter((e) => e.event.startsWith(filter.eventPrefix!));
  }
  if (filter?.since) {
    result = result.filter((e) => e.timestamp >= filter.since!);
  }

  // Más recientes primero
  result.reverse();

  if (filter?.limit && filter.limit > 0) {
    result = result.slice(0, filter.limit);
  }

  return result;
}

export function getEventCounts(filter?: {
  eventPrefix?: string;
  since?: string;
}): Record<string, number> {
  let events = [...store];
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

export function clearEvents(): void {
  store.length = 0;
}
