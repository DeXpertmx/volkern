import { describe, it, expect } from 'vitest';
import { translateHubEvent } from '@/lib/nexus/transformers';

describe('nexus/transformers', () => {
  const tenantId = 'tenant-test-12345678901';

  // ============================================================
  // translateHubEvent — message_created → message.received
  // ============================================================
  describe('translateHubEvent — message_created', () => {
    it('debe mapear message_created a message.received', () => {
      const payload = {
        event: 'message_created',
        id: 'evt-001',
        data: {
          id: 12345,
          content: 'Hola, necesito ayuda con mi pedido',
          channel: 'WhatsApp',
          sender: { id: 789 },
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.type).toBe('message.received');
      expect(result.tenantId).toBe(tenantId);
      expect(result.data.content).toBe('Hola, necesito ayuda con mi pedido');
      expect(result.data.channel).toBe('WhatsApp');
      expect(result.data.externalRef).toBe('12345');
      expect(result.data.contactRef).toBe('789');
    });

    it('debe usar conversation_id como externalRef si no hay data.id', () => {
      const payload = {
        event: 'message_created',
        data: {
          conversation_id: 999,
          content: 'Mensaje sin id explícito',
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.data.externalRef).toBe('999');
    });
  });

  // ============================================================
  // translateHubEvent — message_updated → message.sent
  // ============================================================
  describe('translateHubEvent — message_updated', () => {
    it('debe mapear message_updated a message.sent', () => {
      const payload = {
        event: 'message_updated',
        id: 'evt-002',
        data: {
          id: 200,
          content: 'Respuesta automática enviada',
          inbox: { channel_type: 'Email' },
          contact: { id: 300 },
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.type).toBe('message.sent');
      expect(result.data.channel).toBe('Email');
      expect(result.data.contactRef).toBe('300');
    });

    it('debe usar sender.id como fallback para contactRef', () => {
      const payload = {
        event: 'message_updated',
        data: {
          sender: { id: 111 },
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.data.contactRef).toBe('111');
    });

    it('debe preferir sender.id sobre contact.id cuando ambos existen', () => {
      const payload = {
        event: 'message_created',
        data: {
          sender: { id: 111 },
          contact: { id: 222 },
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.data.contactRef).toBe('111');
    });
  });

  // ============================================================
  // translateHubEvent — conversation_created
  // ============================================================
  describe('translateHubEvent — conversation_created', () => {
    it('debe mapear conversation_created a conversation.created', () => {
      const payload = {
        event: 'conversation_created',
        id: 'conv-001',
        data: {
          conversation_id: 500,
          channel: 'Facebook',
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.type).toBe('conversation.created');
      expect(result.data.externalRef).toBe('500');
    });
  });

  // ============================================================
  // translateHubEvent — conversation_updated
  // ============================================================
  describe('translateHubEvent — conversation_updated', () => {
    it('debe mapear conversation_updated a conversation.updated', () => {
      const payload = {
        event: 'conversation_updated',
        id: 'conv-002',
        data: {
          id: 600,
          channel: 'Instagram',
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.type).toBe('conversation.updated');
    });
  });

  // ============================================================
  // translateHubEvent — evento desconocido
  // ============================================================
  describe('translateHubEvent — evento desconocido', () => {
    it('debe usar message.received como fallback para eventos desconocidos', () => {
      const payload = {
        event: 'evento_inexistente',
        data: { id: 999 },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.type).toBe('message.received');
    });

    it('debe usar message.received cuando no hay event', () => {
      const payload = { data: { id: 888 } };
      const result = translateHubEvent(payload, tenantId);
      expect(result.type).toBe('message.received');
    });
  });

  // ============================================================
  // translateHubEvent — metadata
  // ============================================================
  describe('translateHubEvent — metadata', () => {
    it('debe incluir source: nexus en metadata', () => {
      const payload = {
        event: 'message_created',
        data: { id: 1, content: 'test' },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.data.metadata.source).toBe('nexus');
    });

    it('debe copiar todo el payload.data en metadata', () => {
      const payload = {
        event: 'message_created',
        data: {
          id: 1,
          content: 'test',
          customField: 'valor-especial',
          attachments: [{ url: 'file.pdf' }],
        },
      };

      const result = translateHubEvent(payload, tenantId);
      expect(result.data.metadata.id).toBe(1);
      expect(result.data.metadata.content).toBe('test');
      expect(result.data.metadata.customField).toBe('valor-especial');
      expect(result.data.metadata.attachments).toEqual([{ url: 'file.pdf' }]);
    });
  });

  // ============================================================
  // translateHubEvent — generación de ID
  // ============================================================
  describe('translateHubEvent — generación de ID', () => {
    it('debe usar el ID del payload si existe', () => {
      const payload = { event: 'message_created', id: 'custom-id-xyz', data: {} };
      const result = translateHubEvent(payload, tenantId);
      expect(result.id).toBe('custom-id-xyz');
    });

    it('debe generar un ID con prefijo evt_ si no hay id en payload', () => {
      const payload = { event: 'message_created', data: {} };
      const result = translateHubEvent(payload, tenantId);
      expect(result.id).toMatch(/^evt_\d+$/);
    });
  });
});
