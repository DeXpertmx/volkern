// @vitest-environment node
//
// GUARDIA C8 · El deal coach (lib/sales/deal-coach-service.ts) — riesgo de
// ghosting, sentimiento y plan, con la IA ESTUBEADA: ninguna prueba llama al
// modelo de verdad (patrón de C1/C3).
//
// Lo que se congela:
//   CONTRATO — la asesoría expone los campos que consume la pantalla/ruta
//   (healthScore, sentiment, detectedPains, successPath, objections,
//   ghostingRisk, drafts, rationale, confidenceScore, evidencePoints) con sus
//   DEGRADACIONES declaradas (sentiment → NEUTRAL, ghostingRisk → 0...).
//   PROMPT — el gemelo del trato: título, valor+moneda, etapa, notas y
//   actividades reales; y el JSON pedido al modelo.
//   ÁMBITO — el deal se busca por id Y TENANT: antes era findUnique por id a
//   secas y la ruta solo comprobaba sesión; quien conociera un id ajeno leía
//   la estrategia de OTRO tenant (mismo patrón del defecto de C2).
//   SALUD — se sincroniza con PipelineHealthService (C6) antes de responder.
//   AUTOPILOTO — sin flag, cero orquestador; con flag, las acciones del
//   successPath con payload.titulo y el borrador sugerido pasan por el
//   ActionOrchestrator (C9) con rationale/confianza/evidencia.
//   IA — caída y JSON roto → error EXPLÍCITO (el coach no inventa estrategia).
//   PERSISTENCIA — la sabiduría queda en el deal aunque el autopiloto falle.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dealFindFirst: vi.fn(),
  dealUpdate: vi.fn(),
  healthUpdate: vi.fn(),
  isAutopilotEnabled: vi.fn(),
  executeAction: vi.fn(),
  callGemma: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirst, update: mocks.dealUpdate },
  },
}));

vi.mock('@/lib/sales/pipeline-health-service', () => ({
  PipelineHealthService: { updateDealHealth: mocks.healthUpdate },
}));

vi.mock('@/lib/sales/action-orchestrator', () => ({
  ActionOrchestrator: { isAutopilotEnabled: mocks.isAutopilotEnabled, executeAction: mocks.executeAction },
}));

vi.mock('@/lib/ai/gemma-client', () => ({ callGemma: mocks.callGemma }));

import { DealCoachService } from '@/lib/sales/deal-coach-service';

// ── helpers ─────────────────────────────────────────────────────────────────

const IA_OK = {
  sentiment: 'NEGATIVE',
  detectedPains: ['pierde horas en seguimiento manual', 'no ve el retorno claro'],
  rationale: 'El trato está frío: 12 días sin actividad y objeción de precio sin responder.',
  confidenceScore: 0.82,
  evidencePoints: ['última actividad hace 12 días', 'nota: pidió propuesta el martes'],
  successPath: [
    {
      title: 'Enviar caso de éxito del sector',
      description: 'Email con caso de éxito del mismo sector',
      why: 'Responde a la objeción de valor con prueba social',
      action: { type: 'CREATE_TASK', payload: { titulo: 'Enviar caso de éxito', descripcion: '...' } },
    },
    {
      title: 'Paso sin acción ejecutable',
      description: 'Solo consejo, sin action o sin payload.titulo',
      why: 'El coach también da pasos que no son tareas',
    },
  ],
  objections: [{ trigger: 'es caro', counter: 'ahorro de 8 h/semana compensa' }],
  ghostingRisk: 0.7,
  suggestedDraft: { canal: 'email', asunto: 'Idea para tu equipo', contenido: '...' },
};

const DEAL = {
  id: 'deal-1',
  tenantId: 'tenant-1',
  titulo: 'CRM para Hotel Miramar',
  valor: 12000,
  moneda: 'EUR',
  etapa: 'propuesta',
  lead: { notasTimestamp: [{ contenido: 'Presiona por precio: presupuesto anual 12.000 €' }] },
  actividades: [{ tipo: 'llamada', titulo: 'Seguimiento propuesta' }],
  contact: { id: 'c1' },
  company: { id: 'co1' },
  MessageDraft: [{ id: 'd1' }],
};

const respuestaIA = (obj: unknown) => ({ content: JSON.stringify(obj), error: undefined });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dealFindFirst.mockResolvedValue(DEAL);
  mocks.callGemma.mockResolvedValue(respuestaIA(IA_OK));
  mocks.healthUpdate.mockResolvedValue({ healthScore: 42 });
  mocks.isAutopilotEnabled.mockResolvedValue(false);
  mocks.executeAction.mockResolvedValue({ executed: false });
  mocks.dealUpdate.mockResolvedValue({});
});

const llamar = () => DealCoachService.getDealAdvice('deal-1', 'tenant-1');

// ── 1. CONTRATO: lo que consume la pantalla ─────────────────────────────────

describe('C8 · contrato de la asesoría (lo que consume la pantalla)', () => {
  it('expone los campos completos con la IA en verde', async () => {
    const advice = await llamar();

    expect(advice.healthScore).toBe(42); // de C6, no de la IA
    expect(advice.sentiment).toBe('NEGATIVE');
    expect(advice.detectedPains).toEqual(IA_OK.detectedPains);
    expect(advice.successPath).toEqual(IA_OK.successPath);
    expect(advice.objections).toEqual(IA_OK.objections);
    expect(advice.ghostingRisk).toBe(0.7);
    expect(advice.drafts).toEqual(DEAL.MessageDraft); // los borradores EXISTENTES del deal
    expect(advice.rationale).toBe(IA_OK.rationale);
    expect(advice.confidenceScore).toBe(0.82);
    expect(advice.evidencePoints).toEqual(IA_OK.evidencePoints);
  });

  it('degradaciones declaradas: IA minimalista → sentiment NEUTRAL, riesgo 0 y listas vacías, sin romper', async () => {
    mocks.callGemma.mockResolvedValue(respuestaIA({}));

    const advice = await llamar();

    expect(advice.sentiment).toBe('NEUTRAL');
    expect(advice.ghostingRisk).toBe(0);
    expect(advice.detectedPains).toEqual([]);
    expect(advice.successPath).toEqual([]);
    expect(advice.objections).toEqual([]);
  });

  it('sin health previo (C6 falló silencioso) → healthScore 0, y la asesoría se entrega igual', async () => {
    mocks.healthUpdate.mockRejectedValue(new Error('health caído'));

    const advice = await llamar();

    expect(advice.healthScore).toBe(0);
    expect(advice.sentiment).toBe('NEGATIVE');
  });
});

// ── 2. PROMPT: el gemelo del trato ──────────────────────────────────────────

describe('C8 · prompt (el gemelo del trato)', () => {
  it('adopta los datos REALES del deal: título, valor+moneda, etapa, notas y actividades', async () => {
    await llamar();

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('CRM para Hotel Miramar');
    expect(prompt).toContain('12000 EUR');
    expect(prompt).toContain('propuesta');
    expect(prompt).toContain('Presiona por precio: presupuesto anual 12.000 €');
    expect(prompt).toContain('llamada: Seguimiento propuesta');
    expect(prompt).toContain('Gemma Deal Coach');
  });

  it('deal sin lead ni actividades: el prompt no se queda sin secciones', async () => {
    mocks.dealFindFirst.mockResolvedValue({
      ...DEAL,
      lead: null,
      actividades: [],
    });

    await llamar();

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('Historial de Notas:');
    expect(prompt).toContain('Actividades Recientes:');
  });

  it('pide JSON al modelo (responseMimeType) y le exige el formato con ghostingRisk', async () => {
    await llamar();

    expect(mocks.callGemma.mock.calls[0][1]).toEqual(
      expect.objectContaining({ responseMimeType: 'application/json' })
    );
    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('ghostingRisk');
    expect(prompt).toContain('successPath');
  });
});

// ── 3. ÁMBITO POR TENANT (defecto corregido) ────────────────────────────────

describe('C8 · ámbito: el deal se busca por id Y tenant', () => {
  it('la consulta lleva el tenantId en el where — nadie lee la estrategia de otro', async () => {
    await llamar();

    expect(mocks.dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1', tenantId: 'tenant-1' },
      })
    );
  });

  it('deal de OTRO tenant → «Deal no encontrado», aunque el id exista', async () => {
    mocks.dealFindFirst.mockResolvedValue(null);

    await expect(llamar()).rejects.toThrow('Deal no encontrado');
  });
});

// ── 4. IA: caída y JSON roto son errores EXPLÍCITOS ─────────────────────────

describe('C8 · IA caída o JSON roto: el coach no inventa estrategia', () => {
  it('IA caída → error explícito y SIN persistir nada en el deal', async () => {
    mocks.callGemma.mockResolvedValue({ content: '', error: 'timeout del modelo' });

    await expect(llamar()).rejects.toThrow('Error de IA: timeout del modelo');
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
  });

  it('JSON roto → error de formato, sin persistir', async () => {
    mocks.callGemma.mockResolvedValue({ content: 'esto no es json {', error: undefined });

    await expect(llamar()).rejects.toThrow('Gemma devolvió un formato no válido');
    expect(mocks.dealUpdate).not.toHaveBeenCalled();
  });

  it('JSON con markdown (```json) no está soportado hoy — se congela el comportamiento real', async () => {
    // Nota honesta: C1/C3 limpian markdown; este servicio NO. Si un día se
    // limpia aquí, esta prueba es la que hay que cambiar a propósito.
    mocks.callGemma.mockResolvedValue({
      content: '```json\n' + JSON.stringify(IA_OK) + '\n```',
      error: undefined,
    });

    await expect(llamar()).rejects.toThrow('Gemma devolvió un formato no válido');
  });
});

// ── 5. AUTOPILOTO: la puerta del C9 ─────────────────────────────────────────

describe('C8 · autopiloto (delega en el ActionOrchestrator, C9)', () => {
  it('sin autopiloto: cero llamadas al orquestador — la asesoría solo aconseja', async () => {
    await llamar();

    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('con autopiloto: las acciones con payload.titulo pasan al orquestador con rationale, confianza y evidencia', async () => {
    mocks.isAutopilotEnabled.mockResolvedValue(true);

    await llamar();

    expect(mocks.executeAction).toHaveBeenCalledTimes(2); // la tarea + el borrador
    expect(mocks.executeAction).toHaveBeenNthCalledWith(
      1,
      'CREATE_TASK',
      'deal-1',
      'tenant-1',
      IA_OK.successPath[0].action.payload,
      { rationale: IA_OK.rationale, confidence: 0.82, evidence: IA_OK.evidencePoints }
    );
    expect(mocks.executeAction).toHaveBeenNthCalledWith(
      2,
      'GENERATE_DRAFT',
      'deal-1',
      'tenant-1',
      IA_OK.suggestedDraft,
      { rationale: IA_OK.rationale, confidence: 0.82, evidence: IA_OK.evidencePoints }
    );
  });

  it('el paso SIN action ejecutable no llega al orquestador (solo el borrador, con autopiloto)', async () => {
    mocks.isAutopilotEnabled.mockResolvedValue(true);
    mocks.callGemma.mockResolvedValue(
      respuestaIA({ ...IA_OK, suggestedDraft: undefined })
    );

    await llamar();

    expect(mocks.executeAction).toHaveBeenCalledTimes(1); // solo CREATE_TASK
  });

  it('confianza sin declarar → 0.5 (el default del guardrail, no 1.0)', async () => {
    mocks.isAutopilotEnabled.mockResolvedValue(true);
    mocks.callGemma.mockResolvedValue(
      respuestaIA({ ...IA_OK, confidenceScore: undefined })
    );

    await llamar();

    expect(mocks.executeAction).toHaveBeenCalledWith(
      'CREATE_TASK',
      'deal-1',
      'tenant-1',
      expect.anything(),
      expect.objectContaining({ confidence: 0.5 })
    );
  });

  it('un fallo del orquestador NO rompe la asesoría ni la persistencia', async () => {
    mocks.isAutopilotEnabled.mockResolvedValue(true);
    mocks.executeAction.mockRejectedValue(new Error('orquestador caído'));

    const advice = await llamar();

    expect(advice.sentiment).toBe('NEGATIVE');
    expect(mocks.dealUpdate).toHaveBeenCalled();
  });
});

// ── 6. PERSISTENCIA: la sabiduría queda en el deal ──────────────────────────

describe('C8 · persistencia en el deal', () => {
  it('guarda estrategia, sentimiento, dolores, primera acción y riesgo de ghosting', async () => {
    await llamar();

    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: expect.objectContaining({
          aiStrategy: JSON.stringify(IA_OK.successPath),
          aiSentiment: 'NEGATIVE',
          aiDetectedPain: IA_OK.detectedPains.join(','),
          aiNextBestAction: IA_OK.successPath[0],
          aiGhostingRisk: 0.7,
          lastAiConsult: expect.any(Date),
        }),
      })
    );
  });

  it('la BD caída no rompe la respuesta: la asesoría se entrega igual', async () => {
    mocks.dealUpdate.mockRejectedValue(new Error('db down'));

    const advice = await llamar();

    expect(advice.ghostingRisk).toBe(0.7);
  });
});
