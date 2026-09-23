// @vitest-environment node
//
// GUARDIA C3 · El informe de la sesión (generatePostMortem, lib/skills/
// training-skills.ts) — con el modelo de IA ESTUBEADO: ninguna prueba llama
// a Gemma de verdad. Lo que se congela:
//
//   CONTRATO — el post-mortem expone SIEMPRE los cuatro campos que consume
//   el simulador (puntuacion_cierre, argumento_mas_fuerte, punto_de_mejora,
//   tecnica_detectada), con la puntuación como ENTERO 0-100.
//
//   RANGO — única normalización en el borde del módulo: el modelo puede
//   colar "85" (string), 850 (fuera de rango), 83.7 (decimal) o null; el
//   score que llega al récord, a TrainingSession, a la cosecha (≥90) y a la
//   puerta de práctica (≥70) es SIEMPRE el entero normalizado. Inválido
//   (texto no numérico) → 60 «evaluación parcial», el valor del fallback de
//   JSON roto.
//
//   FALLBACKS — error de IA → 50 con «Conexión fallida»; JSON roto (con o
//   sin markdown) → 60 «Evaluación parcial»; score ilegible → 60. En todos
//   los casos la sesión se PERSISTE igual: el fallo del evaluador no borra
//   la práctica. Pero son scores SINTÉTICOS: jamás celebran récord.
//
//   EFECTOS — récord personal (notifyUser) y high-five al equipo solo al
//   superar el mejor score previo CON UN SCORE REAL DEL MODELO: los
//   fallbacks se persisten pero nunca celebran (antes, un 50 de IA caída
//   con previo 40 se celebraba como récord); cosecha al Playbook SOLO con
//   score ≥ 90; y el cableado con la puerta de práctica (C13): score ≥ 70
//   levanta la puerta del deal del lead y emite TRAINING_COMPLETED; 69 no
//   la levanta y una práctica caída por IA tampoco.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  callGemma: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  notifyUser: vi.fn(),
  broadcastPush: vi.fn(),
  playbookCreate: vi.fn(),
  playbookFindFirst: vi.fn(), // sonda de deduplicación de la cosecha
  dealFindFirst: vi.fn(),
  dealFindUnique: vi.fn(),
  dealUpdate: vi.fn(),
  dealActivityCreate: vi.fn(),
  eventBusEmit: vi.fn(),
}));

vi.mock('@/lib/ai/gemma-client', () => ({
  callGemma: mocks.callGemma,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    trainingSession: { create: mocks.sessionCreate, findFirst: mocks.sessionFindFirst },
    user: { findUnique: mocks.userFindUnique },
    salesPlaybookEntry: { create: mocks.playbookCreate, findFirst: mocks.playbookFindFirst },
    deal: { findFirst: mocks.dealFindFirst, findUnique: mocks.dealFindUnique, update: mocks.dealUpdate },
    dealActivity: { create: mocks.dealActivityCreate },
  },
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock('@/lib/services/push-notification', () => ({
  broadcastPushNotification: mocks.broadcastPush,
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: mocks.eventBusEmit },
  EVENTS: { TRAINING_COMPLETED: 'training_completed' },
}));

import { generatePostMortem, type RoleplayMessage } from '@/lib/skills/training-skills';

const HISTORIAL: RoleplayMessage[] = [
  { role: 'agent', content: 'Nuestro CRM automatiza el seguimiento de leads.' },
  { role: 'customer', content: 'Ya tengo hoja de cálculo, ¿qué me aporta?' },
];

const respuestaIA = (contenido: string) => ({
  content: contenido,
  error: undefined,
});

const jsonValido = (puntuacion: number | string) =>
  respuestaIA(
    JSON.stringify({
      puntuacion_cierre: puntuacion,
      argumento_mas_fuerte: 'Cuantificó el ahorro de horas',
      punto_de_mejora: 'Pedir el compromiso antes de la demo',
      tecnica_detectada: 'Cierre presuntivo',
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionFindFirst.mockResolvedValue({ score: 40 }); // récord previo a batir
  mocks.userFindUnique.mockResolvedValue({ name: 'Ana' });
  mocks.sessionCreate.mockResolvedValue({});
  mocks.playbookCreate.mockResolvedValue({});
  mocks.playbookFindFirst.mockResolvedValue(null); // sin duplicado por defecto
  mocks.broadcastPush.mockResolvedValue(undefined);
  mocks.notifyUser.mockResolvedValue(undefined);
  // puerta de práctica: sin deal asociado por defecto (los tests de la puerta lo montan)
  mocks.dealFindFirst.mockResolvedValue(null);
});

describe('C3 · Contrato del post-mortem (IA estubeada)', () => {
  it('expone los cuatro campos del contrato con la respuesta válida del modelo', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(85));

    const res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(res).toEqual({
      puntuacion_cierre: 85,
      argumento_mas_fuerte: 'Cuantificó el ahorro de horas',
      punto_de_mejora: 'Pedir el compromiso antes de la demo',
      tecnica_detectada: 'Cierre presuntivo',
    });
  });

  it('la puntuación llega al prompt como evaluación con 4 criterios y salida JSON', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(70));

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    const prompt = mocks.callGemma.mock.calls[0][0][0].content;
    expect(prompt).toContain('Manejo de Objeciones');
    expect(prompt).toContain('Aportación de Valor');
    expect(prompt).toContain('Técnica de Cierre');
    expect(prompt).toContain('Escucha Activa');
    expect(prompt).toContain('puntuacion_cierre');
    // el historial viaja en el user message
    expect(mocks.callGemma.mock.calls[0][0][1].content).toContain('Nuestro CRM automatiza');
  });
});

describe('C3 · Rango 0-100 (normalización única en el borde del módulo)', () => {
  it.each([
    ['850 fuera de rango', 850, 100],
    ['negativo', -20, 0],
    ['string numérico', '85', 85],
    ['decimal', 83.7, 84],
    ['cero', 0, 0],
    ['cien', 100, 100],
  ])('%s → %i', async (_nombre, bruto, esperado) => {
    mocks.callGemma.mockResolvedValue(jsonValido(bruto as number | string));

    const res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(res.puntuacion_cierre).toBe(esperado);
    // la persistencia recibe el score NORMALIZADO, no el del modelo
    expect(mocks.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ score: esperado }) })
    );
  });

  it('inválido (texto no numérico, null) → 60 «evaluación parcial», nunca NaN ni crash', async () => {
    mocks.callGemma.mockResolvedValue(
      respuestaIA(
        JSON.stringify({
          puntuacion_cierre: 'sobresaliente',
          argumento_mas_fuerte: 'x',
          punto_de_mejora: 'y',
          tecnica_detectada: 'z',
        })
      )
    );
    let res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });
    expect(res.puntuacion_cierre).toBe(60);
    expect(mocks.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ score: 60 }) })
    );

    mocks.callGemma.mockResolvedValue(
      respuestaIA(JSON.stringify({ puntuacion_cierre: null, argumento_mas_fuerte: 'x' }))
    );
    res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });
    expect(res.puntuacion_cierre).toBe(60);
  });
});

describe('C3 · Fallbacks con la IA caída o incoherente', () => {
  it('error de IA → 50 «Conexión fallida» y la sesión SE PERSISTE igual', async () => {
    mocks.callGemma.mockResolvedValue({ content: '', error: 'quota exceeded' });
    mocks.sessionFindFirst.mockResolvedValue({ score: 60 }); // previo 60: 50 no es récord

    const res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(res).toMatchObject({
      puntuacion_cierre: 50,
      argumento_mas_fuerte: 'Conexión fallida con evaluador IA',
      tecnica_detectada: 'N/A',
    });
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
    // el fallo del evaluador no cosecha al Playbook ni dispara récord
    expect(mocks.playbookCreate).not.toHaveBeenCalled();
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it('un fallback NUNCA celebra récord: IA caída (50) con previo 40 no notifica ni high-five — pero la sesión se persiste', async () => {
    // La separación récord ↔ fallback: la celebración exige un score REAL
    // del modelo. Un 50 sintético de IA caída se guarda como práctica, no
    // como hazaña (antes se celebraba como récord — quirk congelado y
    // corregido; el test que lo congelaba era el que había que cambiar a
    // propósito).
    mocks.callGemma.mockResolvedValue({ content: '', error: 'quota exceeded' });
    mocks.sessionFindFirst.mockResolvedValue({ score: 40 });

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    // ni notificación al vendedor ni high-five al equipo
    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.broadcastPush).not.toHaveBeenCalled();
    // la práctica se persiste igual: el fallo del evaluador no borra la sesión
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ score: 50 }) })
    );
  });

  it('un fallback NUNCA celebra récord: JSON roto (60) con previo 40 tampoco', async () => {
    mocks.callGemma.mockResolvedValue(respuestaIA('```json\n{no soy json\n```'));
    mocks.sessionFindFirst.mockResolvedValue({ score: 40 });

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.broadcastPush).not.toHaveBeenCalled();
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('un score real POR DEBAJO del techo sintético sí celebra: previo 80 y modelo da 85 → récord', async () => {
    // Protección contra sobre-bloqueo: la regla excluye los fallbacks, no
    // los scores menores de 60 — un 85 real sobre previo 80 es récord legítimo.
    mocks.callGemma.mockResolvedValue(jsonValido(85));
    mocks.sessionFindFirst.mockResolvedValue({ score: 80 });

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(mocks.notifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Record'),
      expect.any(String),
      expect.any(Object)
    );
    expect(mocks.broadcastPush).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ tag: 'high-five' })
    );
  });

  it('JSON roto con markdown → 60 «Evaluación parcial» con un trozo del contenido', async () => {
    mocks.callGemma.mockResolvedValue(
      respuestaIA('```json\n{puntuacion_cierre: no soy json válido\n```')
    );

    const res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(res.puntuacion_cierre).toBe(60);
    expect(res.argumento_mas_fuerte).toBe('Evaluación parcial');
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('JSON roto sin markdown → mismo fallback de 60', async () => {
    mocks.callGemma.mockResolvedValue(respuestaIA('Lo siento, no puedo evaluar eso ahora.'));

    const res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(res.puntuacion_cierre).toBe(60);
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
  });
});

describe('C3 · Efectos: récord, high-five y cosecha', () => {
  it('récord personal: notifica al vendedor Y high-five al equipo', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(95)); // previo 40

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(mocks.notifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Record'),
      expect.stringContaining('95'),
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
    expect(mocks.broadcastPush).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ tag: 'high-five' })
    );
  });

  it('sin récord: ni notificación al vendedor ni high-five — pero la sesión se guarda', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(35)); // previo 40

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.broadcastPush).not.toHaveBeenCalled();
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it('la cosecha al Playbook SOLO con score ≥ 90 — 89 no cosecha', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(89));
    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });
    expect(mocks.playbookCreate).not.toHaveBeenCalled();

    mocks.callGemma.mockResolvedValue(jsonValido(90));
    await generatePostMortem({
      leadId: 'lead-2',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });
    expect(mocks.playbookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          agentId: 'user-1',
          score: 90,
          status: 'approved',
          bestResponse: 'Cuantificó el ahorro de horas',
        }),
      })
    );
  });
});

describe('C3 · Cableado con la puerta de práctica (C13)', () => {
  const dealConPuerta = { id: 'deal-1', titulo: 'Implementación ERP', tags: 'HOT,PRACTICA_REQUERIDA' };

  it('score ≥ 70 levanta la puerta del deal del lead y emite TRAINING_COMPLETED', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(78));
    mocks.dealFindFirst.mockResolvedValue(dealConPuerta);
    mocks.dealFindUnique.mockResolvedValue({ titulo: 'Implementación ERP', usuarioAsignadoId: 'user-1' });
    mocks.dealUpdate.mockResolvedValue({});

    const res = await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(res.puntuacion_cierre).toBe(78);
    expect(mocks.dealUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'deal-1' }, data: { tags: 'HOT' } })
    );
    expect(mocks.dealActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ titulo: expect.stringContaining('78/100') }),
      })
    );
    expect(mocks.eventBusEmit).toHaveBeenCalledWith(
      'training_completed',
      expect.objectContaining({
        tenantId: 'tenant-1',
        employeeId: 'user-1',
        puntuacion: 78,
      })
    );
  });

  it('score 69 NO levanta la puerta ni emite el evento — practicar más', async () => {
    mocks.callGemma.mockResolvedValue(jsonValido(69));
    mocks.dealFindFirst.mockResolvedValue(dealConPuerta);

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(mocks.dealUpdate).not.toHaveBeenCalled();
    expect(mocks.eventBusEmit).not.toHaveBeenCalled();
  });

  it('la práctica fallida por IA caída (50) tampoco levanta la puerta', async () => {
    mocks.callGemma.mockResolvedValue({ content: '', error: 'ia caída' });
    mocks.dealFindFirst.mockResolvedValue(dealConPuerta);

    await generatePostMortem({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      history: HISTORIAL,
    });

    expect(mocks.dealUpdate).not.toHaveBeenCalled();
  });
});
