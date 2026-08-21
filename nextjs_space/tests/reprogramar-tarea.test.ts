// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  taskUpdate: vi.fn(),
  leadFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique },
    task: { findFirst: mocks.taskFindFirst, findMany: mocks.taskFindMany, update: mocks.taskUpdate },
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

describe('snooze_task (recordar más tarde)', () => {
  it('snooze_task por taskId pospone el recordatorio sin tocar la fecha real', async () => {
    mocks.taskFindFirst.mockResolvedValue({ id: 't1', titulo: 'Llamar a Juan', completada: false } as any);
    mocks.taskUpdate.mockResolvedValue({
      id: 't1',
      titulo: 'Llamar a Juan',
      fechaVencimiento: new Date('2026-08-21T18:00:00Z'),
      recordatorioPospuestoHasta: new Date('2026-08-22T00:00:00Z'),
    } as any);

    const result = await (skills as any).snooze_task({
      tenantId: TENANT,
      taskId: 't1',
      hasta: '2026-08-22',
      userId: 'telegram:123456',
    });

    const updateCall = mocks.taskUpdate.mock.calls[0][0];
    expect(updateCall.data.recordatorioPospuestoHasta).toBeInstanceOf(Date);
    expect(updateCall.data.fechaVencimiento).toBeUndefined(); // no toca la fecha real
    expect(result.recordatorioPospuestoHasta).toBeInstanceOf(Date);
  });

  it('snooze_task resuelve por título y rechaza tarea ya completada', async () => {
    mocks.taskFindFirst.mockResolvedValue({ id: 't1', titulo: 'Llamar a Juan', completada: true } as any);
    await expect(
      (skills as any).snooze_task({
        tenantId: TENANT,
        titulo: 'Llamar a Juan',
        hasta: 'mañana',
        userId: 'telegram:123456',
      })
    ).rejects.toThrow(/ya completada/);
  });

  it('las consultas de pendientes/vencidas/hoy excluyen tareas snoozeadas (OR con recordatorioPospuestoHasta)', async () => {
    mocks.taskFindMany.mockResolvedValue([] as any);
    await (skills as any).get_pending_tasks({ tenantId: TENANT, userId: 'telegram:123456' });
    const pendingWhere = mocks.taskFindMany.mock.calls[0][0].where;
    expect(pendingWhere.OR).toEqual([
      { recordatorioPospuestoHasta: null },
      { recordatorioPospuestoHasta: { lte: expect.any(Date) } },
    ]);

    await (skills as any).get_overdue_tasks({ tenantId: TENANT, userId: 'telegram:123456' });
    const overdueWhere = mocks.taskFindMany.mock.calls[1][0].where;
    expect(overdueWhere.OR).toBeDefined();

    mocks.userFindUnique.mockResolvedValue({ timezone: 'America/Mexico_City' } as any);
    await (skills as any).get_tasks_due_today({ tenantId: TENANT, userId: 'telegram:123456' });
    const todayWhere = mocks.taskFindMany.mock.calls[2][0].where;
    expect(todayWhere.OR).toBeDefined();
  });
});

describe('tareas_vencidas — clasificación', () => {
  const c = new IntentClassifierAgent() as any;
  const base = { userId: 'user-1', tenantId: TENANT };

  it('detecta "qué tareas tengo vencidas" → tareas_vencidas', async () => {
    const r = await c.classify({ ...base, message: 'qué tareas tengo vencidas' });
    expect(r.intent).toBe('tareas_vencidas');
  });

  it('detecta "muéstrame mis tareas atrasadas" → tareas_vencidas', async () => {
    const r = await c.classify({ ...base, message: 'muéstrame mis tareas atrasadas' });
    expect(r.intent).toBe('tareas_vencidas');
  });

  it('"qué tareas tengo pendientes" sigue siendo mis_tareas (no vencidas)', async () => {
    const r = await c.classify({ ...base, message: 'qué tareas tengo pendientes' });
    expect(r.intent).toBe('mis_tareas');
  });
});

describe('tareas_vencidas — ejecución', () => {
  it('get_overdue_tasks filtra solo vencidas con días de retraso y userId real', async () => {
    const now = Date.now();
    mocks.taskFindMany.mockResolvedValue([
      { id: 't1', titulo: 'Llamar a Juan', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date(now - 3 * 86400000), descripcion: 'Confirmar presupuesto', lead: { nombre: 'Juan' } },
      { id: 't2', titulo: 'Enviar propuesta', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date(now + 86400000) }, // NO vencida
    ] as any);

    const result = await (skills as any).get_overdue_tasks({ tenantId: TENANT, userId: 'telegram:123456' });

    expect(mocks.taskFindMany.mock.calls[0][0].where.asignadoA).toBe('user-42');
    expect(result.length).toBe(1);
    expect(result[0].titulo).toBe('Llamar a Juan');
    expect(result[0].diasVencida).toBeGreaterThanOrEqual(1);
  });

  it('get_overdue_tasks sin vencidas devuelve lista vacía', async () => {
    mocks.taskFindMany.mockResolvedValue([
      { id: 't2', titulo: 'Enviar propuesta', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date(Date.now() + 86400000) },
    ] as any);
    const result = await (skills as any).get_overdue_tasks({ tenantId: TENANT, userId: 'telegram:123456' });
    expect(result.length).toBe(0);
  });
});

describe('tareas_hoy — clasificación', () => {
  const c = new IntentClassifierAgent() as any;
  const base = { userId: 'user-1', tenantId: TENANT };

  it('detecta "qué tareas vencen hoy" → tareas_hoy', async () => {
    const r = await c.classify({ ...base, message: 'qué tareas vencen hoy' });
    expect(r.intent).toBe('tareas_hoy');
  });

  it('detecta "mis tareas de hoy" → tareas_hoy', async () => {
    const r = await c.classify({ ...base, message: 'mis tareas de hoy' });
    expect(r.intent).toBe('tareas_hoy');
  });

  it('detecta "qué tareas tengo para hoy" → tareas_hoy (no mis_tareas)', async () => {
    const r = await c.classify({ ...base, message: 'qué tareas tengo para hoy' });
    expect(r.intent).toBe('tareas_hoy');
  });

  it('"qué tareas tengo pendientes" sigue siendo mis_tareas (no hoy)', async () => {
    const r = await c.classify({ ...base, message: 'qué tareas tengo pendientes' });
    expect(r.intent).toBe('mis_tareas');
  });

  it('no colisiona con crear_tarea: "crea una tarea para hoy: llamar a Juan"', async () => {
    const r = await c.classify({ ...base, message: 'crea una tarea para hoy: llamar a Juan' });
    expect(r.intent).toBe('crear_tarea');
  });
});

describe('tareas_hoy — ejecución', () => {
  it('get_tasks_due_today filtra solo las que vencen en el día y resuelve userId real', async () => {
    const now = Date.now();
    mocks.userFindUnique.mockResolvedValue({ timezone: 'America/Mexico_City' } as any);
    mocks.taskFindMany.mockResolvedValue([
      { id: 't1', titulo: 'Enviar propuesta', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date(now + 3 * 3600000), descripcion: 'Firmar contrato', lead: { nombre: 'Juan' } },
      { id: 't2', titulo: 'Llamar a Juan', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date(now + 20 * 3600000) },
    ] as any);

    const result = await (skills as any).get_tasks_due_today({ tenantId: TENANT, userId: 'telegram:123456' });

    expect(mocks.taskFindMany.mock.calls[0][0].where.asignadoA).toBe('user-42');
    // El filtro de fecha usa gte/lt (rango del día en la tz del usuario)
    const where = mocks.taskFindMany.mock.calls[0][0].where;
    expect(where.fechaVencimiento.gte).toBeInstanceOf(Date);
    expect(where.fechaVencimiento.lt).toBeInstanceOf(Date);
    expect(result.length).toBe(2);
    expect(result[0].titulo).toBe('Enviar propuesta');
  });

  it('get_tasks_due_today sin tareas hoy devuelve lista vacía', async () => {
    mocks.userFindUnique.mockResolvedValue({ timezone: 'America/Mexico_City' } as any);
    mocks.taskFindMany.mockResolvedValue([]);
    const result = await (skills as any).get_tasks_due_today({ tenantId: TENANT, userId: 'telegram:123456' });
    expect(result.length).toBe(0);
  });
});

describe('tareas_hoy — formateador', () => {
  it('formatSkillResult de get_tasks_due_today lista con hora y motivo', () => {
    const msg = ExecutionEngine.formatSkillResult('get_tasks_due_today', [
      { titulo: 'Enviar propuesta', fechaVencimiento: new Date(Date.now() + 3 * 3600000), descripcion: 'Firmar contrato', lead: { nombre: 'Juan' } },
    ]);
    expect(msg).toContain('Tareas que vencen hoy (1)');
    expect(msg).toContain('Enviar propuesta');
    expect(msg).toContain('vence hoy a las');
    expect(msg).toContain('Firmar contrato');
    expect(msg).toContain('completa <tarea>');
  });

  it('formatSkillResult de get_tasks_due_today sin tareas responde al día', () => {
    const msg = ExecutionEngine.formatSkillResult('get_tasks_due_today', []);
    expect(msg).toContain('No tienes tareas que venzan hoy');
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

  it('formatSkillResult de get_overdue_tasks lista vencidas con motivo y fecha', () => {
    const msg = ExecutionEngine.formatSkillResult('get_overdue_tasks', [
      { titulo: 'Llamar a Juan', fechaVencimiento: new Date(Date.now() - 2 * 86400000), diasVencida: 2, descripcion: 'Confirmar presupuesto', lead: { nombre: 'Juan' } },
    ]);
    expect(msg).toContain('Tareas vencidas (1)');
    expect(msg).toContain('Llamar a Juan');
    expect(msg).toContain('Confirmar presupuesto');
    expect(msg).toContain('completa <tarea>');
  });

  it('formatSkillResult de get_overdue_tasks sin vencidas responde al día', () => {
    const msg = ExecutionEngine.formatSkillResult('get_overdue_tasks', []);
    expect(msg).toContain('No tienes tareas vencidas');
  });
});
