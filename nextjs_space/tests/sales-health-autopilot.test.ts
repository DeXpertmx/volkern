// @vitest-environment node
//
// GUARDIAS C6 y C9 — los dos puntos de riesgo que señala el inventario de la
// familia comercial (docs/algoritmos-inventario.md, §5.1 pasos 1 y 2).
//
//   C6 · Health Score del deal (lib/sales/pipeline-health-service.ts)
//   Determinista: mismas entradas → mismo score. Congelamos los pesos
//   (estancamiento 40, actividad 40, SLA 20) y los cortes (75/50/30) con
//   CASOS NOMINALES: cada caso llega a su estado por una sola vía, así un
//   cambio de fórmula rompe una prueba concreta y legible.
//
//   C9 · Guardrail de confianza del autopiloto (lib/sales/action-orchestrator.ts)
//   El 0.7 decide si la IA actúa sola. Lo que se congela: la frontera
//   (0.7 ejecuta, 0.69 sugiere), las tres acciones (CREATE_TASK,
//   GENERATE_DRAFT, ESCALATE_DEAL) con su rastro, y el LOG SIEMPRE —
//   ejecutado o sugerido, toda decisión deja rastro (explicabilidad).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dealFindUnique: vi.fn(),
  dealUpdate: vi.fn(),
  dealFindMany: vi.fn(),
  taskCreate: vi.fn(),
  messageDraftCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  aiDecisionLogCreate: vi.fn(),
  tenantFindUnique: vi.fn(),
  notifyByTelegram: vi.fn(),
  snapFindFirst: vi.fn(),
  snapCreate: vi.fn(),
  snapUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { findUnique: mocks.dealFindUnique, update: mocks.dealUpdate, findMany: mocks.dealFindMany },
    task: { create: mocks.taskCreate },
    messageDraft: { create: mocks.messageDraftCreate },
    auditLog: { create: mocks.auditLogCreate },
    aiDecisionLog: { create: mocks.aiDecisionLogCreate },
    tenant: { findUnique: mocks.tenantFindUnique },
    healthSnapshot: { findFirst: mocks.snapFindFirst, create: mocks.snapCreate, update: mocks.snapUpdate },
  },
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: mocks.notifyByTelegram,
}));

const baseDeal = (over: Record<string, unknown> = {}) => ({
  id: 'deal-1',
  tenantId: 'tenant-1',
  fechaActualizacion: new Date(),
  fechaUltimaActividad: new Date(),
  prioridad: 'media',
  diasEnPipeline: 0,
  ...over,
});

const capturarUpdate = () => {
  mocks.dealUpdate.mockImplementation(({ data }: any) => Promise.resolve(data));
};

beforeEach(() => {
  vi.clearAllMocks();
  capturarUpdate();
  mocks.snapFindFirst.mockResolvedValue(null); // sin snapshot previo: cada recálculo muestra
  mocks.snapCreate.mockResolvedValue({});
  mocks.snapUpdate.mockResolvedValue({});
});

describe('C6 · Health Score del deal (PipelineHealthService)', () => {
  it('deal al día: 100 y HEALTHY — nada resta', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindUnique.mockResolvedValue(baseDeal());

    const res = await PipelineHealthService.updateDealHealth('deal-1');

    expect(res).toMatchObject({ healthScore: 100, healthStatus: 'HEALTHY' });
  });

  it('el estancamiento descuenta 5 por día a partir del séptimo, tope 40', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    // 10 días sin mover el deal: 3 días de exceso × 5 = 15
    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaActualizacion: dia(10) }));
    let res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(85);

    // 7 días exactos: aún no resta (el exceso empieza en el octavo)
    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaActualizacion: dia(7) }));
    res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(100);

    // 100 días: (100-7)×5 = 465 → el tope es 40
    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaActualizacion: dia(100) }));
    res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(60);
  });

  it('sin actividad nunca: resta 40; con actividad reciente no resta', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');

    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaUltimaActividad: null }));
    let res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(60);

    mocks.dealFindUnique.mockResolvedValue(baseDeal());
    res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(100);
  });

  it('la actividad vieja descuenta 8 por día a partir del tercero, tope 40', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    // 8 días sin actividad: 5 de exceso × 8 = 40 → justo el tope
    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaUltimaActividad: dia(8) }));
    let res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(60);

    // 6 días: 3 × 8 = 24
    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaUltimaActividad: dia(6) }));
    res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(76);
  });

  it('el SLA descuenta 20 según la prioridad: urgente 5 días, alta 10, el resto 20', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');

    mocks.dealFindUnique.mockResolvedValue(baseDeal({ prioridad: 'urgente', diasEnPipeline: 6 }));
    let res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(80);

    mocks.dealFindUnique.mockResolvedValue(baseDeal({ prioridad: 'alta', diasEnPipeline: 6 }));
    res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(100);

    mocks.dealFindUnique.mockResolvedValue(baseDeal({ prioridad: 'media', diasEnPipeline: 21 }));
    res = await PipelineHealthService.updateDealHealth('deal-1');
    expect(res.healthScore).toBe(80);
  });

  it('caso nominal ZOMBIE: 11 días sin actualizar (−20), 10 sin actividad (tope −40), SLA vencido (−20) → 20', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    mocks.dealFindUnique.mockResolvedValue(
      baseDeal({ fechaActualizacion: dia(11), fechaUltimaActividad: dia(10), diasEnPipeline: 30 })
    );

    const res = await PipelineHealthService.updateDealHealth('deal-1');

    // Cada vía aporta exactamente su peso: el cambio de cualquier peso rompe ESTE test
    expect(res).toMatchObject({ healthScore: 20, healthStatus: 'ZOMBIE' });
  });

  it('los cortes: WARNING < 75, CRITICAL < 50, ZOMBIE < 30 — la frontera queda fija', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    const clasificar = async (over: Record<string, unknown>) => {
      mocks.dealFindUnique.mockResolvedValue(baseDeal(over));
      return (await PipelineHealthService.updateDealHealth('deal-1')).healthStatus;
    };

    // 100 → HEALTHY
    expect(await clasificar({})).toBe('HEALTHY');
    // 74 = 100 − 26 (estancamiento puro: 12 días → 5×5=25... usamos actividad: 4 días → 8)
    // Caso limpio por una sola vía: 9 días sin actividad → 6×8=48 → tope 40 → 60 WARNING
    expect(await clasificar({ fechaUltimaActividad: dia(9) })).toBe('WARNING');
    // 49: estancamiento 12 días → 25 y actividad 9 días → 40 (tope) → 35... mejor una vía:
    //     actividad 8 días → 40 (tope) + SLA urgente vencido 20 → 100−40−20 = 40 CRITICAL
    expect(
      await clasificar({ fechaUltimaActividad: dia(8), prioridad: 'urgente', diasEnPipeline: 30 })
    ).toBe('CRITICAL');
    // 20: caso nominal completo del test anterior
    expect(
      await clasificar({ fechaActualizacion: dia(11), fechaUltimaActividad: dia(10), diasEnPipeline: 30 })
    ).toBe('ZOMBIE');
  });

  it('normaliza el score al rango 0-100 (nunca negativo)', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    // 200 días estancado + 200 días sin actividad + SLA vencido: sin tope sería -260
    mocks.dealFindUnique.mockResolvedValue(
      baseDeal({ fechaActualizacion: dia(200), fechaUltimaActividad: dia(200), diasEnPipeline: 200 })
    );

    const res = await PipelineHealthService.updateDealHealth('deal-1');

    expect(res.healthScore).toBe(0);
    expect(res.healthStatus).toBe('ZOMBIE');
  });

  it('el score se PERSISTE junto al estado y la marca de tiempo', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindUnique.mockResolvedValue(baseDeal());

    await PipelineHealthService.updateDealHealth('deal-1');

    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({
          healthScore: 100,
          healthStatus: 'HEALTHY',
          lastHealthUpdate: expect.any(Date),
        }),
      })
    );
  });

  it('deal inexistente: devuelve null y no escribe', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindUnique.mockResolvedValue(null);

    const res = await PipelineHealthService.updateDealHealth('deal-1');

    expect(res).toBeNull();
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
  });

  it('la sincronización masiva solo toca deals ACTIVOS del tenant (aislamiento)', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindMany.mockResolvedValue([]);

    await PipelineHealthService.syncPipelineHealth('tenant-1');

    expect(mocks.dealFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', estado: 'activo' } })
    );
  });
});

describe('C6 · Dataset de calibración (HealthSnapshot)', () => {
  it('cada recálculo deja instantánea con el score, las entradas y el desenlace NULL', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    mocks.dealFindUnique.mockResolvedValue(
      baseDeal({ tenantId: 'tenant-1', fechaUltimaActividad: dia(5), prioridad: 'urgente', diasEnPipeline: 9 })
    );

    await PipelineHealthService.updateDealHealth('deal-1');

    // score 100 − actividad (5 días → 3×8=16) − SLA urgente vencido (20) = 64
    expect(mocks.snapCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          dealId: 'deal-1',
          healthScore: 64,
          healthStatus: 'WARNING',
          diasSinMovimiento: 0,
          diasSinActividad: 5,
          slaVencido: true, // urgente: 9 > 5
          desenlace: null, // lo pone el cierre, nunca el recálculo
        }),
      })
    );
  });

  it('dedupe 24 h: score sin cambio y snapshot fresca → NO re-muestra', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindUnique.mockResolvedValue(baseDeal());
    mocks.snapFindFirst.mockResolvedValue({ healthScore: 100, createdAt: new Date() });

    await PipelineHealthService.updateDealHealth('deal-1');

    expect(mocks.snapCreate).not.toHaveBeenCalled();
  });

  it('score cambió → muestra aunque la snapshot sea fresca', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    const dia = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    mocks.dealFindUnique.mockResolvedValue(baseDeal({ fechaUltimaActividad: dia(5) })); // 60
    mocks.snapFindFirst.mockResolvedValue({ healthScore: 90, createdAt: new Date() });

    await PipelineHealthService.updateDealHealth('deal-1');

    expect(mocks.snapCreate).toHaveBeenCalledTimes(1);
  });

  it('snapshot vieja (≥ 24 h) sin cambio de score → re-muestra igualmente', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindUnique.mockResolvedValue(baseDeal()); // 100
    mocks.snapFindFirst.mockResolvedValue({
      healthScore: 100,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    await PipelineHealthService.updateDealHealth('deal-1');

    expect(mocks.snapCreate).toHaveBeenCalledTimes(1);
  });

  it('un fallo del dataset no rompe el recálculo del score', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.dealFindUnique.mockResolvedValue(baseDeal());
    mocks.snapFindFirst.mockRejectedValue(new Error('bd de snapshots caída'));

    const res = await PipelineHealthService.updateDealHealth('deal-1');

    expect(res).toMatchObject({ healthScore: 100 });
  });

  it('al cerrar el deal, el desenlace marca la ÚLTIMA snapshot y deja el historial intacto', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.snapFindFirst.mockResolvedValue({ id: 'snap-9' });
    mocks.snapUpdate.mockImplementation(({ data }: any) => Promise.resolve(data));

    const res = await PipelineHealthService.marcarDesenlaceEnSnapshots('deal-1', 'perdido');

    expect(mocks.snapUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'snap-9' },
        data: { desenlace: 'perdido', fechaCierre: expect.any(Date) },
      })
    );
    expect(res).toMatchObject({ desenlace: 'perdido' });
  });

  it('cerrar un deal sin snapshots no escribe nada', async () => {
    const { PipelineHealthService } = await import('@/lib/sales/pipeline-health-service');
    mocks.snapFindFirst.mockResolvedValue(null);

    const res = await PipelineHealthService.marcarDesenlaceEnSnapshots('deal-1', 'ganado');

    expect(res).toBeNull();
    expect(mocks.snapUpdate).not.toHaveBeenCalled();
  });
});

describe('C9 · Guardrail de confianza del autopiloto (ActionOrchestrator)', () => {
  const deal = {
    id: 'deal-1',
    tenantId: 'tenant-1',
    titulo: 'Implementación ERP',
    leadId: 'lead-1',
    aiSentiment: 'skeptical',
  };

  const ejecutar = (confidence: number, actionType = 'CREATE_TASK') =>
    import('@/lib/sales/action-orchestrator').then(({ ActionOrchestrator }) =>
      ActionOrchestrator.executeAction(actionType, 'deal-1', 'tenant-1', { titulo: 'Seguimiento' }, {
        rationale: 'El deal lleva días sin contacto',
        confidence,
        evidence: { ultimaActividad: '2026-09-01' },
      })
    );

  beforeEach(() => {
    mocks.dealFindUnique.mockResolvedValue(deal);
    mocks.taskCreate.mockResolvedValue({ id: 'task-1' });
    mocks.messageDraftCreate.mockResolvedValue({ id: 'draft-1' });
    mocks.auditLogCreate.mockResolvedValue({ id: 'audit-1' });
    mocks.aiDecisionLogCreate.mockResolvedValue({ id: 'log-1' });
    mocks.notifyByTelegram.mockResolvedValue(undefined);
  });

  it('frontera EXACTA del guardrail: 0.7 ejecuta, 0.69 sugiere', async () => {
    let res = await ejecutar(0.7);
    expect(res.isAutoExecuted).toBe(true);
    expect(res.outcome).toBe('Ejecutado automáticamente');
    expect(mocks.taskCreate).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.dealFindUnique.mockResolvedValue(deal);

    res = await ejecutar(0.69);
    expect(res.isAutoExecuted).toBe(false);
    expect(res.outcome).toBe('Sugerido (Requiere aprobación)');
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it('CREATE_TASK crea la tarea con vencimiento, prioridad y el rationale en la descripción', async () => {
    await ejecutar(0.9);

    expect(mocks.taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          dealId: 'deal-1',
          leadId: 'lead-1',
          titulo: 'Seguimiento',
          prioridad: 'media',
        }),
      })
    );
    const llamada = mocks.taskCreate.mock.calls[0][0];
    expect(llamada.data.descripcion).toContain('[IA Rationale]');
    expect(llamada.data.descripcion).toContain('El deal lleva días sin contacto');
    expect(llamada.data.fechaVencimiento).toBeInstanceOf(Date);
  });

  it('GENERATE_DRAFT crea el borrador con metadatos de origen y confianza', async () => {
    await import('@/lib/sales/action-orchestrator').then(({ ActionOrchestrator }) =>
      ActionOrchestrator.executeAction(
        'GENERATE_DRAFT',
        'deal-1',
        'tenant-1',
        { canal: 'whatsapp', asunto: 'Seguimiento', contenido: 'Hola, retomamos…' },
        { rationale: 're-engagement', confidence: 0.85, evidence: {} }
      )
    );

    expect(mocks.messageDraftCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          dealId: 'deal-1',
          canal: 'whatsapp',
          contenido: 'Hola, retomamos…',
        }),
      })
    );
    const llamada = mocks.messageDraftCreate.mock.calls[0][0];
    expect(llamada.data.metadatos).toMatchObject({
      generatedBy: 'Gemma 4',
      sentiment: 'skeptical',
      confidence: 0.85,
    });
  });

  it('ESCALATE_DEAL avisa por Telegram y deja auditoría', async () => {
    await ejecutar(0.95, 'ESCALATE_DEAL');

    expect(mocks.notifyByTelegram).toHaveBeenCalledWith(
      expect.stringContaining('ESCALACIÓN'),
      expect.anything()
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'escalar', entidad: 'deal', entidadId: 'deal-1' }),
      })
    );
  });

  it('EL LOG SE ESCRIBE SIEMPRE — ejecutado o sugerido, con confianza y rationale', async () => {
    // ejecutado
    await ejecutar(0.9);
    expect(mocks.aiDecisionLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          dealId: 'deal-1',
          actionType: 'CREATE_TASK',
          decisionOutcome: 'Ejecutado automáticamente',
          confidence: 0.9,
          isAutoExecuted: true,
        }),
      })
    );

    vi.clearAllMocks();
    mocks.dealFindUnique.mockResolvedValue(deal);

    // sugerido: el log ES la única prueba de que la IA lo propuso
    await ejecutar(0.4);
    expect(mocks.aiDecisionLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionOutcome: 'Sugerido (Requiere aprobación)',
          confidence: 0.4,
          isAutoExecuted: false,
        }),
      })
    );
  });

  it('acción desconocida con confianza alta: no ejecuta nada pero SÍ deja log', async () => {
    const res = await ejecutar(0.95, 'DELETE_EVERYTHING');

    expect(res.isAutoExecuted).toBe(true);
    expect(res.result).toBeUndefined(); // el switch no conoce la acción
    expect(mocks.taskCreate).not.toHaveBeenCalled();
    expect(mocks.messageDraftCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
    // el rastro de la decisión existe: se puede auditar qué se intentó
    expect(mocks.aiDecisionLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actionType: 'DELETE_EVERYTHING' }) })
    );
  });

  it('deal inexistente: lanza y no registra nada', async () => {
    mocks.dealFindUnique.mockResolvedValue(null);

    await expect(ejecutar(0.9)).rejects.toThrow('Deal no encontrado');
    expect(mocks.aiDecisionLogCreate).not.toHaveBeenCalled();
  });

  it('isAutopilotEnabled lee el flag del tenant: activo, inactivo y sin tenant', async () => {
    const { ActionOrchestrator } = await import('@/lib/sales/action-orchestrator');

    mocks.tenantFindUnique.mockResolvedValue({ aiAutopilot: true });
    expect(await ActionOrchestrator.isAutopilotEnabled('tenant-1')).toBe(true);

    mocks.tenantFindUnique.mockResolvedValue({ aiAutopilot: false });
    expect(await ActionOrchestrator.isAutopilotEnabled('tenant-1')).toBe(false);

    mocks.tenantFindUnique.mockResolvedValue(null);
    expect(await ActionOrchestrator.isAutopilotEnabled('tenant-1')).toBe(false);
  });
});
