import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests unitarios del módulo forecast-alert.
 *
 * Se mockea Prisma + ChatMemoryService para verificar las reglas de negocio
 * sin tocar la BD. Cubre:
 *   1. shouldTriggerAlert: pendiente y R² gate
 *   2. Mensaje del proposal
 *   3. Idempotencia vía cooldown de 7d
 *   4. pendingIntent pre-armed correctamente
 */

// ─── Mocks ────────────────────────────────────────────────────────────────
// Prisma stub: capturamos las llamadas para verificar comportamiento.
const prismaCalls: Array<{ method: string; args: any }> = [];
const findFirstResult: any[] = [];
let upsertResult: any = { id: 'forecast-log-test-id' };

vi.mock('@/lib/db', () => ({
  prisma: {
    portfolioForecastLog: {
      findFirst: vi.fn(async (args: any) => {
        prismaCalls.push({ method: 'findFirst', args });
        return findFirstResult.shift() ?? null;
      }),
      upsert: vi.fn(async (args: any) => {
        prismaCalls.push({ method: 'upsert', args });
        return upsertResult;
      }),
      update: vi.fn(async (args: any) => {
        prismaCalls.push({ method: 'update', args });
        return { id: 'updated' };
      }),
    },
    conversation: { create: vi.fn(async () => ({ id: 'conv-1' })) },
    message: { create: vi.fn(async () => ({ id: 'msg-1' })) },
  },
}));

// ChatMemoryService stub
const memoryCalls: Array<{ method: string; args: any }> = [];
vi.mock('@/lib/chat/chat-memory', () => ({
  ChatMemoryService: class {
    constructor(public tenantId: string) {}
    async getOrCreateConversation(args: any) {
      memoryCalls.push({ method: 'getOrCreateConversation', args });
      return { id: 'conv-test-123', isNew: true };
    }
    async addMessage(args: any) { memoryCalls.push({ method: 'addMessage', args }); }
    async updateContext(id: string, updates: any) {
      memoryCalls.push({ method: 'updateContext', args: { id, updates } });
    }
  },
}));

import { shouldTriggerAlert, triggerPortfolioRenewalsAlert, FORECAST_ALERT_CONSTANTS } from '@/lib/insurance/forecast-alert';

beforeEach(() => {
  prismaCalls.length = 0;
  memoryCalls.length = 0;
  findFirstResult.length = 0;
});

describe('forecast-alert — shouldTriggerAlert (puro)', () => {
  it('dispara cuando slope < 0 y r² > 0.4', () => {
    const r = shouldTriggerAlert(-1000, 0.7);
    expect(r.trigger).toBe(true);
  });

  it('NO dispara con slope >= 0 aunque r² sea alto', () => {
    const r = shouldTriggerAlert(500, 0.9);
    expect(r.trigger).toBe(false);
    expect(r.reason).toBe('slope_non_negative');
  });

  it('NO dispara con slope negativo pero r² <= 0.4 (señal débil)', () => {
    const r = shouldTriggerAlert(-100, 0.3);
    expect(r.trigger).toBe(false);
    expect(r.reason).toBe('r2_too_low');
  });

  it('threshold exacto: r² = 0.4 → NO trigger (estricto, debe ser > 0.4)', () => {
    const r = shouldTriggerAlert(-1, 0.4);
    expect(r.trigger).toBe(false);
    expect(r.reason).toBe('r2_too_low');
  });

  it('cubre los bordes: slope 0 con r² alto → no trigger; slope -1 con r² justo en el umbral → no trigger', () => {
    expect(shouldTriggerAlert(0, 0.5).trigger).toBe(false);
    expect(shouldTriggerAlert(-1, 0.4).trigger).toBe(false);
  });
});

describe('forecast-alert — trigger end-to-end', () => {
  it('slope >= 0 → no toca nada, devuelve reason', async () => {
    const res = await triggerPortfolioRenewalsAlert('tenant-x', 100, 0.9, null);
    expect(res.enviado).toBe(false);
    expect(res.reason).toBe('slope_non_negative');
    expect(memoryCalls.length).toBe(0);
  });

  it('r² bajo → no toca nada', async () => {
    const res = await triggerPortfolioRenewalsAlert('tenant-x', -500, 0.2, null);
    expect(res.enviado).toBe(false);
    expect(res.reason).toBe('r2_too_low');
    expect(memoryCalls.length).toBe(0);
  });

  it('slope<0 y r² alto con cooldown expirado → dispara alerta completa', async () => {
    const res = await triggerPortfolioRenewalsAlert('tenant-x', -800, 0.65, 'forecast-log-test-id');

    expect(res.enviado).toBe(true);
    expect(res.conversationId).toBe('conv-test-123');

    // Verificar idempotencia: buscó log con alerta reciente
    const findFirst = prismaCalls.find(c => c.method === 'findFirst');
    expect(findFirst).toBeDefined();

    // Verificar update del log para marcar alerta enviada
    // (el upsert del forecast log lo hace el route handler ANTES de llamar
    // al trigger; el trigger solo hace update del log existente para anotarlo)
    const update = prismaCalls.find(c => c.method === 'update');
    expect(update).toBeDefined();
    expect(update!.args).toMatchObject({
      where: { id: 'forecast-log-test-id' },
      data: {
        alertaEnviadaAt: expect.any(Date),
        alertaConversacionId: 'conv-test-123',
      },
    });

    // Verificar que se creó la conversación + mensajes + contexto
    const getOrCreate = memoryCalls.find(c => c.method === 'getOrCreateConversation');
    expect(getOrCreate).toBeDefined();
    expect(getOrCreate!.args.externalRef).toBe('portfolio-alert:renewals:tenant-x');
    expect(getOrCreate!.args.channel).toBe('alerts');

    const addMessage = memoryCalls.find(c => c.method === 'addMessage');
    expect(addMessage).toBeDefined();
    expect(addMessage!.args.content).toContain('¿Quieres que');
    expect(addMessage!.args.content).toContain('pólizas sin renovación próxima');
    expect(addMessage!.args.content).toContain('3 acciones');
    expect(addMessage!.args.metadata.source).toBe('forecast-proactive-alert');

    const updateCtx = memoryCalls.find(c => c.method === 'updateContext');
    expect(updateCtx).toBeDefined();
    expect(updateCtx!.args.updates.pendingIntent).toBe('renovaciones_pendientes');
    expect(updateCtx!.args.updates.collectedEntities).toEqual({ dias: '60' });
    expect(updateCtx!.args.updates.missingEntities).toEqual([]);
  });

  it('cooldown activo → devuelve reason already_alerted_cooldown sin tocar memoria', async () => {
    // Simula log reciente con alerta ya enviada
    findFirstResult.push({
      id: 'old-log',
      alertaEnviadaAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // hace 1 día
      alertaConversacionId: 'old-conv',
    });

    const res = await triggerPortfolioRenewalsAlert('tenant-y', -800, 0.65, 'forecast-log-test-id-2');
    expect(res.enviado).toBe(false);
    expect(res.reason).toBe('already_alerted_cooldown');
    expect(res.conversationId).toBe('old-conv');
    // No debió tocar la memoria ni hacer upsert/update del log
    expect(memoryCalls.length).toBe(0);
    const updateAfterCooldown = prismaCalls.find(c => c.method === 'update');
    expect(updateAfterCooldown).toBeUndefined();
  });

  it('error inesperado → reason=error, no rompe al caller', async () => {
    // Hacemos que findFirst explote
    const findFirst = (await import('@/lib/db')).prisma.portfolioForecastLog.findFirst as any;
    findFirst.mockRejectedValueOnce(new Error('DB down'));

    const res = await triggerPortfolioRenewalsAlert('tenant-z', -1, 0.7, 'id');
    expect(res.enviado).toBe(false);
    expect(res.reason).toBe('error');
    expect(res.detail).toContain('DB down');
  });

  it('currentForecastLogId=null: dispara sin marcar el log (modo "dry run")', async () => {
    const res = await triggerPortfolioRenewalsAlert('tenant-w', -1, 0.7, null);
    expect(res.enviado).toBe(true);
    // No debe llamar a update del log
    const updateCall = prismaCalls.find(c => c.method === 'update');
    expect(updateCall).toBeUndefined();
    // Pero sí creó la conversación
    expect(memoryCalls.length).toBeGreaterThan(0);
  });
});

describe('forecast-alert — constantes', () => {
  it('expone el texto del proposal para auditoría/tests E2E', () => {
    expect(FORECAST_ALERT_CONSTANTS.ALERT_PROPOSAL_TEXT).toContain('caída');
    expect(FORECAST_ALERT_CONSTANTS.ALERT_PROPOSAL_TEXT).toContain('renovación próxima');
    expect(FORECAST_ALERT_CONSTANTS.ALERT_PROPOSAL_TEXT).toContain('3 acciones');
  });

  it('cooldown es 7 días', () => {
    expect(FORECAST_ALERT_CONSTANTS.ALERT_COOLDOWN_DAYS).toBe(7);
  });

  it('threshold R² > 0.4 (mayor estricto: excluye el borde)', () => {
    expect(FORECAST_ALERT_CONSTANTS.R2_TRIGGER_THRESHOLD).toBe(0.4);
    // El borde exacto (r²=0.4) NO triggerea: la condición es estrictamente >.
    expect(shouldTriggerAlert(-1, 0.4).trigger).toBe(false);
    expect(shouldTriggerAlert(-1, 0.40001).trigger).toBe(true);
  });

  it('prearmed intent + entities están pre-armados', () => {
    expect(FORECAST_ALERT_CONSTANTS.PREARMED_INTENT).toBe('renovaciones_pendientes');
    expect(FORECAST_ALERT_CONSTANTS.PREARMED_ENTITIES).toEqual({ dias: '60' });
  });
});
