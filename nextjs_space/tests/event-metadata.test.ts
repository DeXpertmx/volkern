import { describe, it, expect } from 'vitest';
import {
  generateIdempotencyKey,
  extractMetadataForLog,
  EventBuilder,
  createSimpleEvent,
  createDerivedEvent,
  type EnrichedEvent,
} from '@/lib/skills/event-metadata';

// ─── generateIdempotencyKey ──────────────────────────────────────────
describe('generateIdempotencyKey', () => {
  it('debe generar un key con prefijo idem_', () => {
    const key = generateIdempotencyKey('lead_created', 'tenant-1', { email: 'a@b.com' });
    expect(key).toMatch(/^idem_[a-z0-9]+$/);
  });

  it('debe ser determinista para los mismos parámetros', () => {
    const a = generateIdempotencyKey('lead_created', 'tenant-1', { email: 'a@b.com', name: 'Juan' });
    const b = generateIdempotencyKey('lead_created', 'tenant-1', { email: 'a@b.com', name: 'Juan' });
    expect(a).toBe(b);
  });

  it('debe ser independiente del orden de los campos', () => {
    const a = generateIdempotencyKey('lead_created', 'tenant-1', { email: 'a@b.com', name: 'Juan' });
    const b = generateIdempotencyKey('lead_created', 'tenant-1', { name: 'Juan', email: 'a@b.com' });
    expect(a).toBe(b);
  });

  it('debe cambiar si cambia eventType', () => {
    const a = generateIdempotencyKey('lead_created', 't1', { x: 1 });
    const b = generateIdempotencyKey('lead_updated', 't1', { x: 1 });
    expect(a).not.toBe(b);
  });

  it('debe cambiar si cambia tenantId', () => {
    const a = generateIdempotencyKey('lead_created', 't1', { x: 1 });
    const b = generateIdempotencyKey('lead_created', 't2', { x: 1 });
    expect(a).not.toBe(b);
  });

  it('debe cambiar si cambia uniqueFields', () => {
    const a = generateIdempotencyKey('lead_created', 't1', { x: 1 });
    const b = generateIdempotencyKey('lead_created', 't1', { x: 2 });
    expect(a).not.toBe(b);
  });

  it('debe manejar uniqueFields vacío', () => {
    const key = generateIdempotencyKey('test', 't1', {});
    expect(key).toMatch(/^idem_[a-z0-9]+$/);
  });

  it('debe manejar valores string, number, boolean', () => {
    const key = generateIdempotencyKey('test', 't1', { s: 'hola', n: 42, b: true });
    expect(key).toMatch(/^idem_[a-z0-9]+$/);
  });

  it('debe manejar valores anidados', () => {
    const key = generateIdempotencyKey('test', 't1', { obj: { nested: 'value' } });
    expect(key).toMatch(/^idem_[a-z0-9]+$/);
  });
});

// ─── extractMetadataForLog ───────────────────────────────────────────
describe('extractMetadataForLog', () => {
  it('debe excluir payload del resultado', () => {
    const event: EnrichedEvent = {
      metadata: {
        eventId: 'evt-1',
        eventType: 'test',
        eventVersion: '1.0',
        correlationId: 'corr-1',
        source: 'dashboard',
        sourceService: 'volkern-crm',
        tenantId: 't1',
        timestamp: new Date(),
      },
      payload: { sensitive: 'data', secret: 123 },
    };
    const extracted = extractMetadataForLog(event);
    expect(extracted).not.toHaveProperty('payload');
    expect(extracted).not.toHaveProperty('sensitive');
  });

  it('debe incluir metadatos del evento', () => {
    const event: EnrichedEvent = {
      metadata: {
        eventId: 'evt-1',
        eventType: 'test',
        eventVersion: '1.0',
        correlationId: 'corr-1',
        source: 'dashboard',
        sourceService: 'volkern-crm',
        tenantId: 't1',
        timestamp: new Date(),
      },
      payload: { data: 1 },
    };
    const extracted = extractMetadataForLog(event);
    expect(extracted.eventId).toBe('evt-1');
    expect(extracted.eventType).toBe('test');
    expect(extracted.tenantId).toBe('t1');
    expect(extracted.source).toBe('dashboard');
  });

  it('debe incluir payloadType', () => {
    const event: EnrichedEvent = {
      metadata: {
        eventId: 'evt-1',
        eventType: 'test',
        eventVersion: '1.0',
        correlationId: 'corr-1',
        source: 'dashboard',
        sourceService: 'volkern-crm',
        tenantId: 't1',
        timestamp: new Date(),
      },
      payload: { a: 1, b: 2 },
    };
    const extracted = extractMetadataForLog(event);
    expect(extracted.payloadType).toBe('object');
  });

  it('debe incluir payloadKeys para objetos', () => {
    const event: EnrichedEvent = {
      metadata: {
        eventId: 'evt-1',
        eventType: 'test',
        eventVersion: '1.0',
        correlationId: 'corr-1',
        source: 'dashboard',
        sourceService: 'volkern-crm',
        tenantId: 't1',
        timestamp: new Date(),
      },
      payload: { name: 'Juan', email: 'juan@test.com', age: 30 },
    };
    const extracted = extractMetadataForLog(event);
    expect(extracted.payloadKeys).toEqual(['name', 'email', 'age']);
  });

  it('debe manejar payload null', () => {
    const event: EnrichedEvent = {
      metadata: {
        eventId: 'evt-1',
        eventType: 'test',
        eventVersion: '1.0',
        correlationId: 'corr-1',
        source: 'dashboard',
        sourceService: 'volkern-crm',
        tenantId: 't1',
        timestamp: new Date(),
      },
      payload: null,
    };
    const extracted = extractMetadataForLog(event);
    expect(extracted.payloadType).toBe('object');
    expect(extracted.payloadKeys).toEqual([]);
  });
});

// ─── EventBuilder ─────────────────────────────────────────────────────
describe('EventBuilder', () => {
  const minimalPayload = { leadId: 'lead-1', nombre: 'Juan' };

  it('debe construir evento básico con payload', () => {
    const event = new EventBuilder<typeof minimalPayload>('lead_created')
      .withTenant('t1')
      .withPayload(minimalPayload)
      .build();

    expect(event.metadata.eventType).toBe('lead_created');
    expect(event.metadata.tenantId).toBe('t1');
    expect(event.metadata.eventId).toMatch(/^[a-f0-9-]{36}$/);
    expect(event.metadata.eventVersion).toBe('1.0');
    expect(event.metadata.sourceService).toBe('volkern-crm');
    expect(event.payload).toEqual(minimalPayload);
  });

  it('debe lanzar error si falta tenantId', () => {
    expect(() => {
      new EventBuilder('test').withPayload({}).build();
    }).toThrow('Event requires tenantId');
  });

  it('debe lanzar error si falta payload', () => {
    expect(() => {
      new EventBuilder('test').withTenant('t1').build();
    }).toThrow('Event requires payload');
  });

  it('debe generar correlationId si no se proporciona', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withPayload({})
      .build();
    expect(event.metadata.correlationId).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('debe aceptar correlationId explícito', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withCorrelationId('my-custom-id')
      .withPayload({})
      .build();
    expect(event.metadata.correlationId).toBe('my-custom-id');
  });

  it('debe aceptar userId y userEmail', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withUser('user-1', 'user@test.com')
      .withPayload({})
      .build();
    expect(event.metadata.userId).toBe('user-1');
    expect(event.metadata.userEmail).toBe('user@test.com');
  });

  it('debe aceptar source y sourceAction', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withSource('dashboard', 'create_lead')
      .withPayload({})
      .build();
    expect(event.metadata.source).toBe('dashboard');
    expect(event.metadata.sourceAction).toBe('create_lead');
  });

  it('debe aceptar tags acumulativos', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withTags('crm', 'lead')
      .withTags('urgent')
      .withPayload({})
      .build();
    expect(event.metadata.tags).toEqual(['crm', 'lead', 'urgent']);
  });

  it('debe aceptar version explícita', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withVersion('2.0')
      .withPayload({})
      .build();
    expect(event.metadata.eventVersion).toBe('2.0');
  });

  it('debe aceptar causationId y parentEventId', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withCausationId('cause-1')
      .withParentEventId('parent-1')
      .withPayload({})
      .build();
    expect(event.metadata.causationId).toBe('cause-1');
    expect(event.metadata.parentEventId).toBe('parent-1');
  });

  it('debe aceptar idempotencyKey', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withIdempotencyKey('idem_abc')
      .withPayload({})
      .build();
    expect(event.metadata.idempotencyKey).toBe('idem_abc');
  });

  it('buildWithPayload debe ser equivalente a withPayload + build', () => {
    const event = new EventBuilder('test')
      .withTenant('t1')
      .buildWithPayload({ x: 1 });
    expect(event.payload).toEqual({ x: 1 });
    expect(event.metadata.tenantId).toBe('t1');
  });

  it('cada evento debe tener timestamp', () => {
    const before = new Date();
    const event = new EventBuilder('test')
      .withTenant('t1')
      .withPayload({})
      .build();
    const after = new Date();
    expect(event.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.metadata.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ─── createSimpleEvent ────────────────────────────────────────────────
describe('createSimpleEvent', () => {
  it('debe crear evento con tenantId y correlationId', () => {
    const event = createSimpleEvent('test_event', { data: 1 }, 'tenant-x', 'corr-1');
    expect(event.metadata.eventType).toBe('test_event');
    expect(event.metadata.tenantId).toBe('tenant-x');
    expect(event.metadata.correlationId).toBe('corr-1');
    expect(event.metadata.source).toBe('system');
    expect(event.payload).toEqual({ data: 1 });
  });

  it('debe generar correlationId si no se proporciona', () => {
    const event = createSimpleEvent('test_event', { data: 1 }, 'tenant-x');
    expect(event.metadata.correlationId).toMatch(/^[a-f0-9-]{36}$/);
  });
});

// ─── createDerivedEvent ───────────────────────────────────────────────
describe('createDerivedEvent', () => {
  it('debe heredar tenantId y correlationId del padre', () => {
    const parent = createSimpleEvent('parent_event', { orig: true }, 'tenant-x', 'corr-parent');
    const derived = createDerivedEvent('child_event', { derived: true }, parent);

    expect(derived.metadata.tenantId).toBe('tenant-x');
    expect(derived.metadata.correlationId).toBe('corr-parent');
  });

  it('debe establecer causationId y parentEventId al eventId del padre', () => {
    const parent = createSimpleEvent('parent_event', { orig: true }, 'tenant-x');
    const derived = createDerivedEvent('child_event', { derived: true }, parent);

    expect(derived.metadata.causationId).toBe(parent.metadata.eventId);
    expect(derived.metadata.parentEventId).toBe(parent.metadata.eventId);
  });

  it('debe heredar source del padre', () => {
    const parent = createSimpleEvent('parent_event', { orig: true }, 'tenant-x');
    const derived = createDerivedEvent('child_event', { derived: true }, parent);
    expect(derived.metadata.source).toBe('system');
  });

  it('debe tener eventType distinto al del padre', () => {
    const parent = createSimpleEvent('parent_event', { orig: true }, 'tenant-x');
    const derived = createDerivedEvent('child_event', { derived: true }, parent);
    expect(derived.metadata.eventType).toBe('child_event');
    expect(derived.metadata.eventType).not.toBe(parent.metadata.eventType);
  });

  it('debe tener su propio eventId', () => {
    const parent = createSimpleEvent('parent_event', { orig: true }, 'tenant-x');
    const derived = createDerivedEvent('child_event', { derived: true }, parent);
    expect(derived.metadata.eventId).not.toBe(parent.metadata.eventId);
  });

  it('debe copiar el payload correctamente', () => {
    const parent = createSimpleEvent('parent_event', { orig: true }, 'tenant-x');
    const derived = createDerivedEvent('child_event', { nested: [1, 2, 3] }, parent);
    expect(derived.payload).toEqual({ nested: [1, 2, 3] });
  });
});
