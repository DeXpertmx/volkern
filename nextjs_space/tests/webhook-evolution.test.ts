import { describe, it, expect, vi } from 'vitest';

// Mock prisma and chatbot-engine to prevent side effects from route module imports
vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    chatbotConfig: { findUnique: vi.fn() },
    integration: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/chatbot-engine', () => ({
  processChatbotMessage: vi.fn(),
}));

import { parseEvolutionMessage } from '@/app/api/webhooks/evolution/route';

describe('Evolution Webhook — parseEvolutionMessage', () => {
  // ============================================================
  // Formato messages.upsert
  // ============================================================
  describe('formato messages.upsert', () => {
    it('debe parsear mensaje entrante con conversation text', () => {
      const body = {
        event: 'messages.upsert',
        instance: 'volkern-tenant-1',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'BAE5F6A1B2C3',
            },
            pushName: 'Juan Pérez',
            message: {
              conversation: 'Hola, me interesa el servicio premium',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('BAE5F6A1B2C3');
      expect(result!.from).toBe('5215512345678');
      expect(result!.fromName).toBe('Juan Pérez');
      expect(result!.message).toBe('Hola, me interesa el servicio premium');
      expect(result!.direction).toBe('incoming');
    });

    it('debe parsear mensaje saliente (fromMe: true)', () => {
      const body = {
        event: 'messages.upsert',
        instance: 'volkern-tenant-1',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: true,
              id: 'OUT_123',
            },
            pushName: 'CRM Bot',
            message: {
              conversation: 'Gracias por tu mensaje. Te atenderemos pronto.',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('outgoing');
      expect(result!.message).toBe('Gracias por tu mensaje. Te atenderemos pronto.');
    });

    it('debe extraer texto de extendedTextMessage', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215598765432@s.whatsapp.net',
              fromMe: false,
              id: 'EXT_456',
            },
            pushName: 'María García',
            message: {
              extendedTextMessage: {
                text: 'Este es un mensaje largo que excede el límite de conversation',
              },
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Este es un mensaje largo que excede el límite de conversation');
      expect(result!.from).toBe('5215598765432');
    });

    it('debe extraer caption de imageMessage', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215511122233@s.whatsapp.net',
              fromMe: false,
              id: 'IMG_789',
            },
            pushName: 'Carlos López',
            message: {
              imageMessage: {
                caption: 'Mira esta foto del producto',
                url: 'https://example.com/image.jpg',
              },
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Mira esta foto del producto');
      expect(result!.id).toBe('IMG_789');
    });

    it('debe extraer caption de documentMessage', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215544433322@s.whatsapp.net',
              fromMe: false,
              id: 'DOC_001',
            },
            pushName: 'Ana Martínez',
            message: {
              documentMessage: {
                caption: 'Te envío el contrato firmado',
                fileName: 'contrato.pdf',
              },
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Te envío el contrato firmado');
    });

    it('debe extraer caption de videoMessage', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215566677788@s.whatsapp.net',
              fromMe: false,
              id: 'VID_002',
            },
            pushName: 'Pedro Sánchez',
            message: {
              videoMessage: {
                caption: 'Demostración del producto',
              },
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Demostración del producto');
    });
  });

  // ============================================================
  // Formato array data (alternativo)
  // ============================================================
  describe('formato array data', () => {
    it('debe parsear cuando data es un array sin event', () => {
      const body = {
        data: [
          {
            key: {
              remoteJid: '5215599900011@s.whatsapp.net',
              fromMe: false,
              id: 'ARR_123',
            },
            pushName: 'Usuario Array',
            message: {
              conversation: 'Mensaje desde array data',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Mensaje desde array data');
      expect(result!.from).toBe('5215599900011');
    });
  });

  // ============================================================
  // Formato directo (key/message en el root)
  // ============================================================
  describe('formato directo key/message', () => {
    it('debe parsear cuando key y message están en el body directamente', () => {
      const body = {
        key: {
          remoteJid: '5215588877766@s.whatsapp.net',
          fromMe: false,
          id: 'DIR_456',
        },
        pushName: 'Usuario Directo',
        message: {
          conversation: 'Mensaje directo sin wrapper',
        },
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Mensaje directo sin wrapper');
      expect(result!.id).toBe('DIR_456');
    });
  });

  // ============================================================
  // Formato con from en vez de key.remoteJid
  // ============================================================
  describe('formato alternativo con from', () => {
    it('debe usar from como fallback si no hay key.remoteJid', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            from: '5215512312312@s.whatsapp.net',
            fromMe: false,
            id: 'FROM_001',
            pushName: 'Usuario From',
            message: {
              conversation: 'Mensaje con campo from',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('5215512312312');
    });
  });

  // ============================================================
  // Filtrado de mensajes del sistema
  // ============================================================
  describe('filtrado de mensajes del sistema', () => {
    it('debe filtrar mensajes de "This message was deleted"', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'DEL_001',
            },
            pushName: 'Usuario',
            message: {
              conversation: 'This message was deleted',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).toBeNull();
    });

    it('debe filtrar mensajes de "missed voice call"', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'CALL_001',
            },
            pushName: 'Usuario',
            message: {
              conversation: 'missed voice call',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).toBeNull();
    });

    it('debe filtrar mensajes de "missed video call"', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'VCALL_001',
            },
            pushName: 'Usuario',
            message: {
              conversation: 'missed video call',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).toBeNull();
    });

    it('NO debe filtrar mensaje normal que contenga "call" parcialmente', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'NORM_001',
            },
            pushName: 'Usuario',
            message: {
              conversation: 'Quiero información sobre el call center',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Quiero información sobre el call center');
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================
  describe('edge cases', () => {
    it('debe devolver null para payload vacío', () => {
      expect(parseEvolutionMessage({})).toBeNull();
    });

    it('debe devolver null para null', () => {
      expect(parseEvolutionMessage(null)).toBeNull();
    });

    it('debe devolver null para undefined', () => {
      expect(parseEvolutionMessage(undefined)).toBeNull();
    });

    it('debe devolver null si no hay número de teléfono', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              fromMe: false,
              id: 'NO_PHONE',
            },
            pushName: 'Sin Teléfono',
            message: {
              conversation: 'Hola',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).toBeNull();
    });

    it('debe devolver null si no hay texto en el mensaje', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'NO_TEXT',
            },
            pushName: 'Sin Texto',
            message: {
              // sin conversation ni extendedTextMessage ni caption
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).toBeNull();
    });

    it('debe limpiar el sufijo @s.whatsapp.net del remoteJid', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'CLEAN_001',
            },
            pushName: 'Usuario',
            message: {
              conversation: 'Test de limpieza',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('5215512345678');
      expect(result!.from).not.toContain('@');
    });

    it('debe limpiar el sufijo @c.us del remoteJid', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215598765432@c.us',
              fromMe: false,
              id: 'CUS_001',
            },
            pushName: 'Usuario C',
            message: {
              conversation: 'Test @c.us',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('5215598765432');
    });

    it('debe generar ID fallback si no hay key.id ni id', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
            },
            pushName: 'Sin ID',
            message: {
              conversation: 'Mensaje sin ID',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.id).toMatch(/^evo_\d+$/);
    });

    it('debe manejar pushName vacío', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'NO_NAME',
            },
            message: {
              conversation: 'Hola sin nombre',
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.fromName).toBe('');
    });

    it('debe manejar mensaje con body en vez de message', () => {
      const body = {
        data: [
          {
            from: '5215599900011@s.whatsapp.net',
            fromMe: false,
            id: 'BODY_001',
            pushName: 'Usuario Body',
            body: 'Mensaje con campo body',
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Mensaje con campo body');
    });

    it('debe manejar data como objeto (no array)', () => {
      const body = {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: false,
            id: 'OBJ_001',
          },
          pushName: 'Usuario Objeto',
          message: {
            conversation: 'Mensaje desde data objeto',
          },
        },
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Mensaje desde data objeto');
      expect(result!.from).toBe('5215512345678');
    });

    it('debe priorizar conversation sobre caption', () => {
      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'PRIO_001',
            },
            pushName: 'Usuario',
            message: {
              conversation: 'Texto principal',
              imageMessage: {
                caption: 'Caption de imagen',
              },
            },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Texto principal');
    });

    it('debe incluir timestamp en el resultado', () => {
      const before = new Date().toISOString();

      const body = {
        event: 'messages.upsert',
        data: [
          {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'TS_001',
            },
            pushName: 'Usuario',
            message: { conversation: 'Test timestamp' },
          },
        ],
      };

      const result = parseEvolutionMessage(body);
      expect(result).not.toBeNull();
      expect(result!.timestamp).toBeDefined();
      expect(new Date(result!.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime(),
      );
    });
  });
});
