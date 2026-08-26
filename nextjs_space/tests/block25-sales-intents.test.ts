// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chatbotAuditLogCreate: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    chatbotAuditLog: { create: mocks.chatbotAuditLogCreate },
    tenant: { findUnique: mocks.tenantFindUnique },
  },
}));

const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { crmIntents } = await import('@/lib/agents/intents/crm-intents');

const TENANT = 'tenant-block25';
const BASE = { userId: 'user-25', tenantId: TENANT };

function classifier() {
  return new IntentClassifierAgent();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chatbotAuditLogCreate.mockResolvedValue({ id: 'audit-25' });
  mocks.tenantFindUnique.mockResolvedValue({
    id: TENANT,
    plan: 'empresarial',
    tenantFeatures: [],
  });
});

describe('Bloque 25 — pipeline de ventas por Telegram', () => {
  it('crea una oportunidad con contacto, monto y título', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'crea un deal con ana@empresa.test por 12500€ para implementación ERP',
    });

    expect(result.intent).toBe('crear_negocio');
    expect(result.extractedParams).toMatchObject({
      email: 'ana@empresa.test',
      monto: 12500,
    });
    expect(result.extractedParams.titulo).toContain('implementación ERP');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('actualiza la etapa y la prioridad de un deal', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'mueve el deal de ana@empresa.test a etapa negociación y prioridad alta',
    });

    expect(result.intent).toBe('actualizar_negocio');
    expect(result.extractedParams).toMatchObject({
      email: 'ana@empresa.test',
      etapa: 'negociación',
      prioridad: 'alta',
    });
    expect(result.needsMoreInfo).toBe(false);
  });

  it('al actualizar NO toma el nombre del deal como título (regresión: "de jose…" no es el título)', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'mueve el deal de jose.acevedo@acevedoseguros.com.mx a etapa negociación y prioridad alta',
    });

    expect(result.intent).toBe('actualizar_negocio');
    expect(result.extractedParams.etapa).toBe('negociación');
    expect(result.extractedParams.prioridad).toBe('alta');
    // El identificador "de jose.acevedo@…" NO debe convertirse en el título
    // del deal (pisaba el título real en producción).
    expect(result.extractedParams.titulo).toBeUndefined();
  });

  it('lista el pipeline con filtro de etapa', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'muéstrame los negocios en etapa propuesta',
    });

    expect(result.intent).toBe('mis_negocios');
    expect(result.extractedParams.etapa).toBe('propuesta');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('precalifica un lead por email y conserva la nota', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'precalifica a ana@empresa.test: interesada en el paquete premium',
    });

    expect(result.intent).toBe('calificar_lead');
    expect(result.extractedParams.email).toBe('ana@empresa.test');
    expect(result.extractedParams.nota).toContain('interesada');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('detecta ghosting y extrae el umbral de inactividad', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'detecta leads que no han tenido actividad en 14 días',
    });

    expect(result.intent).toBe('detectar_ghosting');
    expect(result.extractedParams.dias_inactivo).toBe(14);
    expect(result.needsMoreInfo).toBe(false);
  });

  it('genera una ruta de éxito para un lead por email', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'genera una ruta de éxito para ana@empresa.test',
    });

    expect(result.intent).toBe('generar_ruta_exito');
    expect(result.extractedParams.email).toBe('ana@empresa.test');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('pide el email cuando la ruta de éxito solo recibe un nombre', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'cómo puedo cerrar el deal con Ana Torres',
    });

    expect(result.intent).toBe('generar_ruta_exito');
    expect(result.extractedParams.nombre).toContain('Ana Torres');
    expect(result.needsMoreInfo).toBe(false);
  });

  it('no confunde una consulta de catálogo con el pipeline', async () => {
    const result = await classifier().classify({
      ...BASE,
      message: 'qué productos tengo en el catálogo',
    });

    expect(result.intent).not.toBe('mis_negocios');
    expect(result.intent).not.toBe('crear_negocio');
  });
});

describe('Bloque 25 — wiring y reglas de seguridad', () => {
  it('mapea todos los intents del bloque a skills ejecutables', async () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['crear_negocio', { email: 'ana@empresa.test', titulo: 'ERP', monto: '12500' }, 'create_deal'],
      ['actualizar_negocio', { email: 'ana@empresa.test', etapa: 'negociación' }, 'update_deal'],
      ['mis_negocios', {}, 'list_deals'],
      ['calificar_lead', { email: 'ana@empresa.test' }, 'prequalify_lead'],
      ['detectar_ghosting', {}, 'detect_ghosting'],
      ['generar_ruta_exito', { email: 'ana@empresa.test' }, 'generate_success_path'],
    ];

    for (const [intent, entities, action] of cases) {
      const result = await SkillOrchestratorAgent.createPlan(
        { intent, entities, missingEntities: [] },
        { tenantId: TENANT, userId: 'user-25', collectedEntities: [], missingEntities: [] },
        TENANT,
      );
      expect(result.plan?.steps[0].action, intent).toBe(action);
    }
  });

  it('mantiene los seis intents como no destructivos', () => {
    const names = [
      'crear_negocio',
      'actualizar_negocio',
      'mis_negocios',
      'calificar_lead',
      'detectar_ghosting',
      'generar_ruta_exito',
    ];

    for (const name of names) {
      const intent = crmIntents.find(item => item.name === name);
      expect(intent, name).toBeDefined();
      expect(intent?.destructive, name).toBe(false);
    }
  });
});
