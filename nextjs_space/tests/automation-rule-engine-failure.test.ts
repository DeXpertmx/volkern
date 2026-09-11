import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regresión del Automation Engine:
 *
 * Antes, si la cola de workflows no estaba inicializada, `executeActions`
 * omitía las acciones en silencio y `processEvent` registraba el log como
 * `success`: el motor parecía funcionar y las tareas/mensajes nunca salían.
 *
 * Ahora el motor registra la ejecución como `queued` (nunca como éxito) y
 * pasa el id del log al job para que el worker escriba el resultado real.
 * Sin cola disponible la ejecución queda `failed` con su causa.
 */

const mockFindMany = vi.hoisted(() => vi.fn());
const mockLogCreate = vi.hoisted(() => vi.fn());
const mockLogUpdate = vi.hoisted(() => vi.fn());
const mockInitRedis = vi.hoisted(() => vi.fn());
const mockQueueAdd = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    automationRule: { findMany: mockFindMany },
    automationLog: { create: mockLogCreate, update: mockLogUpdate },
  },
}));
vi.mock('../lib/db', () => ({
  prisma: {
    automationRule: { findMany: mockFindMany },
    automationLog: { create: mockLogCreate, update: mockLogUpdate },
  },
}));
vi.mock('../lib/core/redis', () => ({
  initRedis: mockInitRedis,
}));
vi.mock('bullmq', () => ({
  Queue: class {
    on() {}
    add(...args: any[]) {
      return mockQueueAdd(...args);
    }
  },
}));

import { AutomationRuleEngine } from '../lib/marketing/automation/rule-engine';

const REGLA = {
  id: 'ar1',
  tenantId: 't1',
  name: 'Preparar estancia al reservar',
  triggerType: 'hospitality_reservation_created',
  conditions: {},
  actions: [{ type: 'CREATE_HOSPITALITY_TASK' }],
  isActive: true,
};

describe('AutomationRuleEngine — resultado real de la ejecución', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogCreate.mockResolvedValue({ id: 'log1' });
    mockLogUpdate.mockResolvedValue({});
    mockQueueAdd.mockResolvedValue({ id: 'job1' });
  });

  it('registra failed (no success) cuando Redis no está disponible', async () => {
    mockInitRedis.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([REGLA]);

    await AutomationRuleEngine.processEvent('hospitality_reservation_created', {
      tenantId: 't1',
      reservationId: 'hres_1',
    });

    // El log se crea como encolado y luego se corrige a failed con la causa.
    expect(mockLogCreate).toHaveBeenCalledTimes(1);
    const creado = mockLogCreate.mock.calls[0][0].data;
    expect(creado.status).toBe('queued');
    expect(creado.entityId).toBe('hres_1');

    expect(mockLogUpdate).toHaveBeenCalledTimes(1);
    const actualizado = mockLogUpdate.mock.calls[0][0];
    expect(actualizado.where).toEqual({ id: 'log1' });
    expect(actualizado.data.status).toBe('failed');
    expect(String(actualizado.data.error)).toMatch(/cola/i);
  });

  it('no registra éxito prematuro: encola y deja el resultado al worker', async () => {
    mockInitRedis.mockResolvedValue({});
    mockFindMany.mockResolvedValue([REGLA]);

    await AutomationRuleEngine.processEvent('hospitality_reservation_created', {
      tenantId: 't1',
      reservationId: 'hres_2',
    });

    const creado = mockLogCreate.mock.calls[0][0].data;
    expect(creado.status).toBe('queued');

    // El job viaja con el id del log para que el worker lo cierre.
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [, jobData] = mockQueueAdd.mock.calls[0];
    expect(jobData.logId).toBe('log1');
    expect(jobData.actions).toEqual(REGLA.actions);

    // Nada se marca como exitoso ni fallido al encolar.
    expect(mockLogUpdate).not.toHaveBeenCalled();
  });

  it('no registra log si no hay reglas que coincidan', async () => {
    mockInitRedis.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);

    await AutomationRuleEngine.processEvent('hospitality_reservation_created', { tenantId: 't1' });

    expect(mockLogCreate).not.toHaveBeenCalled();
    expect(mockLogUpdate).not.toHaveBeenCalled();
  });
});
