import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithFallback: vi.fn(),
}));

import {
  INTENTS_QUE_REQUIEREN_IA,
  LISTADOS_QUE_ADMITEN_IA,
  esPreguntaComparativa,
  debeRedactarConIA,
  esResultadoVacio,
  redactarRespuestaInteligente,
} from '@/lib/agents/redaccion-inteligente';
import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client';

const mockedCall = vi.mocked(callAssistantWithFallback);

beforeEach(() => {
  mockedCall.mockReset();
});

// ─── Clasificación de intents ─────────────────────────────────────────
describe('INTENTS_QUE_REQUIEREN_IA', () => {
  it('incluye los análisis que hoy se responden con plantilla o ¡Hecho!', () => {
    expect(INTENTS_QUE_REQUIEREN_IA.has('detectar_ghosting')).toBe(true);
    expect(INTENTS_QUE_REQUIEREN_IA.has('generar_ruta_exito')).toBe(true);
    expect(INTENTS_QUE_REQUIEREN_IA.has('auditar_integridad_gastos')).toBe(true);
    expect(INTENTS_QUE_REQUIEREN_IA.has('analizar_rentabilidad_global')).toBe(true);
  });

  it('NO incluye las consultas simples (listados y confirmaciones)', () => {
    expect(INTENTS_QUE_REQUIEREN_IA.has('mis_tareas')).toBe(false);
    expect(INTENTS_QUE_REQUIEREN_IA.has('mis_citas')).toBe(false);
    expect(INTENTS_QUE_REQUIEREN_IA.has('crear_tarea')).toBe(false);
    expect(INTENTS_QUE_REQUIEREN_IA.has('buscar_lead')).toBe(false);
  });

  it('marca los listados que pueden usar IA cuando piden comparar', () => {
    expect(LISTADOS_QUE_ADMITEN_IA.has('mis_tareas')).toBe(true);
    expect(LISTADOS_QUE_ADMITEN_IA.has('tareas_vencidas')).toBe(true);
    expect(LISTADOS_QUE_ADMITEN_IA.has('mis_negocios')).toBe(true);
    expect(LISTADOS_QUE_ADMITEN_IA.has('mis_citas')).toBe(true);
    expect(LISTADOS_QUE_ADMITEN_IA.has('crear_tarea')).toBe(false);
  });
});

// ─── Comparativa en listados ────────────────────────────────────────────
describe('esPreguntaComparativa / debeRedactarConIA', () => {
  it('detecta cuando la pregunta pide elegir o priorizar', () => {
    expect(esPreguntaComparativa('cuál de mis tareas es más urgente')).toBe(true);
    expect(esPreguntaComparativa('qué hago primero')).toBe(true);
    expect(esPreguntaComparativa('prioriza mis tareas pendientes')).toBe(true);
    expect(esPreguntaComparativa('ordena mis negocios por importe')).toBe(true);
    expect(esPreguntaComparativa('dame el top 3 de leads')).toBe(true);
    expect(esPreguntaComparativa('cuál es la tarea más importante')).toBe(true);
  });

  it('NO detecta comparativa en un listado plano', () => {
    expect(esPreguntaComparativa('muestra mis tareas')).toBe(false);
    expect(esPreguntaComparativa('dame mis citas de esta semana')).toBe(false);
    expect(esPreguntaComparativa('lista mis negocios')).toBe(false);
  });

  it('enruta a IA los análisis siempre y los listados sólo con comparativa', () => {
    expect(debeRedactarConIA('analizar_gastos', 'cómo van los gastos')).toBe(true);
    expect(debeRedactarConIA('mis_tareas', 'muestra mis tareas')).toBe(false);
    expect(debeRedactarConIA('mis_tareas', 'cuál de mis tareas es más urgente')).toBe(true);
    expect(debeRedactarConIA('crear_tarea', 'crea una tarea')).toBe(false);
  });
});

// ─── Detección de resultado vacío ─────────────────────────────────────
describe('esResultadoVacio', () => {
  it('null, undefined, array y objeto vacíos son vacíos', () => {
    expect(esResultadoVacio(null)).toBe(true);
    expect(esResultadoVacio(undefined)).toBe(true);
    expect(esResultadoVacio([])).toBe(true);
    expect(esResultadoVacio({})).toBe(true);
  });

  it('objetos con listas vacías en todas sus claves son vacíos', () => {
    expect(esResultadoVacio({ leads: [] })).toBe(true);
    expect(esResultadoVacio({ leads: [], citas: [] })).toBe(true);
  });

  it('valores primitivos y objetos con contenido NO son vacíos', () => {
    expect(esResultadoVacio(0)).toBe(false);
    expect(esResultadoVacio('texto')).toBe(false);
    expect(esResultadoVacio(false)).toBe(false);
    expect(esResultadoVacio([{ id: 1 }])).toBe(false);
    expect(esResultadoVacio({ total: 0 })).toBe(false);
    expect(esResultadoVacio({ summary: 'sin desviaciones' })).toBe(false);
  });
});

// ─── Redacción ────────────────────────────────────────────────────────
describe('redactarRespuestaInteligente', () => {
  it('devuelve null sin llamar a la IA cuando no hay datos', async () => {
    const resultado = await redactarRespuestaInteligente({
      intent: 'detectar_ghosting',
      message: 'muestra oportunidades sin seguimiento',
      data: { leads: [] },
    });

    expect(resultado).toBeNull();
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('redacta con IA los datos reales de la skill', async () => {
    mockedCall.mockResolvedValue({
      id: 'resp-1',
      choices: [{ message: { content: 'Tienes 2 leads fantasma: Eduardo y Sophie. Te recomiendo retomar a Eduardo hoy.', role: 'assistant' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    } as any);

    const resultado = await redactarRespuestaInteligente({
      intent: 'detectar_ghosting',
      message: 'muestra oportunidades sin seguimiento',
      data: [
        { nombre: 'Eduardo', horasInactivo: 120 },
        { nombre: 'Sophie', horasInactivo: 72 },
      ],
    });

    expect(resultado).toContain('2 leads fantasma');
    // El modelo recibe la pregunta del usuario y los datos serializados.
    const system = mockedCall.mock.calls[0][0].find((m) => m.role === 'system');
    const user = mockedCall.mock.calls[0][0].find((m) => m.role === 'user');
    expect(system?.content).toContain('detectar_ghosting');
    expect(user?.content).toContain('muestra oportunidades sin seguimiento');
    expect(user?.content).toContain('Eduardo');
  });

  it('devuelve null si la IA falla (la plantilla queda de red de seguridad)', async () => {
    mockedCall.mockRejectedValue(new Error('saldo insuficiente'));

    const resultado = await redactarRespuestaInteligente({
      intent: 'analizar_gastos',
      message: 'cómo van los gastos',
      data: { burnRate: 5000 },
    });

    expect(resultado).toBeNull();
  });

  it('refuerza el prompt para elegir/ordenar cuando la pregunta es comparativa', async () => {
    mockedCall.mockResolvedValue({
      id: 'resp-2',
      choices: [{ message: { content: 'La más urgente es la llamada a Eduardo: vence hoy.', role: 'assistant' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    } as any);

    await redactarRespuestaInteligente({
      intent: 'mis_tareas',
      message: 'cuál de mis tareas es más urgente',
      data: [
        { titulo: 'Llamar a Eduardo', fechaVencimiento: new Date().toISOString() },
        { titulo: 'Enviar propuesta', fechaVencimiento: '2026-12-01T10:00:00Z' },
      ],
    });

    const system = mockedCall.mock.calls[0][0].find((m) => m.role === 'system');
    expect(system?.content).toContain('eligiendo y ordenando');
  });
});
