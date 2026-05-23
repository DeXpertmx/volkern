import { describe, it, expect } from 'vitest';
import { translateHubEvent, type TranslatedEvent } from '@/lib/nexus/transformers';

// ─── translateHubEvent ────────────────────────────────────────────────────

describe('translateHubEvent', () => {
  const tenantId = 'tenant_test_123';

  it('debe mapear message_created → message.received', () => {
    const result = translateHubEvent({
      event: 'message_created',
      id: 'evt_001',
      data: {
        id: 'msg_42',
        content: 'Hola mundo',
        channel: 'whatsapp',
        sender: { id: 'contact_99' },
      },
    }, tenantId);

    expect(result.type).toBe('message.received');
    expect(result.tenantId).toBe(tenantId);
    expect(result.data.externalRef).toBe('msg_42');
    expect(result.data.content).toBe('Hola mundo');
    expect(result.data.channel).toBe('whatsapp');
    expect(result.data.contactRef).toBe('contact_99');
    expect(result.data.metadata.source).toBe('nexus');
  });

  it('debe mapear message_updated → message.sent', () => {
    const result = translateHubEvent({
      event: 'message_updated',
      id: 'evt_002',
      data: { id: 'msg_43' },
    }, tenantId);

    expect(result.type).toBe('message.sent');
  });

  it('debe mapear conversation_created → conversation.created', () => {
    const result = translateHubEvent({
      event: 'conversation_created',
      id: 'evt_003',
      data: { id: 'conv_10' },
    }, tenantId);

    expect(result.type).toBe('conversation.created');
  });

  it('debe mapear conversation_updated → conversation.updated', () => {
    const result = translateHubEvent({
      event: 'conversation_updated',
      id: 'evt_004',
      data: { id: 'conv_11' },
    }, tenantId);

    expect(result.type).toBe('conversation.updated');
  });

  it('evento desconocido → message.received (default)', () => {
    const result = translateHubEvent({
      event: 'unknown_event_type',
      id: 'evt_999',
      data: {},
    }, tenantId);

    expect(result.type).toBe('message.received');
  });

  it('si no hay id, genera uno con timestamp', () => {
    const before = Date.now();
    const result = translateHubEvent({
      event: 'message_created',
      data: {},
    }, tenantId);
    const after = Date.now();

    expect(result.id).toMatch(/^evt_\d+$/);
    const ts = parseInt(result.id.replace('evt_', ''), 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('debe usar conversation_id como externalRef si no hay data.id', () => {
    const result = translateHubEvent({
      event: 'message_created',
      data: { conversation_id: 'conv_999' },
    }, tenantId);

    expect(result.data.externalRef).toBe('conv_999');
  });

  it('debe usar inbox.channel_type como channel si no hay data.channel', () => {
    const result = translateHubEvent({
      event: 'message_created',
      data: {
        inbox: { channel_type: 'email' },
      },
    }, tenantId);

    expect(result.data.channel).toBe('email');
  });

  it('data.channel tiene prioridad sobre inbox.channel_type', () => {
    const result = translateHubEvent({
      event: 'message_created',
      data: {
        channel: 'whatsapp',
        inbox: { channel_type: 'email' },
      },
    }, tenantId);

    expect(result.data.channel).toBe('whatsapp');
  });

  it('debe usar contact.id como contactRef si no hay sender', () => {
    const result = translateHubEvent({
      event: 'message_created',
      data: {
        contact: { id: 'contact_55' },
      },
    }, tenantId);

    expect(result.data.contactRef).toBe('contact_55');
  });

  it('sender.id tiene prioridad sobre contact.id', () => {
    const result = translateHubEvent({
      event: 'message_created',
      data: {
        sender: { id: 'sender_1' },
        contact: { id: 'contact_2' },
      },
    }, tenantId);

    expect(result.data.contactRef).toBe('sender_1');
  });

  it('result debe tener la estructura TranslatedEvent completa', () => {
    const result = translateHubEvent({
      event: 'message_created',
      data: { id: 'm1' },
    }, tenantId);

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('tenantId');
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('externalRef');
    expect(result.data).toHaveProperty('metadata');
  });

  it('debe propagar el tenantId correctamente', () => {
    const tid = 'org_acme_v2';
    const result = translateHubEvent({
      event: 'message_created',
      data: {},
    }, tid);
    expect(result.tenantId).toBe(tid);
  });

  it('metadata debe incluir todos los data originales + source nexus', () => {
    const payload = {
      event: 'message_created',
      data: {
        id: 'm_77',
        content: 'test content',
        extra_field: 'extra_value',
      },
    };
    const result = translateHubEvent(payload, tenantId);

    expect(result.data.metadata.id).toBe('m_77');
    expect(result.data.metadata.content).toBe('test content');
    expect(result.data.metadata.extra_field).toBe('extra_value');
    expect(result.data.metadata.source).toBe('nexus');
  });

  it('payload sin data → no lanza error', () => {
    expect(() => translateHubEvent({
      event: 'message_created',
    }, tenantId)).not.toThrow();
  });

  it('payload.data null → no lanza error', () => {
    expect(() => translateHubEvent({
      event: 'message_created',
      data: null,
    } as any, tenantId)).not.toThrow();
  });

  it('determinismo: mismo payload produce misma salida', () => {
    const payload = {
      event: 'message_created',
      id: 'fixed_id',
      data: { id: 'd1', content: 'hola', channel: 'sms' },
    };
    const a = translateHubEvent(payload, tenantId);
    const b = translateHubEvent(payload, tenantId);
    expect(a).toEqual(b);
  });
});
