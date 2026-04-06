/**
 * Event Metadata - Metadatos enriquecidos para eventos
 * 
 * Proporciona:
 * - Timestamps precisos
 * - Correlation IDs
 * - Source tracking
 * - Versioning
 * - Deduplication keys
 */

import { v4 as uuidv4 } from 'uuid';
import { SkillContext, SkillSource } from './context';

// ============================================================
// TIPOS
// ============================================================

export interface EventMetadata {
  // Identificación única
  eventId: string;              // UUID único del evento
  eventType: string;            // Tipo de evento (e.g., 'lead_created')
  eventVersion: string;         // Versión del schema del evento (e.g., '1.0')
  
  // Trazabilidad
  correlationId: string;        // Para rastrear toda la cadena
  causationId?: string;         // ID del evento que causó este
  parentEventId?: string;       // Si es evento derivado
  
  // Origen
  source: SkillSource;
  sourceService: string;        // 'volkern-crm'
  sourceAction?: string;        // e.g., 'create_lead', 'webhook_chatwoot'
  
  // Actor
  tenantId: string;
  userId?: string;
  userEmail?: string;
  
  // Timing
  timestamp: Date;              // Cuando ocurrió el evento
  processedAt?: Date;           // Cuando se procesó
  
  // Idempotencia
  idempotencyKey?: string;      // Para prevenir duplicados
  
  // Metadata adicional
  tags?: string[];
  environment?: 'development' | 'staging' | 'production';
  requestId?: string;
}

export interface EnrichedEvent<T = unknown> {
  metadata: EventMetadata;
  payload: T;
}

// ============================================================
// BUILDER DE EVENTOS
// ============================================================

export class EventBuilder<T = unknown> {
  private metadata: Partial<EventMetadata> = {};
  private payload: T | undefined;
  
  constructor(eventType: string) {
    this.metadata.eventId = uuidv4();
    this.metadata.eventType = eventType;
    this.metadata.eventVersion = '1.0';
    this.metadata.timestamp = new Date();
    this.metadata.sourceService = 'volkern-crm';
    this.metadata.environment = (process.env.NODE_ENV as 'development' | 'production') || 'development';
  }
  
  // Desde contexto de skill
  fromContext(context: SkillContext): this {
    this.metadata.tenantId = context.tenantId;
    this.metadata.userId = context.userId;
    this.metadata.userEmail = context.userEmail;
    this.metadata.correlationId = context.correlationId;
    this.metadata.source = context.source;
    this.metadata.requestId = context.requestId;
    return this;
  }
  
  // Setters individuales
  withCorrelationId(id: string): this {
    this.metadata.correlationId = id;
    return this;
  }
  
  withCausationId(id: string): this {
    this.metadata.causationId = id;
    return this;
  }
  
  withParentEventId(id: string): this {
    this.metadata.parentEventId = id;
    return this;
  }
  
  withTenant(tenantId: string): this {
    this.metadata.tenantId = tenantId;
    return this;
  }
  
  withUser(userId: string, email?: string): this {
    this.metadata.userId = userId;
    this.metadata.userEmail = email;
    return this;
  }
  
  withSource(source: SkillSource, action?: string): this {
    this.metadata.source = source;
    this.metadata.sourceAction = action;
    return this;
  }
  
  withIdempotencyKey(key: string): this {
    this.metadata.idempotencyKey = key;
    return this;
  }
  
  withTags(...tags: string[]): this {
    this.metadata.tags = [...(this.metadata.tags || []), ...tags];
    return this;
  }
  
  withPayload(payload: T): this {
    this.payload = payload;
    return this;
  }
  
  withVersion(version: string): this {
    this.metadata.eventVersion = version;
    return this;
  }
  
  // Construir evento final
  build(): EnrichedEvent<T> {
    if (!this.metadata.tenantId) {
      throw new Error('Event requires tenantId');
    }
    if (!this.metadata.correlationId) {
      this.metadata.correlationId = uuidv4();
    }
    if (this.payload === undefined) {
      throw new Error('Event requires payload');
    }
    
    return {
      metadata: this.metadata as EventMetadata,
      payload: this.payload,
    };
  }
  
  // Build sin payload (para eventos simples)
  buildWithPayload(payload: T): EnrichedEvent<T> {
    return this.withPayload(payload).build();
  }
}

// ============================================================
// FUNCIONES HELPER
// ============================================================

/**
 * Crear evento desde contexto de skill
 */
export function createEvent<T>(
  eventType: string,
  payload: T,
  context: SkillContext
): EnrichedEvent<T> {
  return new EventBuilder<T>(eventType)
    .fromContext(context)
    .withPayload(payload)
    .build();
}

/**
 * Crear evento simple (sin contexto)
 */
export function createSimpleEvent<T>(
  eventType: string,
  payload: T,
  tenantId: string,
  correlationId?: string
): EnrichedEvent<T> {
  return new EventBuilder<T>(eventType)
    .withTenant(tenantId)
    .withCorrelationId(correlationId || uuidv4())
    .withSource('system')
    .withPayload(payload)
    .build();
}

/**
 * Crear evento derivado (causado por otro evento)
 */
export function createDerivedEvent<T>(
  eventType: string,
  payload: T,
  parentEvent: EnrichedEvent<unknown>
): EnrichedEvent<T> {
  return new EventBuilder<T>(eventType)
    .withTenant(parentEvent.metadata.tenantId)
    .withCorrelationId(parentEvent.metadata.correlationId)
    .withCausationId(parentEvent.metadata.eventId)
    .withParentEventId(parentEvent.metadata.eventId)
    .withSource(parentEvent.metadata.source)
    .withUser(parentEvent.metadata.userId || '', parentEvent.metadata.userEmail)
    .withPayload(payload)
    .build();
}

/**
 * Generar idempotency key desde payload
 */
export function generateIdempotencyKey(
  eventType: string,
  tenantId: string,
  uniqueFields: Record<string, unknown>
): string {
  const sorted = Object.keys(uniqueFields).sort();
  const values = sorted.map(k => `${k}:${JSON.stringify(uniqueFields[k])}`);
  const raw = `${eventType}:${tenantId}:${values.join(':')}`;
  
  // Simple hash (en producción usar crypto)
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `idem_${Math.abs(hash).toString(36)}`;
}

/**
 * Extraer solo los metadatos de un evento (para logging)
 */
export function extractMetadataForLog(event: EnrichedEvent<unknown>): Record<string, unknown> {
  const { payload, ...rest } = event;
  return {
    ...rest.metadata,
    payloadType: typeof payload,
    payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
  };
}
