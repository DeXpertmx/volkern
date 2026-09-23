// @vitest-environment node
//
// GUARDIA C1 · El cliente simulado (generateCustomerResponse, lib/skills/
// training-skills.ts) — con el modelo de IA ESTUBEADO: ninguna prueba llama
// a Gemma de verdad. Lo que se congela:
//
//   GEMELO DIGITAL — el prompt adopta la identidad del lead REAL: su nombre,
//   sus notas y sus interacciones (include declarado). Sin lead no hay
//   sesión ('Lead no encontrado'); sin notas, escepticismo por defecto.
//
//   MODO LEYENDA — la escalada depende del mejor score histórico: > 85
//   activa las reglas agresivas y la temperatura 0.9; la frontera exacta
//   (85) se queda en ESTÁNDAR con 0.7. Sin historial, ESTÁNDAR.
//   (El filtro de esa consulta era el defecto de C2: corregido — usa el
//   récord del VENDEDOR — y congelado en tests/sales-c2-escalada.test.ts
//   aquí: su arreglo futuro no debe romper esta guardia.)
//
//   CONTRATO — la respuesta expone SIEMPRE los cinco campos que consumen la
//   UI y el wrapper de skills: customerResponse, objectionType, sentiment,
//   leadName, systemPromptUsed. JSON roto (con o sin markdown) → el texto
//   crudo como respuesta con objectionType 'general' y sentiment 'neutral'
//   (truncado a 500 + '…'); IA caída → error explícito.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  callGemma: vi.fn(),
  leadFindUnique: vi.fn(),
  sessionFindFirst: vi.fn(),
}));

vi.mock('@/lib/ai/gemma-client', () => ({
  callGemma: mocks.callGemma,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: { findUnique: mocks.leadFindUnique },
    trainingSession: { findFirst: mocks.sessionFindFirst },
  },
}));

import { generateCustomerResponse, type RoleplayMessage } from '@/lib/skills/training-skills';

const LEAD = {
  nombre: 'Carlos Mendoza',
  notasTimestamp: [
    { contenido: 'Presiona por precio: su presupuesto anual es de 12.000 €' },
    { contenido: 'Ya usa una hoja de cálculo y no acaba de ver el valor' },
  ],
  interacciones: [{ contenido: 'Llamada de seguimiento — pidió propuesta por email' }],
};

const respuestaIA = (obj: unknown) => ({ content: JSON.stringify(obj), error: undefined });

const RESPUESTA_CLIENTE = {
  customerResponse: 'Me interesa, pero el precio me parece alto para lo que aporto yo.',
  objectionType: 'precio',
  sentiment: 'skeptical',
};

const LLAMADA = { leadId: 'lead-1', tenantId: 'tenant-1', agentMessage: 'Nuestra plataforma automatiza el seguimiento.', agentId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.leadFindUnique.mockResolvedValue(LEAD);
  mocks.sessionFindFirst.mockResolvedValue({ score: 40 }); // mejor score: ESTÁNDAR
  mocks.callGemma.mockResolvedValue(respuestaIA(RESPUESTA_CLIENTE));
});

describe('C1 · Gemelo digital (el prompt se construye con datos reales)', () => {
  it('sin lead no hay sesión: «Lead no encontrado»', async () => {
    mocks.leadFindUnique.mockResolvedValue(null);

    await expect(generateCustomerResponse(LLAMADA)).rejects.toThrow('Lead no encontrado');
  });

  it('el prompt adopta la identidad del lead: su nombre y sus NOTAS REALES', async () => {
    await generateCustomerResponse(LLAMADA);

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('Carlos Mendoza');
    expect(prompt).toContain('Presiona por precio: su presupuesto anual es de 12.000 €');
    expect(prompt).toContain('Ya usa una hoja de cálculo');
  });

  it('el gemelo lee notas E interacciones reales (include declarado en la consulta)', async () => {
    await generateCustomerResponse(LLAMADA);

    expect(mocks.leadFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          notasTimestamp: expect.anything(),
          interacciones: expect.anything(),
        }),
      })
    );
  });

  it('sin notas previas → escepticismo por defecto, la sesión no se queda sin personaje', async () => {
    mocks.leadFindUnique.mockResolvedValue({ nombre: 'Nuria', notasTimestamp: [], interacciones: [] });

    await generateCustomerResponse(LLAMADA);

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('cliente escéptico');
  });

  it('el historial viaja mapeado (agente→user, cliente→model) y el mensaje del agente es el ÚLTIMO', async () => {
    const historial: RoleplayMessage[] = [
      { role: 'agent', content: 'Hola Carlos, soy Ana de Volkern.' },
      { role: 'customer', content: 'Te escucho, pero rápido.' },
    ];

    await generateCustomerResponse({ ...LLAMADA, history: historial });

    const mensajes = mocks.callGemma.mock.calls[0][0];
    expect(mensajes[0].role).toBe('system');
    expect(mensajes[1]).toEqual({ role: 'user', content: 'Hola Carlos, soy Ana de Volkern.' });
    expect(mensajes[2]).toEqual({ role: 'model', content: 'Te escucho, pero rápido.' });
    expect(mensajes[mensajes.length - 1]).toEqual({ role: 'user', content: LLAMADA.agentMessage });
  });
});

describe('C1 · Modo leyenda (escalada por mejor score histórico)', () => {
  it('bestScore 40 → ESTÁNDAR: sin reglas agresivas y temperatura 0.7', async () => {
    await generateCustomerResponse(LLAMADA);

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('ESTÁNDAR');
    expect(prompt).not.toContain('MODO LEYENDA');
    expect(mocks.callGemma.mock.calls[0][1]).toEqual(
      expect.objectContaining({ temperature: 0.7, responseMimeType: 'application/json' })
    );
  });

  it('bestScore 86 → MODO LEYENDA: reglas agresivas en el prompt y temperatura 0.9', async () => {
    mocks.sessionFindFirst.mockResolvedValue({ score: 86 });

    await generateCustomerResponse(LLAMADA);

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('MODO LEYENDA');
    expect(prompt).toContain('REGLAS MODO LEYENDA');
    expect(mocks.callGemma.mock.calls[0][1]).toEqual(
      expect.objectContaining({ temperature: 0.9, responseMimeType: 'application/json' })
    );
  });

  it('frontera exacta: 85 NO escala (la regla es estrictamente mayor que 85)', async () => {
    mocks.sessionFindFirst.mockResolvedValue({ score: 85 });

    await generateCustomerResponse(LLAMADA);

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('ESTÁNDAR');
    expect(prompt).not.toContain('MODO LEYENDA');
    expect(mocks.callGemma.mock.calls[0][1]).toEqual(expect.objectContaining({ temperature: 0.7 }));
  });

  it('sin historial de sesiones (null) → ESTÁNDAR, la primera práctica no es leyenda', async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);

    await generateCustomerResponse(LLAMADA);

    const prompt = mocks.callGemma.mock.calls[0][0][0].content as string;
    expect(prompt).toContain('ESTÁNDAR');
    expect(prompt).not.toContain('MODO LEYENDA');
  });
});

describe('C1 · Contrato JSON (objeción y sentimiento)', () => {
  it('respuesta válida → los CINCO campos del contrato, exactos', async () => {
    const res = await generateCustomerResponse(LLAMADA);

    expect(res).toEqual({
      customerResponse: RESPUESTA_CLIENTE.customerResponse,
      objectionType: 'precio',
      sentiment: 'skeptical',
      leadName: 'Carlos Mendoza',
      systemPromptUsed: expect.stringContaining('Carlos Mendoza'),
    });
  });

  it('markdown ```json``` se limpia antes de parsear: no degrada a fallback', async () => {
    mocks.callGemma.mockResolvedValue({
      content: '```json\n' + JSON.stringify(RESPUESTA_CLIENTE) + '\n```',
      error: undefined,
    });

    const res = await generateCustomerResponse(LLAMADA);

    expect(res.customerResponse).toBe(RESPUESTA_CLIENTE.customerResponse);
    expect(res.objectionType).toBe('precio');
    expect(res.sentiment).toBe('skeptical');
  });
});

describe('C1 · Fallbacks con la IA caída o incoherente', () => {
  it('JSON roto → contrato preservado con texto crudo, objeción «general» y sentimiento «neutral»', async () => {
    mocks.callGemma.mockResolvedValue({
      content: 'Claro, te cuento lo que pienso de vuestra plataforma…',
      error: undefined,
    });

    const res = await generateCustomerResponse(LLAMADA);

    expect(res.customerResponse).toBe('Claro, te cuento lo que pienso de vuestra plataforma…');
    expect(res.objectionType).toBe('general');
    expect(res.sentiment).toBe('neutral');
    expect(res.leadName).toBe('Carlos Mendoza');
    expect(res.systemPromptUsed).toBeTruthy();
  });

  it('respuesta larga sin JSON → truncada a 500 caracteres + «...»', async () => {
    const textoLargo = 'x'.repeat(600);
    mocks.callGemma.mockResolvedValue({ content: textoLargo, error: undefined });

    const res = await generateCustomerResponse(LLAMADA);

    expect(res.customerResponse.length).toBe(503);
    expect(res.customerResponse.endsWith('...')).toBe(true);
  });

  it('IA caída → error explícito «Error de IA», no un cliente inventado', async () => {
    mocks.callGemma.mockResolvedValue({ content: '', error: 'quota exceeded' });

    await expect(generateCustomerResponse(LLAMADA)).rejects.toThrow('Error de IA');
  });
});
