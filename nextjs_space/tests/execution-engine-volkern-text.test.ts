import { describe, it, expect, vi } from 'vitest';

// Evita instanciar Prisma al importar el motor
vi.mock('@/lib/db', () => ({ prisma: {} }));

// Mock de los skills de Volkern: solo el que usa el test, devolviendo `text`.
vi.mock('@/lib/skills', () => ({
  skills: {
    authorize_bulk_expenses: vi.fn(async () => ({
      text: '✅ He autorizado *3 gastos* por un total de *120.50 EUR* (VISION-LOCK verificado).',
      details: {
        authorizedCount: 3,
        totalAuthorized: 120.5,
        currency: 'EUR',
        doubtfulCount: 1,
      },
    })),
    summarize_pending_expenses: vi.fn(async () => ({
      message: 'Hay 2 gastos pendientes de autorizar por un total de 45.00 EUR.',
      count: 2,
      total: 45,
    })),
  },
}));

import { ExecutionEngine } from '@/lib/agents/execution-engine';

describe('ExecutionEngine.run — skills de Volkern con text/message', () => {
  it('propaga el text del skill en vez del genérico "Operación completada"', async () => {
    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'authorize_bulk_expenses', params: {} }] },
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'conv-1',
    });

    expect(result.message).toContain('He autorizado *3 gastos*');
    expect(result.message).toContain('120.50 EUR');
    expect(result.message).not.toBe('✅ Operación completada');
    expect(result.error).toBeFalsy();
  });

  it('propaga el message del skill cuando no trae text', async () => {
    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'summarize_pending_expenses', params: {} }] },
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'conv-1',
    });

    expect(result.message).toContain('Hay 2 gastos pendientes');
    expect(result.message).not.toBe('✅ Operación completada');
  });

  it('sigue devolviendo el genérico solo cuando el skill no tiene text ni message', async () => {
    const { skills } = await import('@/lib/skills');
    (skills as any).authorize_bulk_expenses.mockImplementationOnce(async () => ({
      details: { authorizedCount: 0 },
    }));

    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'authorize_bulk_expenses', params: {} }] },
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'conv-1',
    });

    expect(result.message).toBe('✅ Operación completada');
  });

  it('propaga el error del skill (no lo enmascara como "Operación completada")', async () => {
    const { skills } = await import('@/lib/skills');
    (skills as any).authorize_bulk_expenses.mockImplementationOnce(async () => {
      throw new Error('No tienes permisos para autorizar gastos');
    });

    const result = await ExecutionEngine.run({
      plan: { steps: [{ action: 'authorize_bulk_expenses', params: {} }] },
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'conv-1',
    });

    expect(result.message).toContain('No tienes permisos');
    expect(result.error).toBeTruthy();
  });
});
