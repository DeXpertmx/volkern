import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de Prisma y OpenRouter
vi.mock('@/lib/db', () => {
  const mockPrisma = {
    chatbotAuditLog: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock('@/lib/assistant/openrouter-client', () => ({
  callAssistantWithFallback: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{}' } }],
  }),
}));

import { IntentClassifierAgent } from '@/lib/agents/intent-classifier';

describe('IntentClassifier — parseResponse', () => {
  const classifier = new IntentClassifierAgent();

  it('debe parsear JSON válido correctamente', () => {
    const response = JSON.stringify({
      intent: 'crear_lead',
      confidence: 0.95,
      needsMoreInfo: false,
      missingParams: [],
      extractedParams: { nombre: 'Juan', email: 'juan@test.com' },
    });

    const result = (classifier as any).parseResponse(response);
    expect(result.intent).toBe('crear_lead');
    expect(result.confidence).toBe(0.95);
    expect(result.extractedParams.nombre).toBe('Juan');
  });

  it('debe extraer JSON de texto con prefijo/sufijo', () => {
    const response = 'Aquí está la clasificación: {"intent":"agendar_cita","confidence":0.9,"extractedParams":{}} y más texto';

    const result = (classifier as any).parseResponse(response);
    expect(result.intent).toBe('agendar_cita');
    expect(result.confidence).toBe(0.9);
  });

  it('debe devolver consulta_general para JSON inválido', () => {
    const result = (classifier as any).parseResponse('esto no es json');
    expect(result.intent).toBe('consulta_general');
    expect(result.confidence).toBe(0.1);
  });

  it('debe devolver consulta_general para respuesta vacía', () => {
    const result = (classifier as any).parseResponse('');
    expect(result.intent).toBe('consulta_general');
  });

  it('debe parsear JSON con parámetros anidados', () => {
    const response = JSON.stringify({
      intent: 'crear_tarea',
      confidence: 0.87,
      extractedParams: {
        titulo: 'Revisar informe',
        descripcion: 'Revisar el informe de ventas Q2',
        fechaVencimiento: '2026-06-15',
        prioridad: 'alta',
      },
    });

    const result = (classifier as any).parseResponse(response);
    expect(result.intent).toBe('crear_tarea');
    expect(result.extractedParams.prioridad).toBe('alta');
    expect(result.extractedParams.fechaVencimiento).toBe('2026-06-15');
  });
});

describe('IntentClassifier — fallbackExtract', () => {
  const classifier = new IntentClassifierAgent();

  it('debe extraer email con regex', () => {
    const result = (classifier as any).fallbackExtract('contacto juan@test.com', 'crear_lead');
    expect(result.email).toBe('juan@test.com');
  });

  it('debe extraer nombre con regex', () => {
    const result = (classifier as any).fallbackExtract('agrega a Juan Perez', 'crear_lead');
    expect(result.nombre).toBe('Juan Perez');
  });

  it('debe extraer monto para registrar_gasto', () => {
    const result = (classifier as any).fallbackExtract('gasto de 250€ en materiales', 'registrar_gasto');
    expect(result.monto).toBe(250);
  });

  it('debe extraer monto con coma decimal', () => {
    const result = (classifier as any).fallbackExtract('factura 150,50 euros', 'registrar_gasto');
    expect(result.monto).toBe(150.5);
  });

  it('debe devolver objeto vacío si no hay matches', () => {
    const result = (classifier as any).fallbackExtract('hola', 'consulta_general');
    expect(result).toEqual({});
  });
});

describe('IntentClassifier — getMissingParams', () => {
  const classifier = new IntentClassifierAgent();

  it('debe devolver parámetros requeridos que faltan', () => {
    const missing = (classifier as any).getMissingParams('crear_lead', {});
    expect(missing).toContain('nombre');
    expect(missing).toContain('email');
  });

  it('debe devolver array vacío cuando todos están presentes', () => {
    const missing = (classifier as any).getMissingParams('crear_lead', {
      nombre: 'Juan',
      email: 'juan@test.com',
      contexto: 'Interesado en producto',
    });
    expect(missing).toEqual([]);
  });

  it('debe devolver array vacío para intent sin schema', () => {
    const missing = (classifier as any).getMissingParams('intent_falso', {});
    expect(missing).toEqual([]);
  });

  it('debe devolver solo los params que realmente faltan', () => {
    const missing = (classifier as any).getMissingParams('crear_lead', {
      nombre: 'Ana',
    });
    expect(missing).toContain('email');
    expect(missing).not.toContain('nombre');
  });
});

describe('IntentClassifier — getIntentSchema', () => {
  const classifier = new IntentClassifierAgent();

  it('debe devolver schema para intent conocido', () => {
    const schema = classifier.getIntentSchema('crear_lead');
    expect(schema).toBeDefined();
    expect(schema!.name).toBe('crear_lead');
    expect(schema!.requiredParams).toBeDefined();
    expect(schema!.examples).toBeDefined();
  });

  it('debe devolver undefined para intent inexistente', () => {
    const schema = classifier.getIntentSchema('intent_que_no_existe');
    expect(schema).toBeUndefined();
  });

  it('todos los intents en ALL_INTENTS deben tener schema válido', () => {
    // Accedemos a la propiedad privada para verificar
    const allIntents = (classifier as any).intentsSchema;
    for (const intent of allIntents) {
      const schema = classifier.getIntentSchema(intent.name);
      expect(schema).toBeDefined();
      expect(schema!.requiredParams).toBeInstanceOf(Array);
      expect(Array.isArray(schema!.examples)).toBe(true);
      expect(typeof schema!.destructive).toBe('boolean');
    }
  });
});

describe('IntentClassifier — isDestructive', () => {
  const classifier = new IntentClassifierAgent();

  it('debe devolver false para intents no destructivos (crear_lead)', () => {
    expect(classifier.isDestructive('crear_lead')).toBe(false);
  });

  it('debe devolver false para intent inexistente', () => {
    expect(classifier.isDestructive('intent_falso')).toBe(false);
  });

  it('debe devolver el valor correcto de destructive', () => {
    const allIntents = (classifier as any).intentsSchema;
    for (const intent of allIntents) {
      const result = classifier.isDestructive(intent.name);
      expect(result).toBe(intent.destructive);
    }
  });
});

describe('IntentClassifier — getRequiredParams', () => {
  const classifier = new IntentClassifierAgent();

  it('debe devolver params para crear_lead', () => {
    const params = classifier.getRequiredParams('crear_lead');
    expect(params).toContain('nombre');
    expect(params).toContain('email');
  });

  it('debe devolver array vacío para consulta_general', () => {
    const params = classifier.getRequiredParams('consulta_general');
    expect(params).toEqual([]);
  });

  it('debe devolver array vacío para intent sin schema', () => {
    const params = classifier.getRequiredParams('no_existe');
    expect(params).toEqual([]);
  });
});
