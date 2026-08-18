// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    conversation: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

const { ChatMemoryService } = await import('@/lib/chat/chat-memory');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatMemoryService.updateContext — collectedEntities se reemplaza, no se fusiona', () => {
  it('pasar collectedEntities: {} limpia el estado obsoleto de turnos anteriores', async () => {
    mocks.findUnique.mockResolvedValue({
      hubMetadata: {
        other: 'keep',
        chatbotContext: {
          collectedEntities: {
            email: 'alevvalverde@gmail.com',
            nombre: 'Alejandra Velázquez',
            registrarContacto: 'true',
          },
          missingEntities: [],
          facts: [],
        },
      },
    });
    mocks.update.mockResolvedValue({});

    const svc = new ChatMemoryService('tenant-1');
    await svc.updateContext('conv-1', {
      pendingIntent: undefined,
      missingEntities: [],
      collectedEntities: {},
    });

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.hubMetadata.chatbotContext.collectedEntities).toEqual({});
    expect(data.hubMetadata.chatbotContext.collectedEntities.email).toBeUndefined();
    // el resto del metadata no se pierde
    expect(data.hubMetadata.other).toBe('keep');
  });

  it('reemplaza con el objeto completo cuando se pasa un nuevo estado', async () => {
    mocks.findUnique.mockResolvedValue({
      hubMetadata: {
        chatbotContext: {
          collectedEntities: { email: 'viejo@x.com' },
          missingEntities: [],
          facts: [],
        },
      },
    });
    mocks.update.mockResolvedValue({});

    const svc = new ChatMemoryService('tenant-1');
    await svc.updateContext('conv-1', {
      collectedEntities: { email: 'nuevo@x.com', nombre: 'Nueva Persona' },
    });

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.hubMetadata.chatbotContext.collectedEntities).toEqual({
      email: 'nuevo@x.com',
      nombre: 'Nueva Persona',
    });
  });

  it('conserva collectedEntities si updates no lo incluye (ej. setMissingEntities)', async () => {
    mocks.findUnique.mockResolvedValue({
      hubMetadata: {
        chatbotContext: {
          collectedEntities: { email: 'persistente@x.com' },
          missingEntities: [],
          facts: [],
        },
      },
    });
    mocks.update.mockResolvedValue({});

    const svc = new ChatMemoryService('tenant-1');
    await svc.updateContext('conv-1', { missingEntities: ['fecha'] });

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.hubMetadata.chatbotContext.collectedEntities).toEqual({ email: 'persistente@x.com' });
  });
});

describe('ChatMemoryService — facts deduplicados y acotados', () => {
  it('deduplica facts al fusionar (addFact pasa el array completo)', async () => {
    mocks.findUnique.mockResolvedValue({
      hubMetadata: {
        chatbotContext: {
          collectedEntities: {},
          missingEntities: [],
          facts: ['A', 'B', 'A', 'B'],
        },
      },
    });
    mocks.update.mockResolvedValue({});

    const svc = new ChatMemoryService('tenant-1');
    await svc.updateContext('conv-1', { facts: ['A', 'B', 'C'] });

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.hubMetadata.chatbotContext.facts).toEqual(['A', 'B', 'C']);
  });

  it('acota facts a los 60 más recientes (sin crecer sin límite)', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `fact-${i}`);
    mocks.findUnique.mockResolvedValue({
      hubMetadata: {
        chatbotContext: { collectedEntities: {}, missingEntities: [], facts: [] },
      },
    });
    mocks.update.mockResolvedValue({});

    const svc = new ChatMemoryService('tenant-1');
    await svc.updateContext('conv-1', { facts: many });

    const data = mocks.update.mock.calls[0][0].data;
    expect(data.hubMetadata.chatbotContext.facts.length).toBe(60);
    expect(data.hubMetadata.chatbotContext.facts[0]).toBe('fact-20');
    expect(data.hubMetadata.chatbotContext.facts[59]).toBe('fact-79');
  });

  it('addFact repetido no duplica el mismo dato (flujo real getContext→updateContext)', async () => {
    let persisted: any = {
      hubMetadata: {
        chatbotContext: { collectedEntities: {}, missingEntities: [], facts: [] },
      },
    };
    mocks.findUnique.mockImplementation(async () => persisted);
    mocks.update.mockImplementation(async ({ data }: any) => {
      persisted = { hubMetadata: data.hubMetadata };
    });

    const svc = new ChatMemoryService('tenant-1');
    for (let i = 0; i < 10; i++) {
      await svc.addFact('conv-1', 'Contacto: Teléfono: +34 915 972 225');
    }

    const lastData = mocks.update.mock.calls[mocks.update.mock.calls.length - 1][0].data;
    expect(lastData.hubMetadata.chatbotContext.facts).toEqual(['Contacto: Teléfono: +34 915 972 225']);
  });
});
