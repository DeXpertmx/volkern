import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cierre de ejecuciones colgadas.
 *
 * Si el worker está caído (o Redis dejó de aceptar jobs), el log se queda en
 * `queued`/`running`: en la UI parecería una ejecución en curso cuando en
 * realidad nunca se ejecutó. El barrido lo cierra como `failed` con la causa.
 */

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockClaimsDeleteMany = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    automationLog: { findMany: mockFindMany, update: mockUpdate },
    automationActionExecution: { deleteMany: mockClaimsDeleteMany },
  },
}));
vi.mock('../lib/db', () => ({
  prisma: {
    automationLog: { findMany: mockFindMany, update: mockUpdate },
    automationActionExecution: { deleteMany: mockClaimsDeleteMany },
  },
}));

import { runAutomationSweep, STUCK_EXECUTION_MINUTES } from '../lib/cron/automation-sweep';

describe('runAutomationSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
    mockClaimsDeleteMany.mockResolvedValue({ count: 0 });
  });

  it('no toca nada cuando no hay ejecuciones colgadas', async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await runAutomationSweep();

    expect(res).toEqual({ revisadas: 0, cerradas: 0, reclamacionesLiberadas: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('cierra como failed una ejecución encolada conservando su detalle', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'log1', status: 'queued', result: { message: 'Acciones encoladas', actions: ['CREATE_HOSPITALITY_TASK'] } },
    ]);

    const res = await runAutomationSweep();

    expect(res).toEqual({ revisadas: 1, cerradas: 1, reclamacionesLiberadas: 0 });
    const update = mockUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'log1' });
    expect(update.data.status).toBe('failed');
    expect(String(update.data.error)).toMatch(new RegExp(`${STUCK_EXECUTION_MINUTES} min`));
    expect(update.data.result.actions).toEqual(['CREATE_HOSPITALITY_TASK']);
    expect(update.data.result.staleClosedAt).toBeTruthy();
  });

  it('distingue una ejecución que el worker empezó y no cerró', async () => {
    mockFindMany.mockResolvedValue([{ id: 'log2', status: 'running', result: null }]);

    await runAutomationSweep();

    expect(String(mockUpdate.mock.calls[0][0].data.result.message)).toMatch(/no la cerró/i);
  });

  it('un log que falla al cerrarse no impide cerrar el resto', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'log3', status: 'queued', result: null },
      { id: 'log4', status: 'queued', result: null },
    ]);
    mockUpdate.mockRejectedValueOnce(new Error('db caída')).mockResolvedValue({});

    const res = await runAutomationSweep();

    expect(res).toEqual({ revisadas: 2, cerradas: 1, reclamacionesLiberadas: 0 });
  });

  it('libera las reclamaciones de idempotencia que quedaron a medias', async () => {
    mockFindMany.mockResolvedValue([]);
    mockClaimsDeleteMany.mockResolvedValue({ count: 3 });

    const res = await runAutomationSweep();

    expect(res.reclamacionesLiberadas).toBe(3);
    const where = mockClaimsDeleteMany.mock.calls[0][0].where;
    expect(where.estado).toBe('claimed');
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('si no se pueden liberar reclamaciones el barrido de logs sigue funcionando', async () => {
    mockClaimsDeleteMany.mockRejectedValueOnce(new Error('db caída'));
    mockFindMany.mockResolvedValue([{ id: 'log5', status: 'queued', result: null }]);

    const res = await runAutomationSweep();

    expect(res.reclamacionesLiberadas).toBe(0);
    expect(res.cerradas).toBe(1);
  });
});
