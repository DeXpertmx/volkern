import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUserFindFirst, mockLeadFindFirst, mockInteractionCreate, mockNoteCreate } = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockLeadFindFirst: vi.fn(),
  mockInteractionCreate: vi.fn(),
  mockNoteCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mockUserFindFirst },
    lead: { findFirst: mockLeadFindFirst },
    interaction: { create: mockInteractionCreate },
    note: { create: mockNoteCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

import { skills } from '@/lib/skills';

describe('Fix FK creadoPor (WhatsApp pasa userId ficticio)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLeadFindFirst.mockResolvedValue({ id: 'lead-1', email: 'juan@test.com', nombre: 'Juan' });
  });

  it('registrar_interaccion con userId inexistente guarda sin creador (no rompe el FK)', async () => {
    mockUserFindFirst.mockResolvedValue(null); // el userId no es un usuario real
    mockInteractionCreate.mockResolvedValue({ id: 'i1', tipo: 'llamada', contenido: 'Hablamos', creadoPor: null });

    await (skills as any).registrar_interaccion({
      tenantId: 't1',
      email: 'juan@test.com',
      tipo: 'llamada',
      contenido: 'Hablamos sobre el presupuesto',
      userId: 'lead-1', // caso WhatsApp: pasa leadId como userId
    });

    expect(mockInteractionCreate).toHaveBeenCalledTimes(1);
    const data = mockInteractionCreate.mock.calls[0][0].data;
    expect(data.creadoPor).toBeUndefined();
    expect(data.leadId).toBe('lead-1');
  });

  it('registrar_interaccion con userId real conserva el creador', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'user-9' });
    mockInteractionCreate.mockResolvedValue({ id: 'i2', tipo: 'llamada', contenido: 'X', creadoPor: 'user-9' });

    await (skills as any).registrar_interaccion({
      tenantId: 't1',
      email: 'juan@test.com',
      tipo: 'llamada',
      contenido: 'X',
      userId: 'user-9',
    });

    const data = mockInteractionCreate.mock.calls[0][0].data;
    expect(data.creadoPor).toBe('user-9');
  });

  it('create_note con userId inexistente guarda sin creador', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockNoteCreate.mockResolvedValue({ id: 'n1', contenido: 'Nota', creadoPor: null });

    await (skills as any).create_note({
      tenantId: 't1',
      email: 'juan@test.com',
      contenido: 'Llamar después',
      userId: 'lead-1',
    });

    expect(mockNoteCreate).toHaveBeenCalledTimes(1);
    const data = mockNoteCreate.mock.calls[0][0].data;
    expect(data.creadoPor).toBeUndefined();
    expect(data.leadId).toBe('lead-1');
  });
});
