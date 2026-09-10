import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regresión del Automation Engine:
 *
 * Antes, si la cola de workflows no estaba inicializada, `executeActions`
 * omitía las acciones en silencio y `processEvent` registraba el log como
 * `success`: el motor parecía funcionar y las tareas/mensajes nunca salían.
 *
 * Este test fija el comportamiento correcto: sin cola disponible, la regla
 * debe quedar registrada como `failed` con la causa, no como success.
 */

const mockFindMany = vi.hoisted(() => vi.fn());
const mockLogCreate = vi.hoisted(() => vi.fn());
const mockInitRedis = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    automationRule: { findMany: mockFindMany },
    automationLog: { create: mockLogCreate },
  },
}));
vi.mock('../lib/db', () => ({
  prisma: {
    automationRule: { findMany: mockFindMany },
    automationLog: { create: mockLogCreate },
  },
}));
vi.mock('../lib/core/redis', () => ({
  initRedis: mockInitRedis,
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

describe('AutomationRuleEngine sin cola disponible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogCreate.mockResolvedValue({});
  });

  it('registra failed (no success) cuando Redis no está disponible', async () => {
    mockInitRedis.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([REGLA]);

    await AutomationRuleEngine.processEvent('hospitality_reservation_created', {
      tenantId: 't1',
      reservationId: 'hres_1',
    });

    expect(mockLogCreate).toHaveBeenCalledTimes(1);
    const log = mockLogCreate.mock.calls[0][0].data;
    expect(log.status).toBe('failed');
    expect(String(log.error)).toMatch(/cola/i);
  });

  it('no registra log si no hay reglas que coincidan', async () => {
    mockInitRedis.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);

    await AutomationRuleEngine.processEvent('hospitality_reservation_created', { tenantId: 't1' });

    expect(mockLogCreate).not.toHaveBeenCalled();
  });
});