// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  taskFindFirst: vi.fn(),
  taskUpdate: vi.fn(),
  leadFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    task: { findFirst: mocks.taskFindFirst, update: mocks.taskUpdate },
    lead: { findFirst: mocks.leadFindFirst },
    contact: { findFirst: mocks.contactFindFirst },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: { TASK_CREATED: 'TASK_CREATED', TASK_COMPLETED: 'TASK_COMPLETED' },
}));

const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';

beforeEach(() => {
  vi.clearAllMocks();
  // Chat de Telegram → usuario real vía metadata
  mocks.userFindFirst.mockImplementation((args: any) => {
    const where = args?.where || {};
    if (where.metadata || (Array.isArray(where.OR) && where.OR.some((o: any) => o.metadata))) {
      return Promise.resolve({ id: 'user-42' } as any);
    }
    return Promise.resolve(null);
  });
});

describe('reprogramar_tarea — clasificación', () => {
  const c = new IntentClassifierAgent() as any;
  const base = { userId: 'user-1', tenantId: TENANT };

  it('detecta "reprograma la tarea de llamar a Juan para el viernes"', async () => {
    const r = await c.classify({ ...base, message: 'reprograma la tarea de llamar a Juan para el viernes' });
    expect(r.intent).toBe('reprogramar_tarea');
    expect(r.extractedParams?.titulo).toBeTruthy();
    expect(r.extractedParams?.fecha).toBeTruthy();
  });

  it('detecta "mueve la tarea de enviar documento para mañana"', async () => {
    const r = await c.classify({ ...base, message: 'mueve la tarea de enviar documento para mañana' });
    expect(r.intent).toBe('reprogramar_tarea');
  });

  it('no colisiona: "marca como completada la tarea de llamar a Juan" sigue siendo completar_tarea', async () => {
    const r = await c.classify({ ...base, message: 'marca como completada la tarea de llamar a Juan' });
    expect(r.intent).toBe('completar_tarea');
  });

  it('no colisiona: "mueve el portátil de María a Juan" sigue siendo transferir_activo', async () => {
    const r = await c.classify({ ...base, message: 'mueve el portátil de María a Juan' });
    expect(r.intent).toBe('transferir_activo');
  });
});

describe('reprogramar_tarea — ejecución', () => {
  it('reschedule_task resuelve la tarea por título y aplica la fecha', async () => {
    mocks.taskFindFirst.mockResolvedValue({ id: 't1', titulo: 'Llamar a Juan', completada: false } as any);
    mocks.taskUpdate.mockResolvedValue({ id: 't1', titulo: 'Llamar a Juan', fechaVencimiento: new Date() } as any);

    const result = await (skills as any).reschedule_task({
      tenantId: TENANT,
      titulo: 'Llamar a Juan',
      fecha: 'mañana',
      userId: 'telegram:123456',
    });

    expect(mocks.taskFindFirst).toHaveBeenCalled();
    const updateCall = mocks.taskUpdate.mock.calls[0][0];
    expect(updateCall.data.fechaVencimiento).toBeInstanceOf(Date);
    expect(result.titulo).toBe('Llamar a Juan');
  });

  it('reschedule_task rechaza una fecha incomprensible', async () => {
    await expect(
      (skills as any).reschedule_task({
        tenantId: TENANT,
        titulo: 'Llamar a Juan',
        fecha: 'cuando pueda',
        userId: 'telegram:123456',
      })
    ).rejects.toThrow(/No entendí la fecha/);
  });
});

describe('reprogramar_tarea — orquestador y formateador', () => {
  it('formatSkillResult de reschedule_task muestra título y fecha', () => {
    const msg = ExecutionEngine.formatSkillResult('reschedule_task', {
      titulo: 'Llamar a Juan',
      fechaVencimiento: new Date('2026-08-28T12:00:00Z'),
    });
    expect(msg).toContain('Tarea reprogramada');
    expect(msg).toContain('Llamar a Juan');
  });

  it('get_pending_tasks ofrece completar/reprogramar cuando hay vencidas', () => {
    const now = new Date();
    const items = [
      { titulo: 'Llamar a Juan', fechaVencimiento: new Date(now.getTime() - 86400000) }, // ayer
      { titulo: 'Enviar propuesta', fechaVencimiento: new Date(now.getTime() + 86400000) },
    ];
    const msg = ExecutionEngine.formatSkillResult('get_pending_tasks', items);
    expect(msg).toContain('1 vencidas');
    expect(msg).toContain('completa <tarea>');
    expect(msg).toContain('reprograma <tarea> para mañana');
  });

  it('get_pending_tasks sin vencidas no ofrece acciones', () => {
    const now = new Date();
    const items = [
      { titulo: 'Enviar propuesta', fechaVencimiento: new Date(now.getTime() + 86400000) },
    ];
    const msg = ExecutionEngine.formatSkillResult('get_pending_tasks', items);
    expect(msg).not.toContain('completa <tarea>');
  });
});
