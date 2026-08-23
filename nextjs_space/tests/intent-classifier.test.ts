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

describe('IntentClassifier — ruta determinista (sin LLM)', () => {
  const classifier = new IntentClassifierAgent();
  const base = { userId: 'u1', tenantId: 't1' };

  it('detecta crear_lead con nombre, email y empresa sin llamar al LLM', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Prueba Local, pruebalocal@volkern.test, de la empresa Volkern Test',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.nombre).toBe('Prueba Local');
    expect(result.extractedParams.email).toBe('pruebalocal@volkern.test');
    expect(result.extractedParams.empresa).toBe('Volkern Test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('detecta crear_contacto con nombre y email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el contacto Laura Gomez con email laura@volkern.test',
    });
    expect(result.intent).toBe('crear_contacto');
    expect(result.extractedParams.nombre).toBe('Laura Gomez');
    expect(result.extractedParams.email).toBe('laura@volkern.test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('detecta crear_empresa sin confundir el email contacto@', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea la empresa Volkern Empresa Prueba, contacto@volkernempresa.test',
    });
    expect(result.intent).toBe('crear_empresa');
    expect(result.extractedParams.nombre).toBe('Volkern Empresa Prueba');
    expect(result.extractedParams.email).toBe('contacto@volkernempresa.test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crear_lead sin email → needsMoreInfo con missingParams', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Ana Torres',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.nombre).toBe('Ana Torres');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('email');
  });

  it('multi-turno: completa el dato faltante sin LLM', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ana@test.com',
      pendingIntent: 'crear_lead',
      collectedEntities: { nombre: 'Ana Torres' },
      missingEntities: ['email'],
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams).toMatchObject({ nombre: 'Ana Torres', email: 'ana@test.com' });
    expect(result.needsMoreInfo).toBe(false);
  });

  it('mensajes sin verbo de creación NO caen en la ruta determinista', async () => {
    const result = await classifier.classify({
      ...base,
      message: '¿qué módulos tienes?',
    });
    expect(result.intent).toBe('consulta_general'); // el mock del LLM devuelve {}
  });

  // ═══ PRIMER ENTRENAMIENTO (módulo Ventas): extracción de campos opcionales ═══

  it('captura cargo, teléfono y empresa al crear contacto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el contacto Laura Gomez con email laura@volkern.test, cargo Gerente, teléfono +525511223344, de la empresa Volkern Test',
    });
    expect(result.intent).toBe('crear_contacto');
    expect(result.extractedParams.nombre).toBe('Laura Gomez');
    expect(result.extractedParams.email).toBe('laura@volkern.test');
    expect(result.extractedParams.cargo).toBe('Gerente');
    expect(result.extractedParams.telefono).toContain('525511223344');
    expect(result.extractedParams.empresa).toBe('Volkern Test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('captura empresa suelta (sin "de la") al crear lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Juan Perez con email juan@volkern.test, empresa Acme Corp',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.nombre).toBe('Juan Perez');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.extractedParams.empresa).toBe('Acme Corp');
  });

  it('captura linkedin, ubicacion y tags al crear lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Carlos Diaz con email carlos@volkern.test, linkedin carlosdiaz, ubicación Ciudad de México, tags vip,caliente',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.nombre).toBe('Carlos Diaz');
    expect(result.extractedParams.email).toBe('carlos@volkern.test');
    expect(result.extractedParams.linkedin).toContain('carlosdiaz');
    expect(result.extractedParams.ubicacion).toContain('Ciudad de México');
    expect(result.extractedParams.tags).toContain('vip');
  });

  it('NO confunde la ubicación con el "en" dentro de un nombre (Elena)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el contacto Elena Ruiz con email elena@volkern.test, ubicación Madrid, de la empresa Volkern Test',
    });
    expect(result.intent).toBe('crear_contacto');
    expect(result.extractedParams.nombre).toBe('Elena Ruiz');
    expect(result.extractedParams.ubicacion).toBe('Madrid');
    expect(result.extractedParams.empresa).toBe('Volkern Test');
  });

  it('captura contexto al crear lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Ana Torres con email ana@volkern.test, contexto: interesado en software de gestión',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.contexto).toContain('interesado en software');
  });

  it('NO trata "linkedin" como campo cuando es fuente del lead (falso positivo)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead que llegó por linkedin con email juan@volkern.test',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.linkedin).toBeUndefined();
    expect(result.extractedParams.email).toBe('juan@volkern.test');
  });

  it('NO dispara contexto con la palabra suelta "nota" (empresa Nota Azul)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea la empresa Nota Azul con email notaazul@volkern.test',
    });
    expect(result.intent).toBe('crear_empresa');
    expect(result.extractedParams.contexto).toBeUndefined();
    expect(result.extractedParams.nombre).toBe('Nota Azul');
  });

  it('NO sobre-captura tags con el campo empresa siguiente', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Roberto Lima con email roberto@volkern.test, tags vip,caliente, de la empresa Acme Corp',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.tags).toBe('vip,caliente');
    expect(result.extractedParams.empresa).toBe('Acme Corp');
  });

  it('NO trata "nota" de "notas de prensa" como contexto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Maria Diaz con email maria@volkern.test, notas: llamar mañana',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.extractedParams.contexto).toContain('llamar mañana');
  });

  it('conserva razón social con S.A. al crear empresa', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea la empresa Volkern E2E S.A. de C.V. con email contacto@volkern.test',
    });
    expect(result.intent).toBe('crear_empresa');
    expect(result.extractedParams.nombre).toBe('Volkern E2E S.A. de C.V.');
    expect(result.extractedParams.email).toBe('contacto@volkern.test');
  });

  it('multi-turno: completa cargo cuando falta (crear_contacto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cargo: Directora Comercial',
      pendingIntent: 'crear_contacto',
      collectedEntities: { nombre: 'Sofia Ruiz', email: 'sofia@volkern.test' },
      missingEntities: ['cargo'],
    });
    expect(result.intent).toBe('crear_contacto');
    expect(result.extractedParams).toMatchObject({
      nombre: 'Sofia Ruiz',
      email: 'sofia@volkern.test',
      cargo: 'Directora Comercial',
    });
  });

  it('multi-turno: completa tags cuando faltan (crear_empresa)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'tags: proveedor,clave',
      pendingIntent: 'crear_empresa',
      collectedEntities: { nombre: 'Acme Corp' },
      missingEntities: ['tags'],
    });
    expect(result.intent).toBe('crear_empresa');
    expect(result.extractedParams).toMatchObject({
      nombre: 'Acme Corp',
      tags: 'proveedor,clave',
    });
  });

  it('multi-turno: completa teléfono con número desnudo (sin keyword)', async () => {
    const result = await classifier.classify({
      ...base,
      message: '5551234567',
      pendingIntent: 'crear_contacto',
      collectedEntities: { nombre: 'Pedro Rios', email: 'pedro@volkern.test' },
      missingEntities: ['telefono'],
    });
    expect(result.intent).toBe('crear_contacto');
    expect(result.extractedParams).toMatchObject({
      nombre: 'Pedro Rios',
      email: 'pedro@volkern.test',
      telefono: '5551234567',
    });
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crear_lead con todos los campos → sin preguntas extra', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega el lead Roberto Lima con email roberto@volkern.test, cargo Director, teléfono +34911223344',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.needsMoreInfo).toBe(false);
    expect(result.extractedParams.cargo).toBe('Director');
    expect(result.extractedParams.telefono).toContain('34911223344');
  });

  // ═══ SEGUNDO ENTRENAMIENTO (módulo Ventas): buscar, listar y convertir ═══

  it('busca lead por email: "busca el lead con email…"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca el lead con email juan@volkern.test',
    });
    expect(result.intent).toBe('buscar_lead');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('busca lead por nombre: "busca el lead Juan Perez" NO cae en crear_lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca el lead Juan Perez',
    });
    expect(result.intent).toBe('buscar_lead');
    expect(result.extractedParams.nombre).toBe('Juan Perez');
    expect(result.intent).not.toBe('crear_lead');
  });

  it('busca lead por nombre sin la palabra lead: "encuentra a María García"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'encuentra a María García',
    });
    expect(result.intent).toBe('buscar_lead');
    expect(result.extractedParams.nombre).toBe('María García');
  });

  it('busca lead con "dame los datos de…"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame los datos de juan@volkern.test',
    });
    expect(result.intent).toBe('buscar_lead');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
  });

  it('lista los leads', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista los leads',
    });
    expect(result.intent).toBe('listar_leads');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('lista leads por estado (sin verbo): "leads en estado contactado"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'leads en estado contactado',
    });
    expect(result.intent).toBe('listar_leads');
    expect(result.extractedParams.estado).toBe('contactado');
  });

  it('lista leads nuevos: "ver leads nuevos" → estado nuevo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ver leads nuevos',
    });
    expect(result.intent).toBe('listar_leads');
    expect(result.extractedParams.estado).toBe('nuevo');
  });

  it('"leads con tags nuevos" NO infiere estado (nuevos es una etiqueta)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista los leads con tags nuevos',
    });
    expect(result.intent).toBe('listar_leads');
    expect(result.extractedParams.estado).toBeUndefined();
    expect(result.extractedParams.tags).toBe('nuevos');
  });

  it('muéstrame todos los contactos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame todos los contactos',
    });
    expect(result.intent).toBe('listar_contactos');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('contactos tipo empresa → filtro tipo company', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'contactos tipo empresa',
    });
    expect(result.intent).toBe('listar_contactos');
    expect(result.extractedParams.tipo).toBe('company');
  });

  it('busca contactos que contengan García → listar con search', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca contactos que contengan García',
    });
    expect(result.intent).toBe('listar_contactos');
    expect(result.extractedParams.search).toBe('García');
  });

  it('busca un contacto concreto: "busca el contacto Laura Gómez" → search Laura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca el contacto Laura Gómez',
    });
    expect(result.intent).toBe('listar_contactos');
    expect(result.extractedParams.search).toContain('Laura');
  });

  it('contactos con tags vip → filtro tags', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'contactos con tags vip',
    });
    expect(result.intent).toBe('listar_contactos');
    expect(result.extractedParams.tags).toBe('vip');
  });

  it('convierte lead por email: "convierte a juan@volkern.test en contacto"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'convierte a juan@volkern.test en contacto',
    });
    expect(result.intent).toBe('convertir_lead');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('convierte lead por nombre: "convierte lead de María García a contacto"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'convierte lead de María García a contacto',
    });
    expect(result.intent).toBe('convertir_lead');
    expect(result.extractedParams.nombre).toBe('María García');
    // El skill necesita el email para convertir → pide más info
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('email');
  });

  it('"convierte…" NO se confunde con crear_contacto (contiene la palabra contacto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pasa a contacto a carlos@volkern.test',
    });
    expect(result.intent).toBe('convertir_lead');
    expect(result.extractedParams.email).toBe('carlos@volkern.test');
  });

  // ═══ TERCER ENTRENAMIENTO (módulo Ventas): pipeline / deals ═══

  it('crea un deal con email, monto y título', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un deal con juan@volkern.test por 5000€ por el paquete empresarial',
    });
    expect(result.intent).toBe('crear_negocio');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.extractedParams.monto).toBe(5000);
    expect(result.extractedParams.titulo).toContain('paquete empresarial');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea un negocio con nombre y sin título explícito → sintetiza título', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'abre negocio con María García a 3000€',
    });
    expect(result.intent).toBe('crear_negocio');
    expect(result.extractedParams.nombre).toBe('María García');
    expect(result.extractedParams.monto).toBe(3000);
    expect(result.extractedParams.titulo).toContain('María García');
  });

  it('crear_negocio sin email → pide más info', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un negocio con Laura por el servicio premium',
    });
    expect(result.intent).toBe('crear_negocio');
    expect(result.extractedParams.titulo).toContain('servicio premium');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('email');
  });

  it('mueve un deal a otra etapa', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'mueve el deal de juan@volkern.test a etapa negociación',
    });
    expect(result.intent).toBe('actualizar_negocio');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.extractedParams.etapa).toBe('negociación');
  });

  it('actualiza el monto de un negocio por nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'actualiza el monto del negocio con María a 7000€',
    });
    expect(result.intent).toBe('actualizar_negocio');
    expect(result.extractedParams.nombre).toBe('María');
    expect(result.extractedParams.monto).toBe(7000);
  });

  it('pon prioridad alta al deal', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pon prioridad alta al deal de Carlos Ruiz',
    });
    expect(result.intent).toBe('actualizar_negocio');
    expect(result.extractedParams.nombre).toBe('Carlos Ruiz');
    expect(result.extractedParams.prioridad).toBe('alta');
  });

  it('muéstrame los deals activos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame los deals activos',
    });
    expect(result.intent).toBe('mis_negocios');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('negocios en etapa propuesta → mis_negocios con filtro', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'negocios en etapa propuesta',
    });
    expect(result.intent).toBe('mis_negocios');
    expect(result.extractedParams.etapa).toBe('propuesta');
  });

  it('cómo va mi pipeline de ventas → mis_negocios', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo va mi pipeline de ventas',
    });
    expect(result.intent).toBe('mis_negocios');
  });

  it('NO confunde "crea un deal" con crear_lead ni con mis_negocios', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un deal con juan@volkern.test por 5000€',
    });
    expect(result.intent).toBe('crear_negocio');
    expect(result.intent).not.toBe('crear_lead');
    expect(result.intent).not.toBe('mis_negocios');
  });

  it('"tengo una oportunidad para ti" NO es mis_negocios (señal tengo acotada)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'tengo una oportunidad para ti',
    });
    expect(result.intent).not.toBe('mis_negocios');
  });

  it('"qué deals tengo con juan@volkern.test" → mis_negocios con email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué deals tengo con juan@volkern.test',
    });
    expect(result.intent).toBe('mis_negocios');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
  });

  // ═══ CUARTO ENTRENAMIENTO (módulo Ventas): actualizar lead e interacciones ═══

  it('actualiza el teléfono de un lead por email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'actualiza el telefono de juan@volkern.test a 555-1234',
    });
    expect(result.intent).toBe('actualizar_lead');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.extractedParams.telefono).toContain('555-1234');
  });

  it('ponle contexto a un contacto (contenido tras los dos puntos)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ponle contexto a Alejandra Velázquez: Interesada en automatización',
    });
    expect(result.intent).toBe('actualizar_lead');
    expect(result.extractedParams.nombre).toBe('Alejandra Velázquez');
    expect(result.extractedParams.contexto).toContain('Interesada en automatización');
  });

  it('cambia el nombre de un lead por email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cambia el nombre de maria@volkern.test a Maria Perez',
    });
    expect(result.intent).toBe('actualizar_lead');
    expect(result.extractedParams.email).toBe('maria@volkern.test');
  });

  it('pon contexto al contacto X (sin conector suelto antes del nombre)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pon contexto al contacto Alejandra Velázquez',
    });
    expect(result.intent).toBe('actualizar_lead');
    expect(result.extractedParams.nombre).toBe('Alejandra Velázquez');
  });

  it('NO confunde actualizar lead con actualizar negocio', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'actualiza el telefono de juan@volkern.test a 555-1234',
    });
    expect(result.intent).not.toBe('actualizar_negocio');
  });

  it('registra una llamada con contenido tras los dos puntos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra una llamada con Juan Pérez: Hablamos sobre el presupuesto',
    });
    expect(result.intent).toBe('registrar_interaccion');
    expect(result.extractedParams.tipo).toBe('llamada');
    expect(result.extractedParams.nombre).toBe('Juan Pérez');
    expect(result.extractedParams.contenido).toContain('Hablamos sobre el presupuesto');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('anota una reunión con un contacto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'anota una reunión con Carlos: Quedamos en firmar contrato mañana',
    });
    expect(result.intent).toBe('registrar_interaccion');
    expect(result.extractedParams.tipo).toBe('reunión');
    expect(result.extractedParams.nombre).toBe('Carlos');
    expect(result.extractedParams.contenido).toContain('Quedamos en firmar');
  });

  it('nueva interacción tipo email con un lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'nueva interacción tipo email con maria@volkern.test: Enviado catálogo',
    });
    expect(result.intent).toBe('registrar_interaccion');
    expect(result.extractedParams.tipo).toBe('email');
    expect(result.extractedParams.email).toBe('maria@volkern.test');
  });

  it('multi-turno: completa el tipo de interacción faltante', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'fue una llamada',
      pendingIntent: 'registrar_interaccion',
      collectedEntities: { nombre: 'Juan', contenido: 'Hablamos' },
      missingEntities: ['tipo'],
    });
    expect(result.intent).toBe('registrar_interaccion');
    expect(result.extractedParams.tipo).toBe('llamada');
  });

  // ═══ QUINTO ENTRENAMIENTO (módulo Citas): agendar, consultar y cancelar ═══

  const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d) };
  const nextWeekday = (dow: number) => {
    const t = new Date();
    let ahead = (dow - t.getDay() + 7) % 7;
    if (ahead === 0) ahead = 7;
    t.setDate(t.getDate() + ahead);
    return isoDate(t);
  };

  it('agenda una cita con email para mañana a las 10am', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda una cita con maria@volkern.test para mañana a las 10am',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.email).toBe('maria@volkern.test');
    expect(result.extractedParams.fecha).toBe(tomorrow());
    expect(result.extractedParams.hora).toBe('10:00');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('programa reunión con nombre el viernes a las 15:30 (sin email → listo: el wrapper auto-registra)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'programa reunión con Juan Pérez el viernes a las 15:30',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('Juan Pérez');
    expect(result.extractedParams.fecha).toBe(nextWeekday(5));
    expect(result.extractedParams.hora).toBe('15:30');
    // Email NO es requerido: si el lead no está en el CRM, el wrapper lo
    // registra automáticamente con email sintético.
    expect(result.needsMoreInfo).toBe(false);
  });

  it('agenda videollamada con 2pm → tipo videollamada y hora 14:00', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda videollamada con ana@volkern.test el lunes a las 2pm',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.tipo).toBe('videollamada');
    expect(result.extractedParams.hora).toBe('14:00');
    expect(result.extractedParams.fecha).toBe(nextWeekday(1));
  });

  it('agenda cita en fecha explícita 15/05/2026 → normaliza a YYYY-MM-DD', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda cita con Luis Gómez el 15/05/2026 a las 11:30',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('Luis Gómez');
    expect(result.extractedParams.fecha).toBe('2026-05-15');
    expect(result.extractedParams.hora).toBe('11:30');
  });

  it('agendar sin fecha → needsMoreInfo pide fecha', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda una cita con maria@volkern.test a las 10am',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.hora).toBe('10:00');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('fecha');
  });

  it('multi-turno: completa la fecha faltante de agendar_cita', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'mañana',
      pendingIntent: 'agendar_cita',
      collectedEntities: { email: 'maria@volkern.test', hora: '10:00' },
      missingEntities: ['fecha'],
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.fecha).toBe(tomorrow());
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa la hora faltante de agendar_cita', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'a las 10:30',
      pendingIntent: 'agendar_cita',
      collectedEntities: { email: 'maria@volkern.test', fecha: tomorrow() },
      missingEntities: ['hora'],
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.hora).toBe('10:30');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué citas tengo mañana → mis_citas con filtro de fecha', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué citas tengo mañana',
    });
    expect(result.intent).toBe('mis_citas');
    expect(result.extractedParams.date).toBe(tomorrow());
    expect(result.needsMoreInfo).toBe(false);
  });

  it('muéstrame mis citas → mis_citas sin filtro', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame mis citas',
    });
    expect(result.intent).toBe('mis_citas');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cancela la cita de Alejandra Velázquez', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cancela la cita de Alejandra Velázquez',
    });
    expect(result.intent).toBe('cancelar_cita');
    expect(result.extractedParams.nombre).toBe('Alejandra Velázquez');
  });

  it('cancela mi reunión de mañana con juan@volkern.test', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cancela mi reunión de mañana con juan@volkern.test',
    });
    expect(result.intent).toBe('cancelar_cita');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.extractedParams.fecha).toBe(tomorrow());
  });

  it('"¿cuánto cuesta la cita de un abogado?" NO es agendar ni mis_citas', async () => {
    const result = await classifier.classify({
      ...base,
      message: '¿cuánto cuesta la cita de un abogado?',
    });
    expect(result.intent).not.toBe('agendar_cita');
    expect(result.intent).not.toBe('mis_citas');
    expect(result.intent).not.toBe('cancelar_cita');
  });

  it('"cancela el deal de Carlos" NO es cancelar_cita (sin entidad cita)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cancela el deal de Carlos',
    });
    expect(result.intent).not.toBe('cancelar_cita');
  });

  it('"tengo una cita mañana" NO se fuerza a agendar_cita (sin verbo de agenda)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'tengo una cita mañana',
    });
    expect(result.intent).not.toBe('agendar_cita');
  });

  it('"tengo una cita para mañana" (afirmación con para) NO es agendar_cita', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'tengo una cita para mañana',
    });
    expect(result.intent).not.toBe('agendar_cita');
    expect(result.intent).not.toBe('mis_citas');
  });

  it('multi-turno: completa el nombre faltante de agendar_cita (sin pedir email)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'María García',
      pendingIntent: 'agendar_cita',
      collectedEntities: { fecha: tomorrow(), hora: '10:00' },
      missingEntities: ['nombre'],
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.nombre).toBe('María García');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('agendar sin nombre → pide nombre (no email)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agenda una cita para mañana a las 10am',
    });
    expect(result.intent).toBe('agendar_cita');
    expect(result.extractedParams.fecha).toBe(tomorrow());
    expect(result.extractedParams.hora).toBe('10:00');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('nombre');
    expect(result.missingParams).not.toContain('email');
  });

  it('el día de la semana coincide con hoy → usa la próxima semana (semántica de agenda)', async () => {
    const today = new Date();
    const dowToday = today.getDay();
    const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const result = await classifier.classify({
      ...base,
      message: `agenda cita con test@volkern.test el ${names[dowToday]} a las 9am`,
    });
    expect(result.intent).toBe('agendar_cita');
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(result.extractedParams.fecha).toBe(iso(expected));
  });

  // ═══ SEXTO ENTRENAMIENTO (módulo Finanzas): gastos ═══

  it('registra gasto de 45.90 en comida', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra gasto de 45.90 en comida',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.monto).toBe(45.9);
    expect(result.extractedParams.concepto).toBe('comida');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('nuevo gasto con monto, concepto y proveedor', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'nuevo gasto: 120€ de electricidad, proveedor Iberdrola',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.monto).toBe(120);
    expect(result.extractedParams.concepto).toBe('electricidad');
    expect(result.extractedParams.proveedor).toBe('Iberdrola');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('gasto sin verbo con monto, concepto y categoría', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'gasto de 300€ en software, categoría herramientas',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.monto).toBe(300);
    expect(result.extractedParams.concepto).toBe('software');
    expect(result.extractedParams.categoria).toBe('herramientas');
  });

  it('registrar_gasto sin monto → pide monto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un gasto en comida',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.concepto).toBe('comida');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('monto');
  });

  it('multi-turno: completa el monto faltante de registrar_gasto', async () => {
    const result = await classifier.classify({
      ...base,
      message: '45.90',
      pendingIntent: 'registrar_gasto',
      collectedEntities: { concepto: 'comida' },
      missingEntities: ['monto'],
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams).toMatchObject({ concepto: 'comida', monto: '45.9' });
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa el concepto faltante', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'fue en comida',
      pendingIntent: 'registrar_gasto',
      collectedEntities: { monto: '45.9' },
      missingEntities: ['concepto'],
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.concepto).toBe('comida');
  });

  it('analiza mi burn rate → analizar_gastos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza mi burn rate',
    });
    expect(result.intent).toBe('analizar_gastos');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cómo vamos de gastos este mes → analizar_gastos con months=1', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo vamos de gastos este mes',
    });
    expect(result.intent).toBe('analizar_gastos');
    expect(result.extractedParams.months).toBe(1);
  });

  it('dame mi salud financiera → analizar_gastos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame mi salud financiera',
    });
    expect(result.intent).toBe('analizar_gastos');
  });

  it('NO confunde gastos con interacciones (registra gasto de 50€: comida)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un gasto de 50€: comida',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.intent).not.toBe('registrar_interaccion');
    expect(result.extractedParams.monto).toBe(50);
  });

  it('"pago la factura de X" NO es registrar_gasto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pago la factura de juan@volkern.test',
    });
    expect(result.intent).not.toBe('registrar_gasto');
  });

  it('"registra una llamada: hablamos de un gasto de 50€" SÍ es interacción (tipo explícito)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra una llamada con Juan: hablamos de un gasto de 50€',
    });
    expect(result.intent).toBe('registrar_interaccion');
    expect(result.intent).not.toBe('registrar_gasto');
    expect(result.extractedParams.tipo).toBe('llamada');
  });

  it('"gasto del 15/05/2026 de 300€" → monto 300 y SIN concepto basura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'gasto del 15/05/2026 de 300€',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.monto).toBe(300);
    expect(result.extractedParams.concepto).toBeUndefined();
  });

  it('concepto con "con proveedor" sin coma → no arrastra el "con"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra gasto de 45.90 en comida con proveedor Acme',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.extractedParams.concepto).toBe('comida');
    expect(result.extractedParams.proveedor).toBe('Acme');
  });

  // ═══ SÉPTIMO ENTRENAMIENTO (módulo Tareas/Notas) ═══

  it('crea tarea: llamar a Juan Pérez (título tras los dos puntos)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea tarea: llamar a Juan Pérez',
    });
    expect(result.intent).toBe('crear_tarea');
    expect(result.extractedParams.titulo).toBe('llamar a Juan Pérez');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('nueva tarea para María: revisar cotización → nombre + título', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'nueva tarea para María: revisar cotización',
    });
    expect(result.intent).toBe('crear_tarea');
    expect(result.extractedParams.titulo).toBe('revisar cotización');
    expect(result.extractedParams.nombre).toBe('María');
  });

  it('agrega pendiente con vencimiento el viernes', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega pendiente: enviar documento a Carlos, vence el viernes',
    });
    expect(result.intent).toBe('crear_tarea');
    expect(result.extractedParams.titulo).toBe('enviar documento a Carlos');
    expect(result.extractedParams.fechaVencimiento).toBe(nextWeekday(5));
  });

  it('tarea sin título explícito → sintetiza "Seguimiento X"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea una tarea con Alejandra Velázquez',
    });
    expect(result.intent).toBe('crear_tarea');
    expect(result.extractedParams.nombre).toBe('Alejandra Velázquez');
    expect(result.extractedParams.titulo).toContain('Seguimiento');
  });

  it('"crea tarea para mañana: …" → mañana es fecha, NO nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea tarea para mañana: llamar a Juan',
    });
    expect(result.intent).toBe('crear_tarea');
    expect(result.extractedParams.titulo).toBe('llamar a Juan');
    expect(result.extractedParams.nombre).toBeUndefined();
    expect(result.extractedParams.fechaVencimiento).toBe(tomorrow());
  });

  it('marca como completada la tarea de llamar a Juan', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'marca como completada la tarea de llamar a Juan',
    });
    expect(result.intent).toBe('completar_tarea');
    expect(result.extractedParams.titulo).toBe('llamar a Juan');
  });

  it('"la tarea ya está completa" NO es completar_tarea (afirmación)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'la tarea ya está completa',
    });
    expect(result.intent).not.toBe('completar_tarea');
  });

  it('"completa el diagnóstico de X" NO es completar_tarea', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'completa el diagnóstico de juan@volkern.test',
    });
    expect(result.intent).not.toBe('completar_tarea');
  });

  it('qué tareas tengo pendientes → mis_tareas', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué tareas tengo pendientes',
    });
    expect(result.intent).toBe('mis_tareas');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('muéstrame mis tareas → mis_tareas', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame mis tareas',
    });
    expect(result.intent).toBe('mis_tareas');
  });

  it('tareas pendientes de juan@volkern.test → mis_tareas con email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'tareas pendientes de juan@volkern.test',
    });
    expect(result.intent).toBe('mis_tareas');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
  });

  it('agrega nota con email y contenido', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega nota a juan@volkern.test: Cliente interesado en paquete premium',
    });
    expect(result.intent).toBe('crear_nota');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
    expect(result.extractedParams.contenido).toContain('Cliente interesado');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('nota para María García: Prefiere contacto por WhatsApp', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'nota para María García: Prefiere contacto por WhatsApp',
    });
    expect(result.intent).toBe('crear_nota');
    expect(result.extractedParams.nombre).toBe('María García');
    expect(result.extractedParams.contenido).toContain('Prefiere contacto');
  });

  it('anota en el perfil de Carlos: … → crear_nota y NO registrar_interaccion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'anota en el perfil de Carlos: Llamar después de las 5pm',
    });
    expect(result.intent).toBe('crear_nota');
    expect(result.intent).not.toBe('registrar_interaccion');
    expect(result.extractedParams.contenido).toContain('Llamar después');
  });

  it('"ponle notas a Juan: Cliente importante" sigue siendo actualizar_lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ponle notas a Juan: Cliente importante',
    });
    expect(result.intent).toBe('actualizar_lead');
    expect(result.extractedParams.contexto).toContain('Cliente importante');
  });

  it('muéstrame las notas de juan@volkern.test → ver_notas con email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame las notas de juan@volkern.test',
    });
    expect(result.intent).toBe('ver_notas');
    expect(result.extractedParams.email).toBe('juan@volkern.test');
  });

  it('qué notas tiene María García → ver_notas con nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué notas tiene María García',
    });
    expect(result.intent).toBe('ver_notas');
    expect(result.extractedParams.nombre).toBe('María García');
  });

  // ═══ OCTAVO ENTRENAMIENTO (módulo Proveedores): crear y listar ═══

  it('registra proveedor con email → crear_proveedor', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra proveedor: Suministros SA, email ventas@suministros.com',
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.extractedParams.nombre).toBe('Suministros SA');
    expect(result.extractedParams.email).toBe('ventas@suministros.com');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('nuevo proveedor tras los dos puntos → crear_proveedor', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'nuevo proveedor: Papelería López',
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.extractedParams.nombre).toBe('Papelería López');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea proveedor con razón social larga (SA de CV)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea proveedor Tecnología Plus SA de CV',
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.extractedParams.nombre).toBe('Tecnología Plus SA de CV');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crear_proveedor sin nombre → pide nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un proveedor',
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('nombre');
  });

  it('multi-turno: completa el nombre del proveedor faltante', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'Suministros del Norte',
      pendingIntent: 'crear_proveedor',
      collectedEntities: { email: 'ventas@suministros.com' },
      missingEntities: ['nombre'],
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.extractedParams.nombre).toBe('Suministros del Norte');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa razón social con SA de CV', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'Tecnología Plus SA de CV',
      pendingIntent: 'crear_proveedor',
      collectedEntities: { email: 'ventas@tech.com' },
      missingEntities: ['nombre'],
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.extractedParams.nombre).toBe('Tecnología Plus SA de CV');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: frase no-nombre NO se captura como nombre del proveedor', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'Fue en comida',
      pendingIntent: 'crear_proveedor',
      collectedEntities: { email: 'ventas@tech.com' },
      missingEntities: ['nombre'],
    });
    // El multi-turno NO captura la frase como nombre (sigue pendiente la
    // intención; el nombre queda undefined).
    expect(result.extractedParams.nombre).toBeUndefined();
    expect(result.intent).toBe('crear_proveedor');
  });

  it('captura categoría y dirección al crear proveedor', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra proveedor: Acme Corp, categoría oficina, dirección Av. Reforma 123',
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.extractedParams.nombre).toBe('Acme Corp');
    expect(result.extractedParams.categoria).toBe('oficina');
    expect(result.extractedParams.direccion).toBe('Av. Reforma 123');
  });

  it('lista los proveedores → listar_proveedores', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista los proveedores',
    });
    expect(result.intent).toBe('listar_proveedores');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué proveedores tengo → listar_proveedores', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué proveedores tengo',
    });
    expect(result.intent).toBe('listar_proveedores');
  });

  it('muéstrame mis proveedores → listar_proveedores', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame mis proveedores',
    });
    expect(result.intent).toBe('listar_proveedores');
  });

  it('proveedores de categoría oficina → listar_proveedores con filtro', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'proveedores de categoría oficina',
    });
    expect(result.intent).toBe('listar_proveedores');
    expect(result.extractedParams.categoria).toBe('oficina');
  });

  it('"registra una llamada con el proveedor Juan" SÍ es interacción (tipo explícito)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra una llamada con el proveedor Juan: tratamos el pedido',
    });
    expect(result.intent).toBe('registrar_interaccion');
    expect(result.intent).not.toBe('crear_proveedor');
  });

  it('"gasto de 300€ en software, proveedor Iberdrola" sigue siendo gasto, no crear_proveedor', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'gasto de 300€ en software, proveedor Iberdrola',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.intent).not.toBe('crear_proveedor');
    expect(result.extractedParams.proveedor).toBe('Iberdrola');
  });

  it('"crea proveedor" NO se confunde con crear_lead ni crear_empresa', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea proveedor Tecnología Plus SA de CV',
    });
    expect(result.intent).toBe('crear_proveedor');
    expect(result.intent).not.toBe('crear_lead');
    expect(result.intent).not.toBe('crear_empresa');
  });

  // ═══ NOVENO ENTRENAMIENTO (módulo Catálogo): buscar, precio y listar ═══

  it('busca cafeteras en el catálogo → buscar_catalogo con query', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca cafeteras en el catálogo',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.query).toContain('cafeteras');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué precio tiene el paquete premium → buscar_catalogo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué precio tiene el paquete premium',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.query).toContain('paquete premium');
  });

  it('cuánto cuesta la consultoría → buscar_catalogo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto cuesta la consultoría',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.query).toContain('consultoría');
  });

  it('busca propiedades en Madrid por menos de 300000 → buscar_inmuebles (módulo RE)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca propiedades en Madrid por menos de 300000',
    });
    expect(result.intent).toBe('buscar_inmuebles');
    expect(result.extractedParams.zona).toBe('Madrid');
  });

  it('qué productos de tipo inmueble por más de 150000 → precioMin', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué productos de tipo inmueble por más de 150000',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.tipo).toBe('inmueble');
    expect(result.extractedParams.precioMin).toBe(150000);
  });

  it('entre 100 y 200 → ambos extremos del rango', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca servicios entre 100 y 200',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.tipo).toBe('servicio');
    expect(result.extractedParams.precioMin).toBe(100);
    expect(result.extractedParams.precioMax).toBe(200);
  });

  it('qué productos hay → buscar_catalogo sin query (listar)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué productos hay',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('lista el catálogo → buscar_catalogo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista el catálogo',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.query).toBeUndefined();
  });

  it('dame la lista de productos y servicios → buscar_catalogo sin query', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la lista de productos y servicios',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.query).toBeUndefined();
  });

  it('lista de productos y servicios → buscar_catalogo sin query', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista de productos y servicios',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.query).toBeUndefined();
  });

  it('muéstrame los servicios disponibles → buscar_catalogo tipo servicio', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame los servicios disponibles',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.extractedParams.tipo).toBe('servicio');
  });

  it('"busca el producto Cafeteras Pro" NO es buscar_lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca el producto Cafeteras Pro',
    });
    expect(result.intent).toBe('buscar_catalogo');
    expect(result.intent).not.toBe('buscar_lead');
  });

  it('"cuánto cuesta fabricar el producto Y" NO es buscar_catalogo (producción)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto cuesta fabricar el producto Y',
    });
    expect(result.intent).not.toBe('buscar_catalogo');
  });

  it('"¿cuánto cuesta la cita de un abogado?" sigue sin ser agendar ni catálogo', async () => {
    const result = await classifier.classify({
      ...base,
      message: '¿cuánto cuesta la cita de un abogado?',
    });
    expect(result.intent).not.toBe('agendar_cita');
    expect(result.intent).not.toBe('mis_citas');
    expect(result.intent).not.toBe('buscar_catalogo');
  });

  // ═══ INVENTARIO / STOCK ═══

  it('cómo está el inventario → salud_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo está el inventario',
    });
    expect(result.intent).toBe('salud_inventario');
  });

  it('qué productos tienen stock bajo → salud_inventario (y NO catálogo)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué productos tienen stock bajo',
    });
    expect(result.intent).toBe('salud_inventario');
    expect(result.intent).not.toBe('buscar_catalogo');
  });

  it('hay riesgo de ruptura de stock → salud_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay riesgo de ruptura de stock',
    });
    expect(result.intent).toBe('salud_inventario');
  });

  it('salud del inventario del producto X → salud_inventario con producto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'salud del inventario del producto Cafetera Pro',
    });
    expect(result.intent).toBe('salud_inventario');
    expect(result.extractedParams.producto).toContain('Cafetera');
  });

  it('entrada de 50 unidades del producto X → ajustar_stock IN', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'entrada de 50 unidades del producto Cafetera Pro',
    });
    expect(result.intent).toBe('ajustar_stock');
    expect(result.extractedParams.cantidad).toBe(50);
    expect(result.extractedParams.tipo).toBe('IN');
    expect(result.extractedParams.producto).toContain('Cafetera');
  });

  it('salida de 10 unidades del producto Y → ajustar_stock OUT', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'salida de 10 unidades del producto Cafetera Pro',
    });
    expect(result.intent).toBe('ajustar_stock');
    expect(result.extractedParams.cantidad).toBe(10);
    expect(result.extractedParams.tipo).toBe('OUT');
  });

  it('ajusta el stock del producto Z, entrada de 5 → ajustar_stock', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ajusta el stock del producto Cafetera Pro, entrada de 5 unidades',
    });
    expect(result.intent).toBe('ajustar_stock');
    expect(result.extractedParams.tipo).toBe('IN');
    expect(result.extractedParams.cantidad).toBe(5);
  });

  it('ajustar_stock sin producto → pide producto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'entrada de 50 unidades',
    });
    expect(result.intent).toBe('ajustar_stock');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('producto');
  });

  it('consume 5 unidades del producto X → consumir_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'consume 5 unidades del producto Cafetera Pro',
    });
    expect(result.intent).toBe('consumir_inventario');
    expect(result.extractedParams.cantidad).toBe(5);
    expect(result.extractedParams.producto).toContain('Cafetera');
  });

  it('descarga 10 del material Z → consumir_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'descarga 10 unidades del material Acero Inoxidable',
    });
    expect(result.intent).toBe('consumir_inventario');
    expect(result.extractedParams.cantidad).toBe(10);
  });

  it('"cómo está el inventario de gastos" NO es salud_inventario (es gasto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo está el inventario de gastos este mes',
    });
    expect(result.intent).toBe('analizar_gastos');
  });

  it('"entrada de datos de Juan" NO es ajustar_stock (sin unidades)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'entrada de datos de Juan Pérez',
    });
    expect(result.intent).not.toBe('ajustar_stock');
  });

  // ═══ NOVENO ENTRENAMIENTO (módulo Seguros): pólizas, renovaciones y siniestros ═══

  // ── crear_poliza ──

  it('crea póliza completa: número, aseguradora implícita y vencimiento', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra la póliza AXA-1234 para Juan Pérez con vencimiento el 2026-12-31',
    });
    expect(result.intent).toBe('crear_poliza');
    expect(result.extractedParams.numeroPoliza).toBe('AXA-1234');
    expect(result.extractedParams.fechaVencimiento).toBe('2026-12-31');
    expect(result.extractedParams.aseguradora).toBe('AXA');
    expect(result.extractedParams.cliente).toBe('Juan Pérez');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea póliza con ramo y prima (sin número → pide número y vencimiento)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea una póliza para maria@empresa.com: producto Vida, aseguradora AXA, prima 850',
    });
    expect(result.intent).toBe('crear_poliza');
    expect(result.extractedParams.aseguradora).toBe('AXA');
    expect(result.extractedParams.ramo).toBe('vida');
    expect(result.extractedParams.primaAnual).toBe(850);
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('numeroPoliza');
    expect(result.missingParams).toContain('fechaVencimiento');
  });

  it('crea póliza sin vencimiento → pide la fecha', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea la póliza POL-001 para Carlos Ruiz con aseguradora MAPFRE',
    });
    expect(result.intent).toBe('crear_poliza');
    expect(result.extractedParams.numeroPoliza).toBe('POL-001');
    expect(result.extractedParams.aseguradora).toBe('MAPFRE');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('fechaVencimiento');
  });

  it('póliza con fecha de inicio explícita ("inicia hoy")', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'nueva póliza: número P-001, cliente Carlos Ruiz, hogar MAPFRE, inicia hoy, vence en 1 año',
    });
    expect(result.intent).toBe('crear_poliza');
    expect(result.extractedParams.numeroPoliza).toBe('P-001');
    expect(result.extractedParams.ramo).toBe('hogar');
    expect(result.extractedParams.aseguradora).toBe('MAPFRE');
    expect(result.extractedParams.cliente).toBe('Carlos Ruiz');
    expect(result.extractedParams.fechaInicio).toBeTruthy();
  });

  it('multi-turno: completa el número de póliza faltante', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'la póliza es AXA-1234',
      pendingIntent: 'crear_poliza',
      collectedEntities: { aseguradora: 'AXA', fechaVencimiento: '2026-12-31' },
      missingEntities: ['numeroPoliza'],
    });
    expect(result.intent).toBe('crear_poliza');
    expect(result.extractedParams.numeroPoliza).toBe('AXA-1234');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa la aseguradora faltante', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'con Qualitas',
      pendingIntent: 'crear_poliza',
      collectedEntities: { numeroPoliza: 'Q-001', fechaVencimiento: '2026-12-31' },
      missingEntities: ['aseguradora'],
    });
    expect(result.intent).toBe('crear_poliza');
    expect(result.extractedParams.aseguradora).toBe('Qualitas');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── mis_polizas ──

  it('muéstrame las pólizas → mis_polizas', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame las pólizas',
    });
    expect(result.intent).toBe('mis_polizas');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('lista las pólizas activas → mis_polizas con estado ACTIVA', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista las pólizas activas',
    });
    expect(result.intent).toBe('mis_polizas');
    expect(result.extractedParams.estado).toBe('ACTIVA');
  });

  it('pólizas del ramo auto → mis_polizas con ramo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pólizas del ramo auto',
    });
    expect(result.intent).toBe('mis_polizas');
    expect(result.extractedParams.ramo).toBe('auto');
  });

  it('ver pólizas de AXA → mis_polizas con aseguradora (y NO cliente)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ver pólizas de AXA',
    });
    expect(result.intent).toBe('mis_polizas');
    expect(result.extractedParams.aseguradora).toBe('AXA');
    expect(result.extractedParams.cliente).toBeUndefined();
  });

  it('qué pólizas tiene Juan Pérez → mis_polizas con cliente', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué pólizas tiene Juan Pérez',
    });
    expect(result.intent).toBe('mis_polizas');
    expect(result.extractedParams.cliente).toBe('Juan Pérez');
  });

  // ── polizas_por_vencer ──

  it('qué pólizas vencen pronto → polizas_por_vencer', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué pólizas vencen pronto',
    });
    expect(result.intent).toBe('polizas_por_vencer');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('pólizas por vencer en 60 días → polizas_por_vencer con dias=60', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pólizas por vencer en 60 días',
    });
    expect(result.intent).toBe('polizas_por_vencer');
    expect(result.extractedParams.dias).toBe(60);
  });

  it('muéstrame las pólizas que vencen este mes → polizas_por_vencer (NO mis_polizas)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame las pólizas que vencen este mes',
    });
    expect(result.intent).toBe('polizas_por_vencer');
    expect(result.intent).not.toBe('mis_polizas');
  });

  it('renovaciones en los próximos 30 días → polizas_por_vencer con dias=30', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'renovaciones en los próximos 30 días',
    });
    expect(result.intent).toBe('polizas_por_vencer');
    expect(result.extractedParams.dias).toBe(30);
  });

  // ── renovaciones_pendientes ──

  it('qué renovaciones están pendientes → renovaciones_pendientes', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué renovaciones están pendientes',
    });
    expect(result.intent).toBe('renovaciones_pendientes');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('renovaciones en riesgo de perderse → renovaciones_pendientes con riesgo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'renovaciones en riesgo de perderse',
    });
    expect(result.intent).toBe('renovaciones_pendientes');
    expect(result.extractedParams.riesgo).toBe(true);
  });

  // ── clientes_sin_contacto ──

  it('qué clientes no tienen contacto hace tiempo → clientes_sin_contacto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué clientes no tienen contacto hace tiempo',
    });
    expect(result.intent).toBe('clientes_sin_contacto');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('clientes sin contacto en 90 días → clientes_sin_contacto con dias=90', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'clientes sin contacto en 90 días',
    });
    expect(result.intent).toBe('clientes_sin_contacto');
    expect(result.extractedParams.dias).toBe(90);
  });

  // ── crear_siniestro ──

  it('reporta siniestro con póliza, descripción y monto reclamado', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'reporta un siniestro para la póliza AXA-1234: colisión leve, monto reclamado 1500',
    });
    expect(result.intent).toBe('crear_siniestro');
    expect(result.extractedParams.poliza).toBe('AXA-1234');
    expect(result.extractedParams.descripcion).toBe('colisión leve');
    expect(result.extractedParams.montoReclamado).toBe(1500);
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea siniestro contra póliza sin descripción → pide descripción', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un siniestro contra POL-001 de Juan Pérez con fecha suceso 2026-07-15',
    });
    expect(result.intent).toBe('crear_siniestro');
    expect(result.extractedParams.poliza).toBe('POL-001');
    expect(result.extractedParams.fechaSuceso).toBe('2026-07-15');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('descripcion');
  });

  it('registra siniestro de la póliza 8888: daño por agua → crear_siniestro (NO interacción)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un siniestro de la póliza 8888: daño por agua en el local',
    });
    expect(result.intent).toBe('crear_siniestro');
    expect(result.intent).not.toBe('registrar_interaccion');
    expect(result.extractedParams.poliza).toBe('8888');
    expect(result.extractedParams.descripcion).toContain('daño por agua');
  });

  it('siniestro sin póliza → pide la póliza', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un siniestro: daño por agua en el local',
    });
    expect(result.intent).toBe('crear_siniestro');
    expect(result.extractedParams.descripcion).toContain('daño por agua');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('poliza');
  });

  it('multi-turno: completa la póliza faltante del siniestro', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'es la póliza POL-001',
      pendingIntent: 'crear_siniestro',
      collectedEntities: { descripcion: 'daño por agua' },
      missingEntities: ['poliza'],
    });
    expect(result.intent).toBe('crear_siniestro');
    expect(result.extractedParams.poliza).toBe('POL-001');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── listar_siniestros ──

  it('muéstrame los siniestros → listar_siniestros', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame los siniestros',
    });
    expect(result.intent).toBe('listar_siniestros');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué siniestros están abiertos → listar_siniestros con estado ABIERTO', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué siniestros están abiertos',
    });
    expect(result.intent).toBe('listar_siniestros');
    expect(result.extractedParams.estado).toBe('ABIERTO');
  });

  it('siniestros de AXA → listar_siniestros con aseguradora', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'siniestros de AXA',
    });
    expect(result.intent).toBe('listar_siniestros');
    expect(result.extractedParams.aseguradora).toBe('AXA');
  });

  it('cuántos siniestros tiene Juan Pérez → listar_siniestros con cliente', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuántos siniestros tiene Juan Pérez',
    });
    expect(result.intent).toBe('listar_siniestros');
    expect(result.extractedParams.cliente).toBe('Juan Pérez');
  });

  // ── actualizar_siniestro ──

  it('pasa el siniestro SIN-001 a en trámite → estado EN_TRAMITE', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pasa el siniestro SIN-001 a en trámite',
    });
    expect(result.intent).toBe('actualizar_siniestro');
    expect(result.extractedParams.siniestro).toBe('SIN-001');
    expect(result.extractedParams.estado).toBe('EN_TRAMITE');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('marca como pagado el siniestro con indemnización → PAGADO + monto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'marca como pagado el siniestro de la póliza AXA-1234 con indemnización 1200',
    });
    expect(result.intent).toBe('actualizar_siniestro');
    expect(result.extractedParams.estado).toBe('PAGADO');
    expect(result.extractedParams.montoIndemnizado).toBe(1200);
    expect(result.extractedParams.siniestro).toBe('AXA-1234');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('rechaza el siniestro SIN-002 por no estar cubierto → RECHAZADO + motivo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'rechaza el siniestro SIN-002 por no estar cubierto',
    });
    expect(result.intent).toBe('actualizar_siniestro');
    expect(result.extractedParams.siniestro).toBe('SIN-002');
    expect(result.extractedParams.estado).toBe('RECHAZADO');
    expect(result.extractedParams.motivoRechazo).toContain('no estar cubierto');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cierra el siniestro SIN-003 → CERRADO', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cierra el siniestro SIN-003',
    });
    expect(result.intent).toBe('actualizar_siniestro');
    expect(result.extractedParams.siniestro).toBe('SIN-003');
    expect(result.extractedParams.estado).toBe('CERRADO');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa el estado faltante del siniestro', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'a pagado',
      pendingIntent: 'actualizar_siniestro',
      collectedEntities: { siniestro: 'SIN-001' },
      missingEntities: ['estado'],
    });
    expect(result.intent).toBe('actualizar_siniestro');
    expect(result.extractedParams.estado).toBe('PAGADO');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── negativos de seguros ──

  it('"pago la factura de juan@volkern.test" NO es actualizar_siniestro', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pago la factura de juan@volkern.test',
    });
    expect(result.intent).not.toBe('actualizar_siniestro');
    expect(result.intent).not.toBe('crear_siniestro');
  });

  it('"registra un gasto de 50€: comida" sigue siendo gasto (no siniestro)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un gasto de 50€: comida',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.intent).not.toBe('crear_siniestro');
  });

  it('"agrega pendiente: enviar documento, vence el viernes" sigue siendo crear_tarea', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'agrega pendiente: enviar documento a Carlos, vence el viernes',
    });
    expect(result.intent).toBe('crear_tarea');
    expect(result.intent).not.toBe('polizas_por_vencer');
  });

  it('"convierte a juan@volkern.test en contacto" sigue siendo convertir_lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'convierte a juan@volkern.test en contacto',
    });
    expect(result.intent).toBe('convertir_lead');
    expect(result.intent).not.toBe('actualizar_siniestro');
  });

  // ═══ DÉCIMO ENTRENAMIENTO (módulo Facturación): crear, cancelar, estado
  // fiscal y rectificar facturas Veri*factu ═══

  // ── crear_factura ──
  it('genera una factura para el lead juan@email.com → crear_factura con cliente email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera una factura para el lead juan@email.com',
    });
    expect(result.intent).toBe('crear_factura');
    expect(result.extractedParams.cliente).toBe('juan@email.com');
    // Falta el monto → pide el dato (multi-turno)
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('monto');
  });

  it('crea factura para María García por 5000€ → crear_factura completo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea factura para María García por 5000€',
    });
    expect(result.intent).toBe('crear_factura');
    expect(result.extractedParams.cliente).toBe('María García');
    expect(result.extractedParams.monto).toBe(5000);
    expect(result.needsMoreInfo).toBe(false);
  });

  it('factura para Carlos Ruiz por consultoría → crear_factura con concepto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'factura para Carlos Ruiz por consultoría',
    });
    expect(result.intent).toBe('crear_factura');
    expect(result.extractedParams.cliente).toBe('Carlos Ruiz');
    expect(result.extractedParams.concepto).toBe('consultoría');
    expect(result.needsMoreInfo).toBe(true);
  });

  it('multi-turno: completa el monto faltante de crear_factura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'por 750 euros',
      pendingIntent: 'crear_factura',
      collectedEntities: { cliente: 'juan@email.com' },
      missingEntities: ['monto'],
    });
    expect(result.intent).toBe('crear_factura');
    // extractParamDeterministically normaliza a string; el wrapper lo convierte a number
    expect(result.extractedParams.monto).toBe('750');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa el cliente faltante de crear_factura con email', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'el cliente es maria@empresa.com',
      pendingIntent: 'crear_factura',
      collectedEntities: { monto: 5000 },
      missingEntities: ['cliente'],
    });
    expect(result.intent).toBe('crear_factura');
    expect(result.extractedParams.cliente).toBe('maria@empresa.com');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── cancelar_factura ──
  it('cancela la factura FAC-001 → cancelar_factura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cancela la factura FAC-001',
    });
    expect(result.intent).toBe('cancelar_factura');
    expect(result.extractedParams.factura).toBe('FAC-001');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('anula la factura #123 → cancelar_factura con factura 123', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'anula la factura #123',
    });
    expect(result.intent).toBe('cancelar_factura');
    expect(result.extractedParams.factura).toBe('123');
  });

  it('cancelar factura de Juan Pérez, motivo: error en datos → pide el número', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cancelar factura de Juan Pérez, motivo: error en datos',
    });
    expect(result.intent).toBe('cancelar_factura');
    expect(result.extractedParams.motivo).toBe('error en datos');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('factura');
  });

  // ── estado_fiscal ──
  it('dime el estado fiscal de la factura FAC-001 → estado_fiscal', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dime el estado fiscal de la factura FAC-001',
    });
    expect(result.intent).toBe('estado_fiscal');
    expect(result.extractedParams.factura).toBe('FAC-001');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('verifica la integridad de la factura #123 → estado_fiscal', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'verifica la integridad de la factura #123',
    });
    expect(result.intent).toBe('estado_fiscal');
    expect(result.extractedParams.factura).toBe('123');
  });

  it('estado de la factura de juan@email.com → estado_fiscal sin número (pide)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'estado de la factura de juan@email.com',
    });
    expect(result.intent).toBe('estado_fiscal');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('factura');
  });

  // ── rectificar_factura ──
  it('rectifica la factura FAC-001, el monto correcto es 4500€ → rectificar_factura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'rectifica la factura FAC-001, el monto correcto es 4500€',
    });
    expect(result.intent).toBe('rectificar_factura');
    expect(result.extractedParams.factura).toBe('FAC-001');
    expect(result.extractedParams.monto).toBe(4500);
    // Falta el motivo de la rectificación
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('razon');
  });

  it('corrige la factura #123 por error en el concepto → rectificar_factura completo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'corrige la factura #123 por error en el concepto',
    });
    expect(result.intent).toBe('rectificar_factura');
    expect(result.extractedParams.factura).toBe('123');
    expect(result.extractedParams.razon).toBe('error en el concepto');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa el motivo de rectificar_factura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'por un error en el cálculo del IVA',
      pendingIntent: 'rectificar_factura',
      collectedEntities: { factura: 'FAC-001', monto: 4500 },
      missingEntities: ['razon'],
    });
    expect(result.intent).toBe('rectificar_factura');
    expect(result.extractedParams.razon).toBe('un error en el cálculo del IVA');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── negativos de facturación ──

  it('"pago la factura de juan@volkern.test" NO es crear_factura', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pago la factura de juan@volkern.test',
    });
    expect(result.intent).not.toBe('crear_factura');
    expect(result.intent).not.toBe('cancelar_factura');
  });

  it('"registra un gasto de 50€: comida" sigue siendo gasto (no facturación)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un gasto de 50€: comida',
    });
    expect(result.intent).toBe('registrar_gasto');
    expect(result.intent).not.toBe('crear_factura');
  });

  it('"verifica la integridad de los gastos" NO es estado_fiscal', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'verifica la integridad de los gastos',
    });
    expect(result.intent).not.toBe('estado_fiscal');
  });

  it('"crea un lead de la empresa facturación SA" sigue siendo crear_lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un lead de la empresa Facturación SA, pedro@facturacion.test',
    });
    expect(result.intent).toBe('crear_lead');
    expect(result.intent).not.toBe('crear_factura');
  });

  // ═══ UNDÉCIMO ENTRENAMIENTO (módulo Logística): envíos, pedidos, flota,
  // rutas y almacén ═══

  // ── rastrear_pedido ──
  it('rastrea el pedido #ORD-456 → rastrear_pedido con pedidoId', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'rastrea el pedido #ORD-456',
    });
    expect(result.intent).toBe('rastrear_pedido');
    expect(result.extractedParams.pedidoId).toBe('ORD-456');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('en qué estado está mi pedido #PED-100 → rastrear_pedido', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'en qué estado está mi pedido #PED-100',
    });
    expect(result.intent).toBe('rastrear_pedido');
    expect(result.extractedParams.pedidoId).toBe('PED-100');
  });

  it('seguimiento del pedido de María García → rastrear_pedido sin ref (pide)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'seguimiento del pedido de María García',
    });
    expect(result.intent).toBe('rastrear_pedido');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('pedidoId');
  });

  // ── tracking_envio / estado_envio ──
  it('cuál es el estado del envío con tracking TRK-12345 → tracking_envio', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuál es el estado del envío con tracking TRK-12345',
    });
    expect(result.intent).toBe('tracking_envio');
    expect(result.extractedParams.tracking).toBe('TRK-12345');
  });

  it('consultar el tracking del paquete → tracking_envio sin número (pide)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'consultar el tracking del paquete',
    });
    expect(result.intent).toBe('tracking_envio');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('tracking');
  });

  it('dónde está mi envío TRK-998 → estado_envio con tracking', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dónde está mi envío TRK-998',
    });
    expect(result.intent).toBe('estado_envio');
    expect(result.extractedParams.tracking).toBe('TRK-998');
  });

  it('dónde está el envío ABC-987 → estado_envio', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dónde está el envío ABC-987',
    });
    expect(result.intent).toBe('estado_envio');
    expect(result.extractedParams.tracking).toBe('ABC-987');
  });

  it('multi-turno: completa el tracking faltante de tracking_envio', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'el tracking es TRK-999',
      pendingIntent: 'tracking_envio',
      collectedEntities: {},
      missingEntities: ['tracking'],
    });
    expect(result.intent).toBe('tracking_envio');
    expect(result.extractedParams.tracking).toBe('TRK-999');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── flota ──
  it('cómo está la flota de vehículos → estado_flota', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo está la flota de vehículos',
    });
    expect(result.intent).toBe('estado_flota');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('dame la salud de la flota → salud_flota', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la salud de la flota',
    });
    expect(result.intent).toBe('salud_flota');
  });

  it('qué mantenimientos pendientes hay → salud_flota', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué mantenimientos pendientes hay',
    });
    expect(result.intent).toBe('salud_flota');
  });

  it('qué vehículos tienen ITV próxima a vencer → salud_flota', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué vehículos tienen ITV próxima a vencer',
    });
    expect(result.intent).toBe('salud_flota');
  });

  it('estado del vehículo VEH-001 → estado_flota con vehiculoId', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'estado del vehículo VEH-001',
    });
    expect(result.intent).toBe('estado_flota');
    expect(result.extractedParams.vehiculoId).toBe('VEH-001');
  });

  // ── optimizar_ruta / reorganizar_almacen ──
  it('optimiza la ruta de reparto para mañana → optimizar_ruta con fecha', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'optimiza la ruta de reparto para mañana',
    });
    expect(result.intent).toBe('optimizar_ruta');
    expect(result.extractedParams.fecha).toBeTruthy();
  });

  it('sugiere la mejor ruta para los pedidos pendientes → optimizar_ruta', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere la mejor ruta para los pedidos pendientes',
    });
    expect(result.intent).toBe('optimizar_ruta');
    expect(result.intent).not.toBe('rastrear_pedido');
  });

  it('cómo puedo organizar las entregas de mañana → optimizar_ruta', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo puedo organizar las entregas de mañana',
    });
    expect(result.intent).toBe('optimizar_ruta');
  });

  it('sugiere cómo reorganizar el almacén → reorganizar_almacen', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere cómo reorganizar el almacén',
    });
    expect(result.intent).toBe('reorganizar_almacen');
  });

  it('cómo puedo optimizar el espacio del almacén → reorganizar_almacen', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo puedo optimizar el espacio del almacén',
    });
    expect(result.intent).toBe('reorganizar_almacen');
  });

  it('reorganización del almacén principal → reorganizar_almacen con almacenId', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'reorganización del almacén principal',
    });
    expect(result.intent).toBe('reorganizar_almacen');
    expect(result.extractedParams.almacenId).toBe('principal');
  });

  // ── negativos de logística ──

  it('"envía un mensaje a juan@volkern.test" NO es estado_envio', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'envía un mensaje a juan@volkern.test',
    });
    expect(result.intent).not.toBe('estado_envio');
    expect(result.intent).not.toBe('tracking_envio');
  });

  it('"dame mi salud financiera" NO es salud_flota', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame mi salud financiera',
    });
    expect(result.intent).toBe('analizar_gastos');
    expect(result.intent).not.toBe('salud_flota');
  });

  it('"cuánto stock hay de X" NO es reorganizar_almacen', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto stock hay del producto X',
    });
    expect(result.intent).not.toBe('reorganizar_almacen');
    expect(result.intent).not.toBe('optimizar_ruta');
  });

  // ═══ DUODÉCIMO ENTRENAMIENTO (módulo RRHH): briefing, vacaciones y riesgo
  // de rotación ═══

  // ── resumen_rrhh ──
  it('dame el resumen diario de RH → resumen_rrhh', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame el resumen diario de RH',
    });
    expect(result.intent).toBe('resumen_rrhh');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('briefing de recursos humanos → resumen_rrhh', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'briefing de recursos humanos',
    });
    expect(result.intent).toBe('resumen_rrhh');
  });

  it('cómo está el equipo hoy → resumen_rrhh', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo está el equipo hoy',
    });
    expect(result.intent).toBe('resumen_rrhh');
  });

  it('estado de fuerza del día → resumen_rrhh', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'estado de fuerza del día',
    });
    expect(result.intent).toBe('resumen_rrhh');
  });

  // ── aprobar_vacaciones ──
  it('aprueba la solicitud de vacaciones #123 → aprobar_vacaciones con solicitudId', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'aprueba la solicitud de vacaciones #123',
    });
    expect(result.intent).toBe('aprobar_vacaciones');
    expect(result.extractedParams.solicitudId).toBe('123');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('autoriza vacaciones de María con nota → aprobar_vacaciones con nombre y nota', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'autoriza vacaciones de María con nota: "Disfruta tus días"',
    });
    expect(result.intent).toBe('aprobar_vacaciones');
    expect(result.extractedParams.nombre).toBe('María');
    expect(result.extractedParams.nota).toContain('Disfruta tus días');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('confirma la solicitud de vacaciones de Juan Pérez → aprobar_vacaciones por nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'confirma la solicitud de vacaciones de Juan Pérez',
    });
    expect(result.intent).toBe('aprobar_vacaciones');
    expect(result.extractedParams.nombre).toBe('Juan Pérez');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('aprueba la solicitud de vacaciones VAC-88 → aprobar_vacaciones con solicitudId', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'aprueba la solicitud de vacaciones VAC-88',
    });
    expect(result.intent).toBe('aprobar_vacaciones');
    expect(result.extractedParams.solicitudId).toBe('VAC-88');
  });

  it('aprueba las vacaciones sin contacto → pide la solicitud', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'aprueba las vacaciones',
    });
    expect(result.intent).toBe('aprobar_vacaciones');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('solicitudId');
  });

  it('multi-turno: completa la solicitud de aprobar_vacaciones por nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'la de María',
      pendingIntent: 'aprobar_vacaciones',
      collectedEntities: {},
      missingEntities: ['solicitudId'],
    });
    expect(result.intent).toBe('aprobar_vacaciones');
    expect(result.extractedParams.solicitudId).toBe('María');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── riesgo_rotacion ──
  it('analiza el riesgo de rotación del equipo → riesgo_rotacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza el riesgo de rotación del equipo',
    });
    expect(result.intent).toBe('riesgo_rotacion');
    expect(result.extractedParams.nombre).toBeUndefined();
    expect(result.needsMoreInfo).toBe(false);
  });

  it('quién tiene riesgo de irse → riesgo_rotacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'quién tiene riesgo de irse',
    });
    expect(result.intent).toBe('riesgo_rotacion');
  });

  it('dame el análisis de retención de talento → riesgo_rotacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame el análisis de retención de talento',
    });
    expect(result.intent).toBe('riesgo_rotacion');
  });

  it('analiza el riesgo de rotación de María → riesgo_rotacion con nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza el riesgo de rotación de María',
    });
    expect(result.intent).toBe('riesgo_rotacion');
    expect(result.extractedParams.nombre).toBe('María');
  });

  it('multi-turno: completa el empleado de riesgo_rotacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'de Carlos',
      pendingIntent: 'riesgo_rotacion',
      collectedEntities: {},
      missingEntities: ['empleadoId'],
    });
    expect(result.intent).toBe('riesgo_rotacion');
    expect(result.extractedParams.empleadoId).toBe('Carlos');
  });

  // ── negativos de RRHH ──
  it('"aprueba el gasto de 50 euros" NO es aprobar_vacaciones', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'aprueba el gasto de 50 euros',
    });
    expect(result.intent).not.toBe('aprobar_vacaciones');
  });

  it('"dame el estado de la flota" NO es resumen_rrhh', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame el estado de la flota',
    });
    expect(result.intent).toBe('estado_flota');
    expect(result.intent).not.toBe('resumen_rrhh');
  });

  it('"cuántas vacaciones le quedan a María" NO es aprobar_vacaciones', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuántas vacaciones le quedan a María',
    });
    expect(result.intent).not.toBe('aprobar_vacaciones');
  });

  it('"envía un briefing de ventas" NO es resumen_rrhh', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'envía un briefing de ventas',
    });
    expect(result.intent).not.toBe('resumen_rrhh');
  });

  // ═══ DÉCIMO TERCER ENTRENAMIENTO (módulo Marketing + ADS): copy,
  // sentimiento, campañas, bloques web, SEO, automatización y tests A/B ═══

  // ── generar_copy ──
  it('genera un copy para email sobre nuestro nuevo producto → generar_copy', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera un copy para una campaña de email sobre nuestro nuevo producto',
    });
    expect(result.intent).toBe('generar_copy');
    expect(result.extractedParams.tema).toBe('nuestro nuevo producto');
    expect(result.extractedParams.formato).toBe('EMAIL');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea un post promocionando descuento → generar_copy con tema', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un post para redes sociales promocionando descuento',
    });
    expect(result.intent).toBe('generar_copy');
    expect(result.extractedParams.tema).toBe('descuento');
    expect(result.extractedParams.formato).toBe('EMAIL');
  });

  it('escribe un texto publicitario para LinkedIn → generar_copy sin tema (pide)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'escribe un texto publicitario para LinkedIn',
    });
    expect(result.intent).toBe('generar_copy');
    expect(result.extractedParams.formato).toBe('LINKEDIN');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('tema');
  });

  it('genera un copy con tono formal → extrae tono professional', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera un copy sobre el nuevo servicio con un tono formal',
    });
    expect(result.intent).toBe('generar_copy');
    expect(result.extractedParams.tono).toBe('professional');
  });

  it('multi-turno: completa el tema faltante de generar_copy', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sobre nuestro nuevo producto',
      pendingIntent: 'generar_copy',
      collectedEntities: { formato: 'EMAIL' },
      missingEntities: ['tema'],
    });
    expect(result.intent).toBe('generar_copy');
    expect(result.extractedParams.tema).toBe('nuestro nuevo producto');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── analizar_sentimiento ──
  it('analiza el sentimiento de este feedback: "El servicio fue excelente"', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza el sentimiento de este feedback: "El servicio fue excelente"',
    });
    expect(result.intent).toBe('analizar_sentimiento');
    expect(result.extractedParams.texto).toBe('El servicio fue excelente');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('analiza estos comentarios: "Muy mal servicio" → analizar_sentimiento', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza estos comentarios: "Muy mal servicio"',
    });
    expect(result.intent).toBe('analizar_sentimiento');
    expect(result.extractedParams.texto).toBe('Muy mal servicio');
  });

  it('qué opinan los clientes sobre nosotros → analizar_sentimiento (pide texto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué opinan los clientes sobre nosotros',
    });
    expect(result.intent).toBe('analizar_sentimiento');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('texto');
  });

  // ── sugerir_campania ──
  it('sugiere mejoras para mi campaña actual → sugerir_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere mejoras para mi campaña actual',
    });
    expect(result.intent).toBe('sugerir_campania');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cómo puedo optimizar mis campañas de marketing → sugerir_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo puedo optimizar mis campañas de marketing',
    });
    expect(result.intent).toBe('sugerir_campania');
    expect(result.intent).not.toBe('optimizar_ruta');
  });

  it('dame sugerencias de campaña → sugerir_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame sugerencias de campaña',
    });
    expect(result.intent).toBe('sugerir_campania');
  });

  // ── generar_web_block ──
  it('genera un bloque hero para la landing de mi producto → generar_web_block', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera un bloque hero para la landing de mi producto',
    });
    expect(result.intent).toBe('generar_web_block');
    expect(result.extractedParams.tipoBloque).toBe('hero');
    expect(result.extractedParams.producto).toBe('mi producto');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('dame un bloque CTA para promocionar el servicio → generar_web_block', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame un bloque CTA para promocionar el servicio',
    });
    expect(result.intent).toBe('generar_web_block');
    expect(result.extractedParams.tipoBloque).toBe('cta');
    expect(result.extractedParams.producto).toBe('el servicio');
  });

  it('crea una sección de testimonios para la web → generar_web_block (español)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea una sección de testimonios para la web',
    });
    expect(result.intent).toBe('generar_web_block');
    expect(result.extractedParams.tipoBloque).toBe('testimonials');
    expect(result.needsMoreInfo).toBe(true);
  });

  it('genera un bloque sin tipo → pide tipoBloque', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera un bloque para mi landing',
    });
    expect(result.intent).toBe('generar_web_block');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('tipoBloque');
  });

  // ── generar_seo ──
  it('genera el SEO para la página de servicios → generar_seo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera el SEO para la página de servicios',
    });
    expect(result.intent).toBe('generar_seo');
    expect(result.extractedParams.tituloPagina).toBe('servicios');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('dame metadatos SEO para mi landing de ventas → generar_seo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame metadatos SEO para mi landing de ventas',
    });
    expect(result.intent).toBe('generar_seo');
    expect(result.extractedParams.tituloPagina).toBe('ventas');
    expect(result.intent).not.toBe('generar_web_block');
  });

  it('crea keywords para mi página de producto → generar_seo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea keywords para mi página de producto',
    });
    expect(result.intent).toBe('generar_seo');
    expect(result.extractedParams.tituloPagina).toBe('producto');
  });

  it('genera el SEO sin página → pide tituloPagina', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera el SEO',
    });
    expect(result.intent).toBe('generar_seo');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('tituloPagina');
  });

  // ── sugerir_automatizacion ──
  it('sugiere reglas de automatización para mi negocio → sugerir_automatizacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere reglas de automatización para mi negocio',
    });
    expect(result.intent).toBe('sugerir_automatizacion');
  });

  it('cómo puedo automatizar mi marketing → sugerir_automatizacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo puedo automatizar mi marketing',
    });
    expect(result.intent).toBe('sugerir_automatizacion');
  });

  // ── ADS: programar_campania / listar_horarios / eliminar_horario ──
  it('pausa mi campaña de Google Ads los fines de semana → programar_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'pausa mi campaña de Google Ads los fines de semana',
    });
    expect(result.intent).toBe('programar_campania');
    expect(result.extractedParams.campania).toBe('Google Ads');
    expect(result.extractedParams.accion).toBe('PAUSE');
    expect(result.extractedParams.dias).toEqual(['SAT', 'SUN']);
    expect(result.needsMoreInfo).toBe(false);
  });

  it('programa mi campaña de Meta en horario laboral → programar_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'programa mi campaña de Meta para que se active en horario laboral',
    });
    expect(result.intent).toBe('programar_campania');
    expect(result.extractedParams.campania).toBe('Meta');
    expect(result.extractedParams.accion).toBe('ACTIVATE');
    expect(result.extractedParams.horaInicio).toBe('09:00');
    expect(result.extractedParams.horaFin).toBe('18:00');
  });

  it('activa la campaña de verano de lunes a viernes de 9 a 18 → días y horario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'activa la campaña de verano solo de lunes a viernes de 9 a 18',
    });
    expect(result.intent).toBe('programar_campania');
    expect(result.extractedParams.campania).toBe('verano');
    expect(result.extractedParams.dias).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(result.extractedParams.horaInicio).toBe('09:00');
    expect(result.extractedParams.horaFin).toBe('18:00');
  });

  it('muéstrame las programaciones activas → listar_horarios', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame las programaciones activas',
    });
    expect(result.intent).toBe('listar_horarios');
  });

  it('elimina la programación de la campaña de verano → eliminar_horario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'elimina la programación de la campaña de verano',
    });
    expect(result.intent).toBe('eliminar_horario');
    expect(result.extractedParams.programacion).toBe('verano');
  });

  it('borra el horario de la campaña de Meta → eliminar_horario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'borra el horario de la campaña de Meta',
    });
    expect(result.intent).toBe('eliminar_horario');
    expect(result.extractedParams.programacion).toBe('Meta');
  });

  it('elimina la programación sin referir → pide programacion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'elimina la programación',
    });
    expect(result.intent).toBe('eliminar_horario');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('programacion');
  });

  // ── ADS: tests A/B ──
  it('crea un test A/B para la campaña de verano → crear_test_ab', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un test A/B para la campaña de verano',
    });
    expect(result.intent).toBe('crear_test_ab');
    expect(result.extractedParams.campania).toBe('verano');
    expect(result.extractedParams.nombre).toBe('Test A/B — verano');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea un test A/B sin campaña → pide campania (no nombre, se sintetiza)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un test A/B',
    });
    expect(result.intent).toBe('crear_test_ab');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('campania');
    expect(result.missingParams).not.toContain('nombre');
  });

  it('inicia el test A/B de la campaña de verano → iniciar_test_ab', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'inicia el test A/B de la campaña de verano',
    });
    expect(result.intent).toBe('iniciar_test_ab');
    expect(result.extractedParams.test).toBe('verano');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cómo va el test A/B de la campaña de productos → evaluar_test_ab', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo va el test A/B de la campaña de productos',
    });
    expect(result.intent).toBe('evaluar_test_ab');
    expect(result.extractedParams.test).toBe('productos');
  });

  it('dame la significancia del test de la campaña de verano → evaluar_test_ab', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la significancia del test de la campaña de verano',
    });
    expect(result.intent).toBe('evaluar_test_ab');
    expect(result.extractedParams.test).toBe('verano');
  });

  it('declara ganador el test A/B de la campaña de verano → declarar_ganador', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'declara ganador el test A/B de la campaña de verano',
    });
    expect(result.intent).toBe('declarar_ganador');
    expect(result.extractedParams.test).toBe('verano');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('declara ganadora la variante B del test de Facebook → variante B', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'declara ganadora la variante B del test de Facebook',
    });
    expect(result.intent).toBe('declarar_ganador');
    expect(result.extractedParams.test).toBe('Facebook');
    expect(result.extractedParams.variante).toBe('B');
  });

  // ── negativos de marketing/ads ──
  it('"genera un informe de ventas" NO es generar_copy', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera un informe de ventas',
    });
    expect(result.intent).not.toBe('generar_copy');
  });

  it('"analiza mis gastos" NO es analizar_sentimiento', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza mis gastos',
    });
    expect(result.intent).toBe('analizar_gastos');
    expect(result.intent).not.toBe('analizar_sentimiento');
  });

  it('"sugiere una ruta de reparto" NO es sugerir_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere una ruta de reparto',
    });
    expect(result.intent).toBe('optimizar_ruta');
    expect(result.intent).not.toBe('sugerir_campania');
  });

  it('"programa una reunión para mañana" NO es programar_campania', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'programa una reunión para mañana',
    });
    expect(result.intent).not.toBe('programar_campania');
  });

  it('"crea un lead de la empresa Facturación SA" sigue siendo crear_lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un lead de la empresa Facturación SA',
    });
    expect(result.intent).toBe('crear_lead');
  });

  // ═══ DÉCIMO CUARTO ENTRENAMIENTO (módulo Real Estate): descripciones,
  // precios, scores, búsqueda, recomendaciones y comisiones ═══

  // ── generar_descripcion_inmueble ──
  it('genera la descripción de la propiedad #PROP-001 → generar_descripcion_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera la descripción de la propiedad #PROP-001',
    });
    expect(result.intent).toBe('generar_descripcion_inmueble');
    expect(result.extractedParams.propiedad).toBe('PROP-001');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('escribe la descripción de la casa en venta → genera descripción (ref tipo)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'escribe la descripción de la casa en venta',
    });
    expect(result.intent).toBe('generar_descripcion_inmueble');
    expect(result.extractedParams.propiedad).toBe('casa');
  });

  it('redacta la descripción del departamento en la playa → zona como ref', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'redacta la descripción del departamento en la playa',
    });
    expect(result.intent).toBe('generar_descripcion_inmueble');
    expect(result.extractedParams.propiedad).toBe('playa');
  });

  it('genera la descripción sin propiedad → pide propiedad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera la descripción',
    });
    expect(result.intent).not.toBe('generar_descripcion_inmueble');
  });

  // ── sugerir_precio_inmueble ──
  it('sugiere un precio para la propiedad #PROP-001 → sugerir_precio_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere un precio para la propiedad #PROP-001',
    });
    expect(result.intent).toBe('sugerir_precio_inmueble');
    expect(result.extractedParams.propiedad).toBe('PROP-001');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('a qué precio debería vender la casa de la colonia Roma → precio venta', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'a qué precio debería vender la casa de la colonia Roma',
    });
    expect(result.intent).toBe('sugerir_precio_inmueble');
    expect(result.extractedParams.propiedad).toBe('colonia Roma');
    expect(result.extractedParams.tipo_operacion).toBe('venta');
  });

  it('cuánto vale alquilar el departamento del centro → precio alquiler', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto vale alquilar el departamento del centro',
    });
    expect(result.intent).toBe('sugerir_precio_inmueble');
    expect(result.extractedParams.propiedad).toBe('centro');
    expect(result.extractedParams.tipo_operacion).toBe('alquiler');
  });

  it('sugiere un precio sin propiedad → pide propiedad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere un precio',
    });
    expect(result.intent).not.toBe('sugerir_precio_inmueble');
  });

  // ── calificar_inmueble ──
  it('califica la propiedad #PROP-001 → calificar_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'califica la propiedad #PROP-001',
    });
    expect(result.intent).toBe('calificar_inmueble');
    expect(result.extractedParams.propiedad).toBe('PROP-001');
  });

  it('qué score de calidad tiene el inmueble del centro → calificar_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué score de calidad tiene el inmueble del centro',
    });
    expect(result.intent).toBe('calificar_inmueble');
    expect(result.extractedParams.propiedad).toBe('centro');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa la propiedad de calificar_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'la del centro',
      pendingIntent: 'calificar_inmueble',
      collectedEntities: {},
      missingEntities: ['propiedadId'],
    });
    expect(result.intent).toBe('calificar_inmueble');
    expect(result.extractedParams.propiedadId).toBe('centro');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── buscar_inmuebles ──
  it('busca inmuebles en venta en Madrid → buscar_inmuebles', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca inmuebles en venta en Madrid',
    });
    expect(result.intent).toBe('buscar_inmuebles');
    expect(result.extractedParams.tipo_operacion).toBe('venta');
    expect(result.extractedParams.zona).toBe('Madrid');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué departamentos en alquiler hay en Barcelona → tipo y zona', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué departamentos en alquiler hay en Barcelona',
    });
    expect(result.intent).toBe('buscar_inmuebles');
    expect(result.extractedParams.tipo_operacion).toBe('alquiler');
    expect(result.extractedParams.tipo_inmueble).toBe('Departamento');
    expect(result.extractedParams.zona).toBe('Barcelona');
  });

  it('encuentra casas con alberca en la playa → tipo casa y zona playa', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'encuentra casas con alberca en la playa',
    });
    expect(result.intent).toBe('buscar_inmuebles');
    expect(result.extractedParams.tipo_inmueble).toBe('Casa');
    expect(result.extractedParams.zona).toBe('la playa');
  });

  it('busca propiedades de lujo con más de 3 habitaciones → habitaciones', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca propiedades de lujo con más de 3 habitaciones',
    });
    expect(result.intent).toBe('buscar_inmuebles');
    expect(result.extractedParams.habitaciones).toBe('3');
  });

  it('"busca un producto en el catálogo" NO es buscar_inmuebles', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'busca un producto en el catálogo',
    });
    expect(result.intent).not.toBe('buscar_inmuebles');
    expect(result.intent).toBe('buscar_catalogo');
  });

  // ── recomendar_inmuebles ──
  it('recomiéndame propiedades para un inversor con presupuesto de 500k', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'recomiéndame propiedades para un inversor con presupuesto de 500k',
    });
    expect(result.intent).toBe('recomendar_inmuebles');
    expect(result.extractedParams.presupuesto).toBe('500000');
    expect(result.extractedParams.tipo_operacion).toBe('venta');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('sugiere propiedades para alguien que quiere alquilar oficina → alquiler', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere propiedades para alguien que quiere alquilar oficina',
    });
    expect(result.intent).toBe('recomendar_inmuebles');
    expect(result.extractedParams.tipo_operacion).toBe('alquiler');
  });

  // ── calcular_comision_franquicia ──
  it('calcula la comisión de la propiedad #PROP-001 → calcular_comision_franquicia', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'calcula la comisión de la propiedad #PROP-001',
    });
    expect(result.intent).toBe('calcular_comision_franquicia');
    expect(result.extractedParams.propiedad).toBe('PROP-001');
  });

  it('cuánto gana el agente por la venta del inmueble → comisión (pide propiedad)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto gana el agente por la venta del inmueble',
    });
    expect(result.intent).toBe('calcular_comision_franquicia');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('propiedadId');
  });

  // ── negativos de real estate ──
  it('"genera la descripción del producto X" NO es real estate', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera la descripción del producto X',
    });
    expect(result.intent).not.toBe('generar_descripcion_inmueble');
  });

  it('"califica el lead de Juan" NO es calificar_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'califica el lead de Juan',
    });
    expect(result.intent).not.toBe('calificar_inmueble');
  });

  it('"cuánto cuesta el producto X" NO es sugerir_precio_inmueble', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto cuesta el producto X',
    });
    expect(result.intent).not.toBe('sugerir_precio_inmueble');
    expect(result.intent).toBe('buscar_catalogo');
  });

  // ═══ DÉCIMO QUINTO ENTRENAMIENTO (módulo Proyecciones Financieras):
  // proyección de flujo de caja, impuestos por país y rentabilidad global ═══

  // ── proyeccion_financiera ──
  it('cómo se ve el flujo de caja para el próximo mes → proyeccion_financiera', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo se ve el flujo de caja para el próximo mes',
    });
    expect(result.intent).toBe('proyeccion_financiera');
    expect(result.extractedParams.months).toBe(1);
    expect(result.needsMoreInfo).toBe(false);
  });

  it('proyecta el EBITDA del trimestre → proyeccion_financiera con months=3', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'proyecta el EBITDA del trimestre',
    });
    expect(result.intent).toBe('proyeccion_financiera');
    expect(result.extractedParams.months).toBe(3);
  });

  it('dame un pronóstico financiero → proyeccion_financiera', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame un pronóstico financiero',
    });
    expect(result.intent).toBe('proyeccion_financiera');
  });

  it('dame la proyección financiera del próximo año → months=12', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la proyección financiera del próximo año',
    });
    expect(result.intent).toBe('proyeccion_financiera');
    expect(result.extractedParams.months).toBe(12);
  });

  // ── proyeccion_impuestos ──
  it('calcula la provisión de impuestos para España → proyeccion_impuestos (ES)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'calcula la provisión de impuestos para España',
    });
    expect(result.intent).toBe('proyeccion_impuestos');
    expect(result.extractedParams.pais).toBe('ES');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('proyección fiscal de México este trimestre → MX con months=3', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'proyección fiscal de México este trimestre',
    });
    expect(result.intent).toBe('proyeccion_impuestos');
    expect(result.extractedParams.pais).toBe('MX');
    expect(result.extractedParams.months).toBe(3);
  });

  it('cuánto debo pagar de impuestos en USA → USA_LLC', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto debo pagar de impuestos en USA',
    });
    expect(result.intent).toBe('proyeccion_impuestos');
    expect(result.extractedParams.pais).toBe('USA_LLC');
  });

  it('dame la estimación de impuestos para mi LLC → USA_LLC', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la estimación de impuestos para mi LLC',
    });
    expect(result.intent).toBe('proyeccion_impuestos');
    expect(result.extractedParams.pais).toBe('USA_LLC');
  });

  it('proyección de impuestos sin país → pide el país', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'proyección de impuestos',
    });
    expect(result.intent).toBe('proyeccion_impuestos');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('pais');
  });

  it('multi-turno: completa el país de proyeccion_impuestos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'España',
      pendingIntent: 'proyeccion_impuestos',
      collectedEntities: {},
      missingEntities: ['pais'],
    });
    expect(result.intent).toBe('proyeccion_impuestos');
    expect(result.extractedParams.pais).toBe('ES');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── analizar_rentabilidad_global ──
  it('dame la rentabilidad global del negocio → analizar_rentabilidad_global', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la rentabilidad global del negocio',
    });
    expect(result.intent).toBe('analizar_rentabilidad_global');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('analiza el EBITDA del último trimestre → rentabilidad con months=3', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza el EBITDA del último trimestre',
    });
    expect(result.intent).toBe('analizar_rentabilidad_global');
    expect(result.extractedParams.months).toBe(3);
  });

  it('cómo vamos financieramente en general → analizar_rentabilidad_global', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo vamos financieramente en general',
    });
    expect(result.intent).toBe('analizar_rentabilidad_global');
  });

  it('cuál es el margen real del negocio → analizar_rentabilidad_global', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuál es el margen real del negocio',
    });
    expect(result.intent).toBe('analizar_rentabilidad_global');
  });

  it('dame la rentabilidad del trimestre → rentabilidad con months=3', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la rentabilidad del trimestre',
    });
    expect(result.intent).toBe('analizar_rentabilidad_global');
    expect(result.extractedParams.months).toBe(3);
  });

  // ── negativos / regresiones de finanzas ──
  it('cómo vamos de gastos este mes → analizar_gastos (sigue intacto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo vamos de gastos este mes',
    });
    expect(result.intent).toBe('analizar_gastos');
    expect(result.extractedParams.months).toBe(1);
  });

  it('analiza mi burn rate → analizar_gastos (sigue intacto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza mi burn rate',
    });
    expect(result.intent).toBe('analizar_gastos');
  });

  it('dame mi salud financiera → analizar_gastos (sigue intacto)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame mi salud financiera',
    });
    expect(result.intent).toBe('analizar_gastos');
  });

  it('"registra un gasto de 50 euros en transporte" NO es proyección', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un gasto de 50 euros en transporte',
    });
    expect(result.intent).toBe('registrar_gasto');
  });

  it('"cuánto debo pagar de renta" NO es proyección de impuestos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto debo pagar de renta',
    });
    expect(result.intent).not.toBe('proyeccion_impuestos');
    expect(result.intent).not.toBe('analizar_rentabilidad_global');
  });

  it('"analiza el sentimiento de este feedback" NO es proyección', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'analiza el sentimiento de este feedback',
    });
    expect(result.intent).toBe('analizar_sentimiento');
  });

  // ═══ DÉCIMO SEXTO ENTRENAMIENTO (ERP Industrial): producción, calidad,
  // proyectos y watchdog de inventario ═══

  // ── watchdog_inventario ──
  it('revisa las alertas de inventario → watchdog_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'revisa las alertas de inventario',
    });
    expect(result.intent).toBe('watchdog_inventario');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué productos necesito reponer → watchdog_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué productos necesito reponer',
    });
    expect(result.intent).toBe('watchdog_inventario');
  });

  it('ejecuta el watchdog de inventario → watchdog_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'ejecuta el watchdog de inventario',
    });
    expect(result.intent).toBe('watchdog_inventario');
  });

  it('"hay riesgo de ruptura de stock" sigue siendo salud_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay riesgo de ruptura de stock',
    });
    expect(result.intent).toBe('salud_inventario');
  });

  // ── detectar_anomalias_calidad ──
  it('detecta anomalías de calidad → detectar_anomalias_calidad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'detecta anomalías de calidad',
    });
    expect(result.intent).toBe('detectar_anomalias_calidad');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('hay problemas de calidad con algún proveedor → detectar_anomalias_calidad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay problemas de calidad con algún proveedor',
    });
    expect(result.intent).toBe('detectar_anomalias_calidad');
  });

  // ── calcular_costo_produccion ──
  it('calcula el costo de producción del panel solar → calcular_costo_produccion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'calcula el costo de producción del panel solar',
    });
    expect(result.intent).toBe('calcular_costo_produccion');
    expect(result.extractedParams.producto).toBe('panel solar');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cuánto cuesta fabricar el inversor → calcular_costo_produccion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto cuesta fabricar el inversor',
    });
    expect(result.intent).toBe('calcular_costo_produccion');
    expect(result.extractedParams.producto).toBe('inversor');
  });

  it('dame el costo de manufactura del lote Z → ref lote', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame el costo de manufactura del lote Z',
    });
    expect(result.intent).toBe('calcular_costo_produccion');
    expect(result.extractedParams.producto).toBe('Z');
  });

  it('calcular costo sin producto → pide producto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'calcula el costo de producción',
    });
    expect(result.intent).toBe('calcular_costo_produccion');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('productoId');
  });

  // ── verificar_mermas ──
  it('verifica las mermas de la orden #OP-001 → verificar_mermas', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'verifica las mermas de la orden de producción #OP-001',
    });
    expect(result.intent).toBe('verificar_mermas');
    expect(result.extractedParams.ordenProduccionId).toBe('OP-001');
  });

  it('reporta merma de 3 unidades en la orden #OP-002 → cantidad + orden', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'reporta merma de 3 unidades en la orden #OP-002',
    });
    expect(result.intent).toBe('verificar_mermas');
    expect(result.extractedParams.cantidad).toBe(3);
    expect(result.extractedParams.ordenProduccionId).toBe('OP-002');
  });

  it('audita el desperdicio del panel solar → verificar_mermas con producto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'audita el desperdicio del panel solar',
    });
    expect(result.intent).toBe('verificar_mermas');
    expect(result.extractedParams.producto).toBe('panel solar');
  });

  // ── registrar_inspeccion_calidad ──
  it('registra inspección de calidad del panel solar, resultado aprobado → PASSED', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra inspección de calidad del panel solar, resultado aprobado',
    });
    expect(result.intent).toBe('registrar_inspeccion_calidad');
    expect(result.extractedParams.producto).toBe('panel solar');
    expect(result.extractedParams.resultado).toBe('PASSED');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('crea un registro de QC para el lote #L-123, rechazado → FAILED + lote', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'crea un registro de QC para el lote #L-123, rechazado',
    });
    expect(result.intent).toBe('registrar_inspeccion_calidad');
    expect(result.extractedParams.resultado).toBe('FAILED');
    expect(result.extractedParams.lote).toBe('L-123');
  });

  it('registra inspección sin resultado → pide resultado', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra inspección de calidad del panel solar',
    });
    expect(result.intent).toBe('registrar_inspeccion_calidad');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('resultado');
  });

  // ── rentabilidad_proyecto ──
  it('cuál es la rentabilidad del proyecto Alpha → rentabilidad_proyecto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuál es la rentabilidad del proyecto Alpha',
    });
    expect(result.intent).toBe('rentabilidad_proyecto');
    expect(result.extractedParams.proyecto).toBe('Alpha');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cómo va el proyecto Norte financieramente → rentabilidad_proyecto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo va el proyecto Norte financieramente',
    });
    expect(result.intent).toBe('rentabilidad_proyecto');
    expect(result.extractedParams.proyecto).toBe('Norte');
  });

  it('"dame la rentabilidad global del negocio" NO es rentabilidad_proyecto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dame la rentabilidad global del negocio',
    });
    expect(result.intent).toBe('analizar_rentabilidad_global');
    expect(result.intent).not.toBe('rentabilidad_proyecto');
  });

  // ── desviaciones_proyecto ──
  it('detecta desviaciones en mis proyectos → desviaciones_proyecto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'detecta desviaciones en mis proyectos',
    });
    expect(result.intent).toBe('desviaciones_proyecto');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué proyectos se están desviando del plan → desviaciones_proyecto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué proyectos se están desviando del plan',
    });
    expect(result.intent).toBe('desviaciones_proyecto');
  });

  // ── multi-turno ERP ──
  it('multi-turno: completa el producto de calcular_costo_produccion', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'el panel solar',
      pendingIntent: 'calcular_costo_produccion',
      collectedEntities: {},
      missingEntities: ['productoId'],
    });
    expect(result.intent).toBe('calcular_costo_produccion');
    expect(result.extractedParams.productoId).toBe('el panel solar');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa el resultado de registrar_inspeccion_calidad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'rechazado',
      pendingIntent: 'registrar_inspeccion_calidad',
      collectedEntities: { productoId: 'X' },
      missingEntities: ['resultado'],
    });
    expect(result.intent).toBe('registrar_inspeccion_calidad');
    expect(result.extractedParams.resultado).toBe('FAILED');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('multi-turno: completa la orden de verificar_mermas', async () => {
    const result = await classifier.classify({
      ...base,
      message: '#OP-005',
      pendingIntent: 'verificar_mermas',
      collectedEntities: {},
      missingEntities: ['ordenProduccionId'],
    });
    expect(result.intent).toBe('verificar_mermas');
    expect(result.extractedParams.ordenProduccionId).toBe('OP-005');
  });

  it('multi-turno: completa el proyecto de rentabilidad_proyecto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'la obra central',
      pendingIntent: 'rentabilidad_proyecto',
      collectedEntities: {},
      missingEntities: ['proyectoId'],
    });
    expect(result.intent).toBe('rentabilidad_proyecto');
    expect(result.extractedParams.proyectoId).toBe('la obra central');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── negativos / regresiones de ERP industrial ──
  it('"consume 5 unidades del producto Y" sigue siendo consumir_inventario', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'consume 5 unidades del producto Y',
    });
    expect(result.intent).toBe('consumir_inventario');
  });

  it('"registra un gasto de 300€ en software" sigue siendo registrar_gasto', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'registra un gasto de 300€ en software',
    });
    expect(result.intent).toBe('registrar_gasto');
  });

  it('"cuánto cuesta el producto X" NO es costo de producción (es catálogo)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cuánto cuesta el producto X',
    });
    expect(result.intent).not.toBe('calcular_costo_produccion');
    expect(result.intent).toBe('buscar_catalogo');
  });

  it('"anomalías en los gastos" NO es calidad (es auditoría financiera)', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay anomalías en los gastos',
    });
    expect(result.intent).not.toBe('detectar_anomalias_calidad');
  });

  // ═══ DÉCIMO SÉPTIMO ENTRENAMIENTO (Proactividad, Auditoría y Campo):
  // ghosting, ruta de éxito, integridad financiera, fugas y campo ═══

  // ── detectar_ghosting ──
  it('detecta leads fantasmas → detectar_ghosting', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'detecta leads fantasmas',
    });
    expect(result.intent).toBe('detectar_ghosting');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('qué leads están inactivos en etapa negociación → detectar_ghosting', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué leads están inactivos en etapa negociación',
    });
    expect(result.intent).toBe('detectar_ghosting');
    expect(result.intent).not.toBe('listar_leads');
  });

  it('encuentra leads que no han tenido actividad en 7 días → días de inactividad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'encuentra leads que no han tenido actividad en 7 días',
    });
    expect(result.intent).toBe('detectar_ghosting');
    expect(result.extractedParams.dias_inactivo).toBe(7);
  });

  it('hay leads que dejaron de responder → detectar_ghosting', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay leads que dejaron de responder',
    });
    expect(result.intent).toBe('detectar_ghosting');
  });

  it('"lista mis leads" sigue siendo listar_leads', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'lista mis leads',
    });
    expect(result.intent).toBe('listar_leads');
  });

  // ── generar_ruta_exito ──
  it('genera una ruta de éxito para juan@email.com → generar_ruta_exito', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera una ruta de éxito para juan@email.com',
    });
    expect(result.intent).toBe('generar_ruta_exito');
    expect(result.extractedParams.email).toBe('juan@email.com');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('cómo puedo cerrar el deal con María García → ruta por nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'cómo puedo cerrar el deal con María García',
    });
    expect(result.intent).toBe('generar_ruta_exito');
    expect(result.extractedParams.nombre).toContain('María');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('sugiere siguiente paso para el lead de Carlos → ruta de éxito', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'sugiere siguiente paso para el lead de Carlos',
    });
    expect(result.intent).toBe('generar_ruta_exito');
  });

  it('genera la ruta sin lead → pide el lead', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'genera una ruta de éxito',
    });
    expect(result.intent).toBe('generar_ruta_exito');
    expect(result.needsMoreInfo).toBe(true);
    expect(result.missingParams).toContain('email');
  });

  it('multi-turno: completa el lead de generar_ruta_exito por nombre', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'Ana Torres',
      pendingIntent: 'generar_ruta_exito',
      collectedEntities: {},
      missingEntities: ['email'],
    });
    expect(result.intent).toBe('generar_ruta_exito');
    expect(result.extractedParams.nombre).toBe('Ana Torres');
    expect(result.needsMoreInfo).toBe(false);
  });

  // ── auditar_integridad_gastos ──
  it('audita la integridad de los gastos → auditar_integridad_gastos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'audita la integridad de los gastos',
    });
    expect(result.intent).toBe('auditar_integridad_gastos');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('hay discrepancias en los gastos de este mes → auditar_integridad_gastos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay discrepancias en los gastos de este mes',
    });
    expect(result.intent).toBe('auditar_integridad_gastos');
  });

  it('revisa si hay gastos duplicados o sospechosos → auditar_integridad_gastos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'revisa si hay gastos duplicados o sospechosos',
    });
    expect(result.intent).toBe('auditar_integridad_gastos');
  });

  it('"hay anomalías en los gastos" ahora es auditar_integridad_gastos', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay anomalías en los gastos',
    });
    expect(result.intent).toBe('auditar_integridad_gastos');
  });

  // ── auditar_integridad ──
  it('audita la integridad financiera → auditar_integridad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'audita la integridad financiera',
    });
    expect(result.intent).toBe('auditar_integridad');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('verifica la integridad fiscal → auditar_integridad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'verifica la integridad fiscal',
    });
    expect(result.intent).toBe('auditar_integridad');
  });

  it('hay brechas en Veri*factu → auditar_integridad', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay brechas en Veri*factu',
    });
    expect(result.intent).toBe('auditar_integridad');
  });

  // ── auditar_fugas_materiales ──
  it('audita las fugas de materiales → auditar_fugas_materiales', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'audita las fugas de materiales',
    });
    expect(result.intent).toBe('auditar_fugas_materiales');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('hay mermas sospechosas en el inventario → auditar_fugas_materiales', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'hay mermas sospechosas en el inventario',
    });
    expect(result.intent).toBe('auditar_fugas_materiales');
  });

  it('detecta desviaciones de stock contra producción → auditar_fugas_materiales', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'detecta desviaciones de stock contra producción',
    });
    expect(result.intent).toBe('auditar_fugas_materiales');
  });

  // ── actividad_campo ──
  it('dónde están los técnicos en campo hoy → actividad_campo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'dónde están los técnicos en campo hoy',
    });
    expect(result.intent).toBe('actividad_campo');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('muéstrame la actividad de campo → actividad_campo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'muéstrame la actividad de campo',
    });
    expect(result.intent).toBe('actividad_campo');
  });

  it('qué activos están desplegados → actividad_campo', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'qué activos están desplegados',
    });
    expect(result.intent).toBe('actividad_campo');
  });

  // ── negativos / regresiones ──
  it('"detecta anomalías de calidad" sigue siendo calidad, no auditoría', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'detecta anomalías de calidad',
    });
    expect(result.intent).toBe('detectar_anomalias_calidad');
  });

  it('"verifica las mermas de la orden #OP-001" sigue siendo verificar_mermas', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'verifica las mermas de la orden #OP-001',
    });
    expect(result.intent).toBe('verificar_mermas');
    expect(result.intent).not.toBe('auditar_fugas_materiales');
  });

  it('"audita la integridad de la factura FAC-001" sigue siendo estado_fiscal', async () => {
    const result = await classifier.classify({
      ...base,
      message: 'audita la integridad de la factura FAC-001',
    });
    expect(result.intent).toBe('estado_fiscal');
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
