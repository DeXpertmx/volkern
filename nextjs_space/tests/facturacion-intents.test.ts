// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  leadFindFirst: vi.fn(),
  leadFindUnique: vi.fn(),
  contactFindFirst: vi.fn(),
  contactFindUnique: vi.fn(),
  integrationFindUnique: vi.fn(),
  integrationUpsert: vi.fn(),
  configFiscalFindFirst: vi.fn(),
  invoiceFindFirst: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdate: vi.fn(),
  perfilFiscalClienteUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
    user: { findFirst: mocks.userFindFirst },
    lead: {
      findFirst: mocks.leadFindFirst,
      findUnique: mocks.leadFindUnique,
    },
    contact: {
      findFirst: mocks.contactFindFirst,
      findUnique: mocks.contactFindUnique,
    },
    integration: {
      findUnique: mocks.integrationFindUnique,
      upsert: mocks.integrationUpsert,
    },
    configuracionFiscalEmisor: { findFirst: mocks.configFiscalFindFirst },
    invoice: {
      findFirst: mocks.invoiceFindFirst,
      findUnique: mocks.invoiceFindUnique,
      create: mocks.invoiceCreate,
      update: mocks.invoiceUpdate,
    },
    perfilFiscalCliente: { update: mocks.perfilFiscalClienteUpdate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

const { financeIntents } = await import('@/lib/agents/intents/finance-intents');
const { SkillOrchestratorAgent } = await import('@/lib/agents/skill-orchestrator');
const { skills } = await import('@/lib/skills');
const { ExecutionEngine } = await import('@/lib/agents/execution-engine');

const TENANT = 'tenant-1';
const LEAD_ID = 'lead-1';
const CONTACT_ID = 'contact-1';
const INV_ID = 'inv-1';

// Tenant con plan 'premium' (fallback → esencial → finanzas activo, sin BD).
const TENANT_FIXTURE = { id: TENANT, plan: 'premium', tenantFeatures: [] };
const LEAD_FIXTURE = {
  id: LEAD_ID,
  tenantId: TENANT,
  nombre: 'Juan Pérez',
  email: 'juan@x.com',
  ubicacion: 'Madrid',
  perfilFiscal: null,
};
const CONTACT_FIXTURE = { id: CONTACT_ID, tenantId: TENANT, nombre: 'María García', email: 'maria@x.com', perfilFiscal: null };
const INVOICE_FIXTURE = {
  id: INV_ID,
  tenantId: TENANT,
  leadId: LEAD_ID,
  contactId: null,
  numero: 'MOCK-1754123456789',
  monto: 5000,
  moneda: 'EUR',
  estado: 'completado',
  fiscalStatus: 'pendiente',
  isSealed: true,
  verifactuVersion: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindUnique.mockResolvedValue(TENANT_FIXTURE as any);
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null); // → fallback PLAN_MODULES
  mocks.userFindFirst.mockResolvedValue({ id: 'user-1' } as any);
  // Config fiscal sin Veri*factu → no encadena fingerprints ni toca la cola AEAT
  mocks.configFiscalFindFirst.mockResolvedValue({ id: 'cfg-1', verifactuEnabled: false } as any);
  mocks.integrationFindUnique.mockResolvedValue(null);
  mocks.integrationUpsert.mockResolvedValue({ id: 'int-1' } as any);
});

// ─── 1. Intents registrados ─────────────────────────────────────────────────

describe('finance-intents — facturación', () => {
  it('registra los 4 intents de facturación', () => {
    const names = financeIntents.map(i => i.name);
    expect(names).toContain('crear_factura');
    expect(names).toContain('cancelar_factura');
    expect(names).toContain('estado_fiscal');
    expect(names).toContain('rectificar_factura');
  });

  it('crear_factura exige cliente + monto (el wrapper resuelve el lead por email/nombre)', () => {
    const intent = financeIntents.find(i => i.name === 'crear_factura')!;
    expect(intent.requiredParams).toEqual(['cliente', 'monto']);
    expect(intent.optionalParams).toEqual(expect.arrayContaining(['email', 'nombre', 'concepto', 'moneda']));
    expect(intent.destructive).toBe(false);
  });

  it('cancelar_factura y estado_fiscal exigen factura; rectificar exige factura + razon', () => {
    const cancelar = financeIntents.find(i => i.name === 'cancelar_factura')!;
    const estado = financeIntents.find(i => i.name === 'estado_fiscal')!;
    const rectificar = financeIntents.find(i => i.name === 'rectificar_factura')!;
    expect(cancelar.requiredParams).toEqual(['factura']);
    expect(cancelar.destructive).toBe(true);
    expect(estado.requiredParams).toEqual(['factura']);
    expect(estado.destructive).toBe(false);
    expect(rectificar.requiredParams).toEqual(['factura', 'razon']);
    expect(rectificar.destructive).toBe(true);
  });
});

// ─── 2. Mapping orchestrator: intent → skill ───────────────────────────────

describe('SkillOrchestrator — wiring de facturación', () => {
  const ctx = {
    tenantId: TENANT,
    userId: 'user-1',
    pendingIntent: '',
    collectedEntities: {},
    missingEntities: [],
  };

  it('crear_factura genera un plan de 1 paso hacia create_invoice', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'crear_factura', entities: { cliente: 'juan@x.com', monto: '5000', concepto: 'Consultoría' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.success).toBe(true);
    expect(result.plan?.steps[0].action).toBe('create_invoice');
    expect(result.plan?.steps[0].params).toMatchObject({
      tenantId: TENANT,
      cliente: 'juan@x.com',
      monto: '5000',
    });
  });

  it('cancelar_factura genera un plan hacia cancel_invoice', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'cancelar_factura', entities: { factura: 'FAC-001' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('cancel_invoice');
    expect(result.plan?.steps[0].params).toMatchObject({ factura: 'FAC-001' });
  });

  it('estado_fiscal genera un plan hacia get_invoice_fiscal_status', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'estado_fiscal', entities: { factura: 'FAC-001' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('get_invoice_fiscal_status');
  });

  it('rectificar_factura genera un plan hacia rectify_invoice', async () => {
    const result = await SkillOrchestratorAgent.createPlan(
      { intent: 'rectificar_factura', entities: { factura: 'FAC-001', razon: 'Cálculo incorrecto' }, missingEntities: [] },
      ctx,
      TENANT,
    );
    expect(result.plan?.steps[0].action).toBe('rectify_invoice');
  });
});

// ─── 3. Wrappers de skills (resolución de cliente y factura) ───────────────

describe('skills — facturación', () => {
  it('create_invoice resuelve el cliente por email y crea con leadId + amount', async () => {
    mocks.leadFindFirst.mockResolvedValue({ id: LEAD_ID } as any); // resolveClienteFiscal
    mocks.leadFindUnique.mockResolvedValue(LEAD_FIXTURE as any); // getClienteFiscal
    mocks.invoiceCreate.mockResolvedValue({ ...INVOICE_FIXTURE, numero: 'MOCK-1754123456789' } as any);

    const result = await (skills as any).create_invoice({
      tenantId: TENANT,
      cliente: 'juan@x.com',
      monto: '5000',
      concepto: 'Consultoría',
    });

    expect(mocks.leadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, email: { equals: 'juan@x.com', mode: 'insensitive' } },
      }),
    );
    const createArgs = mocks.invoiceCreate.mock.calls[0][0];
    expect(createArgs.data.leadId).toBe(LEAD_ID);
    expect(createArgs.data.monto).toBe(5000);
    expect(createArgs.data.moneda).toBe('EUR');
    expect(result.numero).toContain('MOCK-');
  });

  it('create_invoice resuelve el cliente por nombre (fallback a contact)', async () => {
    mocks.leadFindFirst.mockResolvedValue(null); // no hay lead con ese nombre
    mocks.contactFindFirst.mockResolvedValue({ id: CONTACT_ID } as any);
    mocks.contactFindUnique.mockResolvedValue(CONTACT_FIXTURE as any);
    mocks.invoiceCreate.mockResolvedValue({ ...INVOICE_FIXTURE, contactId: CONTACT_ID } as any);

    const result = await (skills as any).create_invoice({
      tenantId: TENANT,
      cliente: 'María García',
      monto: 750,
    });

    expect(mocks.contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, nombre: { contains: 'María García', mode: 'insensitive' } },
      }),
    );
    const createArgs = mocks.invoiceCreate.mock.calls[0][0];
    expect(createArgs.data.contactId).toBe(CONTACT_ID);
    expect(createArgs.data.leadId).toBeUndefined();
    expect(result.contactId).toBe(CONTACT_ID);
  });

  it('create_invoice sin cliente ni monto → error claro (requerido)', async () => {
    await expect(
      (skills as any).create_invoice({ tenantId: TENANT }),
    ).rejects.toThrow(/monto/i);
  });

  it('create_invoice con cliente inexistente → error real del wrapper', async () => {
    mocks.leadFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);

    await expect(
      (skills as any).create_invoice({ tenantId: TENANT, cliente: 'Nadie Pérez', monto: 500 }),
    ).rejects.toThrow(/No encontré ningún cliente/);
  });

  it('cancel_invoice resuelve la factura por número y la anula', async () => {
    mocks.invoiceFindFirst.mockResolvedValue(INVOICE_FIXTURE as any); // resolveInvoiceId
    mocks.invoiceFindUnique.mockResolvedValue(INVOICE_FIXTURE as any); // cancelInvoice
    mocks.leadFindUnique.mockResolvedValue(LEAD_FIXTURE as any); // getReceptorNif
    mocks.invoiceUpdate.mockResolvedValue({ ...INVOICE_FIXTURE, fiscalStatus: 'anulada' } as any);

    const result = await (skills as any).cancel_invoice({ tenantId: TENANT, factura: 'MOCK-1754' });

    expect(mocks.invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, numero: { contains: 'MOCK-1754', mode: 'insensitive' } },
      }),
    );
    const updateArgs = mocks.invoiceUpdate.mock.calls[0][0];
    expect(updateArgs.where.id).toBe(INV_ID);
    expect(updateArgs.data.fiscalStatus).toBe('anulada');
    expect(result.fiscalStatus).toBe('anulada');
  });

  it('cancel_invoice sin factura → error claro', async () => {
    await expect(
      (skills as any).cancel_invoice({ tenantId: TENANT }),
    ).rejects.toThrow(/factura/);
  });

  it('get_invoice_fiscal_status resuelve por número y devuelve el sello', async () => {
    mocks.invoiceFindFirst.mockResolvedValue(INVOICE_FIXTURE as any); // resolveInvoiceId
    mocks.invoiceFindUnique.mockResolvedValue({
      id: INV_ID,
      numero: 'MOCK-1754123456789',
      fiscalStatus: 'vigente',
      isSealed: true,
      fingerprint: 'abc',
      verifactuVersion: 2,
    } as any);

    const result = await (skills as any).get_invoice_fiscal_status({ tenantId: TENANT, factura: 'MOCK-1754' });

    expect(result.isSealed).toBe(true);
    expect(result.verifactuVersion).toBe(2);
    expect(result.fiscalStatus).toBe('vigente');
  });

  it('rectify_invoice resuelve por número, exige razón y crea la rectificación', async () => {
    mocks.invoiceFindFirst.mockResolvedValue(INVOICE_FIXTURE as any); // resolveInvoiceId
    mocks.invoiceFindUnique.mockResolvedValue({ ...INVOICE_FIXTURE, tenant: { id: TENANT } } as any); // rectifyInvoice
    mocks.leadFindUnique.mockResolvedValue(LEAD_FIXTURE as any); // getReceptorNif
    mocks.invoiceCreate.mockResolvedValue({ ...INVOICE_FIXTURE, id: 'inv-2', numero: 'R-MOCK-1754123456789', monto: -5000 } as any);

    const result = await (skills as any).rectify_invoice({
      tenantId: TENANT,
      factura: 'MOCK-1754',
      razon: 'Cálculo incorrecto',
    });

    const createArgs = mocks.invoiceCreate.mock.calls[0][0];
    expect(createArgs.data.metadata.isRectification).toBe(true);
    expect(createArgs.data.metadata.reason).toBe('Cálculo incorrecto');
    expect(createArgs.data.monto).toBe(-5000);
    expect(result.numero).toContain('R-MOCK-');
  });

  it('rectify_invoice sin razón → error claro (requerido)', async () => {
    await expect(
      (skills as any).rectify_invoice({ tenantId: TENANT, factura: 'MOCK-1754' }),
    ).rejects.toThrow(/motivo/i);
  });

  it('rectify_invoice con factura inexistente → error real del wrapper', async () => {
    mocks.invoiceFindFirst.mockResolvedValue(null);

    await expect(
      (skills as any).rectify_invoice({ tenantId: TENANT, factura: 'FAC-999', razon: 'X' }),
    ).rejects.toThrow(/No encontré ninguna factura/);
  });
});

// ─── 4. Formateadores del ExecutionEngine ───────────────────────────────────

describe('ExecutionEngine.formatSkillResult — facturación', () => {
  it('create_invoice formatea número, monto y sello', () => {
    const msg = ExecutionEngine.formatSkillResult('create_invoice', {
      numero: 'MOCK-1754123456789',
      monto: 5000,
      moneda: 'EUR',
      isSealed: true,
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Factura creada');
    expect(plain).toContain('5000');
    expect(plain).toContain('Veri*factu');
  });

  it('cancel_invoice formatea la anulación', () => {
    const msg = ExecutionEngine.formatSkillResult('cancel_invoice', {
      numero: 'MOCK-1754123456789',
      fiscalStatus: 'anulada',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Factura cancelada');
    expect(plain).toContain('anulada');
  });

  it('get_invoice_fiscal_status formatea el sello con versión', () => {
    const msg = ExecutionEngine.formatSkillResult('get_invoice_fiscal_status', {
      numero: 'MOCK-1754123456789',
      fiscalStatus: 'vigente',
      isSealed: true,
      verifactuVersion: 2,
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Estado fiscal');
    expect(plain).toContain('Válida (Veri*factu v2)');
  });

  it('rectify_invoice formatea la rectificación', () => {
    const msg = ExecutionEngine.formatSkillResult('rectify_invoice', {
      numero: 'R-MOCK-1754123456789',
      monto: -5000,
      moneda: 'EUR',
    });
    const plain = msg.replace(/\\/g, '');
    expect(plain).toContain('Factura rectificada');
    expect(plain).toContain('R-MOCK');
    expect(plain).toContain('anterior queda anulada');
  });
});
