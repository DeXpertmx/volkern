// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  contactUpdate: vi.fn(),
  taskFindFirst: vi.fn(),
  taskUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    contact: { findFirst: mocks.contactFindFirst, update: mocks.contactUpdate, create: vi.fn() },
    task: { findFirst: mocks.taskFindFirst, update: mocks.taskUpdate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/ai/gemma-client', () => ({
  callGemma: vi.fn().mockResolvedValue({ content: '{}' }),
}));

const { IntentClassifierAgent } = await import('@/lib/agents/intent-classifier');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { crmIntents } = await import('@/lib/agents/intents/crm-intents');

const TENANT = 'tenant-1';
const TENANT_FIXTURE = { id: TENANT, plan: 'empresarial', tenantFeatures: [] };

function makeClassifier() {
  return new IntentClassifierAgent() as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue({ id: 'plan-1', name: 'empresarial' } as any);
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1', role: { nombre: 'OWNER' } } as any);
});

describe('Bloque 24 — snooze_task (posponer recordatorio)', () => {
  it('clasifica "pospone el recordatorio de llamar a Juan hasta mañana"', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'pospone el recordatorio de llamar a Juan hasta mañana',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('snooze_task');
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.extractedParams.titulo).toContain('llamar');
    expect(r.extractedParams.hasta).toBeTruthy();
  });

  it('clasifica "recuérdamelo más tarde, la tarea de revisar cotización"', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'recuérdamelo más tarde, la tarea de revisar cotización',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('snooze_task');
    expect(r.extractedParams.titulo).toContain('revisar');
  });

  it('clasifica "saca de la lista la tarea de enviar documento hasta el viernes"', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'saca de la lista la tarea de enviar documento hasta el viernes',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('snooze_task');
  });

  it('no roba reprogramar_tarea con fecha concreta ("pospone la tarea de revisar cotización al 20 de agosto")', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'pospone la tarea de revisar cotización al 20 de agosto',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('reprogramar_tarea');
  });

  it('mapea el intent a la skill snooze_task en el orquestador', () => {
    const plan = SkillOrchestratorAgent.buildPlan('snooze_task', { titulo: 'llamar a Juan', hasta: '2026-08-25' }, TENANT);
    expect(plan?.steps[0].action).toBe('snooze_task');
    expect(plan?.steps[0].params).toMatchObject({ titulo: 'llamar a Juan', hasta: '2026-08-25', tenantId: TENANT });
    expect(skills.snooze_task).toBeTypeOf('function');
  });

  it('registra el intent snooze_task en el schema de intents (crmIntents)', () => {
    const names = crmIntents.map((i: any) => i.name);
    expect(names).toContain('snooze_task');
    const def = crmIntents.find((i: any) => i.name === 'snooze_task');
    expect(def.requiredParams).toContain('titulo');
    expect(def.destructive).toBe(false);
  });
});

describe('Bloque 24 — update_contact (editar contacto)', () => {
  it('clasifica "edita el teléfono del contacto Laura Gómez a 555-0102"', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'edita el teléfono del contacto Laura Gómez a 555-0102',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('update_contact');
    expect(r.extractedParams.nombre).toContain('Laura');
    expect(r.extractedParams.telefono).toContain('555');
  });

  it('clasifica "cambia el cargo del contacto Pedro Sánchez a Director Comercial"', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'cambia el cargo del contacto Pedro Sánchez a Director Comercial',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('update_contact');
    expect(r.extractedParams.nombre).toContain('Pedro');
  });

  it('las notas genéricas al contacto siguen en actualizar_lead (retrocompat)', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'ponle notas al contacto Carlos Díaz: Prefiere contacto por WhatsApp',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('actualizar_lead');
  });

  it('clasifica "actualiza el teléfono del contacto juan@email.com a 555-4321"', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'actualiza el teléfono del contacto juan@email.com a 555-4321',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('update_contact');
    expect(r.extractedParams.email).toContain('juan@email.com');
  });

  it('sigue mandando a actualizar_lead cuando se menciona "lead" (no contacto)', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'actualiza el teléfono del lead María García a 555-0000',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('actualizar_lead');
  });

  it('sigue mandando a actualizar_lead sin mencionar contacto/lead (retrocompat)', async () => {
    const classifier = makeClassifier();
    const r = await classifier.classify({
      message: 'actualiza el teléfono de María García a 555-0000',
      userId: 'user-1',
      tenantId: TENANT,
    });
    expect(r.intent).toBe('actualizar_lead');
  });

  it('mapea el intent a la skill update_contact en el orquestador', () => {
    const plan = SkillOrchestratorAgent.buildPlan('update_contact', { nombre: 'Laura Gómez', telefono: '555-0102' }, TENANT);
    expect(plan?.steps[0].action).toBe('update_contact');
    expect(plan?.steps[0].params).toMatchObject({ nombre: 'Laura Gómez', telefono: '555-0102', tenantId: TENANT });
    expect(skills.update_contact).toBeTypeOf('function');
  });

  it('registra el intent update_contact en el schema de intents (crmIntents)', () => {
    const names = crmIntents.map((i: any) => i.name);
    expect(names).toContain('update_contact');
    const def = crmIntents.find((i: any) => i.name === 'update_contact');
    expect(def.destructive).toBe(false);
  });
});
