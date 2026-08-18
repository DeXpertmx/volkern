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
