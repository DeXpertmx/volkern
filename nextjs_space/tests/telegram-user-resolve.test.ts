// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  taskFindFirst: vi.fn(),
  taskCreate: vi.fn(),
  taskUpdate: vi.fn(),
  leadFindFirst: vi.fn(),
  leadCreate: vi.fn(),
  contactFindFirst: vi.fn(),
  expenseClaimsFindMany: vi.fn(),
  expenseClaimsFindUnique: vi.fn(),
  expenseClaimsUpdate: vi.fn(),
  expenseCreate: vi.fn(),
  expenseFindFirst: vi.fn(),
  supplierFindFirst: vi.fn(),
  supplierFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  supplierCreate: vi.fn(),
  systemAlertCreate: vi.fn(),
  financialAuditCreate: vi.fn(),
  noteCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    task: {
      findMany: mocks.taskFindMany,
      findFirst: mocks.taskFindFirst,
      create: mocks.taskCreate,
      update: mocks.taskUpdate,
    },
    lead: { findFirst: mocks.leadFindFirst, create: mocks.leadCreate },
    contact: { findFirst: mocks.contactFindFirst },
    note: { create: mocks.noteCreate },
    erp_expense_claims: {
      findMany: mocks.expenseClaimsFindMany,
      findUnique: mocks.expenseClaimsFindUnique,
      update: mocks.expenseClaimsUpdate,
    },
    expense: { create: mocks.expenseCreate, findFirst: mocks.expenseFindFirst },
    supplier: { findFirst: mocks.supplierFindFirst, findUnique: mocks.supplierFindUnique, create: mocks.supplierCreate },
    tenant: { findUnique: mocks.tenantFindUnique },
    systemAlert: { create: mocks.systemAlertCreate },
    financialAudit: { create: mocks.financialAuditCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: { TASK_CREATED: 'TASK_CREATED', LEAD_CREATED: 'LEAD_CREATED', TASK_COMPLETED: 'TASK_COMPLETED', NOTE_CREATED: 'NOTE_CREATED' },
}));

vi.mock('@/lib/security/integrity-service', () => ({
  generateIntegrityHash: vi.fn().mockResolvedValue('hash-abc'),
  verifyFinancialIntegrity: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/skills/finance-skills', () => ({
  createExpense: vi.fn(async (input: any) => ({ id: 'exp-1', ...input })),
  createSupplier: vi.fn(async (input: any) => ({ id: 'supp-new', ...input })),
  registerExpenseVision: vi.fn(async () => ({})),
  analyzeBurnRate: vi.fn(async () => ({})),
}));

const { skills } = await import('@/lib/skills');

const TENANT = 'tenant-1';

beforeEach(() => {
  vi.clearAllMocks();
  // El chat de Telegram NO coincide con el id de ningún usuario → las dos
  // primeras consultas (id en tenant, id global) devuelven null.
  mocks.userFindFirst.mockImplementation((args: any) => {
    const where = args?.where || {};
    // Consulta por metadata.telegram_chat_id (vía OR) → usuario real del tenant
    if (where.metadata || (Array.isArray(where.OR) && where.OR.some((o: any) => o.metadata))) {
      return Promise.resolve({ id: 'user-42' } as any);
    }
    // Validación del skill core (createLead valida asignadoA por id)
    if (where.id === 'user-42') {
      return Promise.resolve({ id: 'user-42' } as any);
    }
    return Promise.resolve(null);
  });
});

describe('Resolución de chat de Telegram al userId real (webhook)', () => {
  it('get_pending_tasks usa el userId real resuelto por telegram_chat_id', async () => {
    mocks.taskFindMany.mockResolvedValue([
      { id: 't1', titulo: 'Llamar a Juan', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date('2026-08-10'), lead: { nombre: 'Juan' } },
      { id: 't2', titulo: 'Enviar propuesta', completada: false, asignadoA: 'user-42', fechaVencimiento: new Date('2026-08-20') },
    ] as any);

    const result = await (skills as any).get_pending_tasks({
      tenantId: TENANT,
      userId: 'telegram:123456', // lo que pasa el webhook
    });

    // Debe haber consultado al usuario por metadata (chat de Telegram)
    const metadataCall = mocks.userFindFirst.mock.calls.find((c: any) => {
      const w = c[0]?.where || {};
      return w.metadata || (Array.isArray(w.OR) && w.OR.some((o: any) => o.metadata));
    });
    expect(metadataCall).toBeTruthy();

    // Y buscar las tareas asignadas al userId REAL, no al chat
    const taskCall = mocks.taskFindMany.mock.calls[0][0];
    expect(taskCall.where.asignadoA).toBe('user-42');
    expect(taskCall.where.completada).toBe(false);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('authorize_bulk_expenses resuelve el chat de Telegram al userId real', async () => {
    mocks.expenseClaimsFindMany.mockResolvedValue([
      { id: 'claim-1', amount: 45.9, currency: 'EUR', category: 'Comida', status: 'PENDING', visionLockData: { exif_verified: true } },
    ] as any);
    mocks.expenseClaimsFindUnique.mockResolvedValue({
      id: 'claim-1', amount: 45.9, currency: 'EUR', category: 'Comida', status: 'PENDING',
      erp_employees: { fullName: 'María García' },
    } as any);

    const result = await (skills as any).authorize_bulk_expenses({
      tenantId: TENANT,
      userId: 'telegram:123456',
    });

    expect(mocks.expenseClaimsUpdate).toHaveBeenCalled();
    expect(result.details?.authorizedCount).toBe(1);
  });

  it('create_task asigna la tarea al userId real resuelto', async () => {
    mocks.taskCreate.mockResolvedValue({ id: 't-new', titulo: 'Llamar a Juan' } as any);
    mocks.leadFindFirst.mockResolvedValue({ id: 'lead-1' } as any);

    await (skills as any).create_task({
      tenantId: TENANT,
      titulo: 'Llamar a Juan',
      email: 'juan@test.com',
      userId: 'telegram:123456',
    });

    const createCall = mocks.taskCreate.mock.calls[0][0];
    // asignadoA debe ser el userId real (user-42), no el chat
    expect(createCall.data.asignadoA).toBe('user-42');
  });

  it('complete_task completa con el userId real resuelto', async () => {
    mocks.taskFindFirst.mockResolvedValue({ id: 't1', titulo: 'Llamar a Juan', completada: false } as any);
    mocks.taskUpdate.mockResolvedValue({ id: 't1', completada: true } as any);

    await (skills as any).complete_task({
      tenantId: TENANT,
      titulo: 'Llamar a Juan',
      userId: 'telegram:123456',
    });

    expect(mocks.taskUpdate).toHaveBeenCalled();
  });

  it('create_lead registra el creador real y asigna el lead', async () => {
    mocks.leadCreate.mockResolvedValue({ id: 'lead-new', nombre: 'Ana', email: 'ana@test.com' } as any);

    await (skills as any).create_lead({
      tenantId: TENANT,
      nombre: 'Ana López',
      email: 'ana@test.com',
      userId: 'telegram:123456',
    });

    const createCall = mocks.leadCreate.mock.calls[0][0];
    expect(createCall.data.asignadoA).toBe('user-42');
  });

  it('create_expense usa el userId real como creador', async () => {
    mocks.supplierFindFirst.mockResolvedValue({ id: 'supp-1' } as any);

    await (skills as any).create_expense({
      tenantId: TENANT,
      monto: 100,
      concepto: 'Gasolina',
      proveedor: 'Repsol',
      userId: 'telegram:123456',
    });

    const { createExpense } = await import('@/lib/skills/finance-skills');
    const createCall = (createExpense as any).mock.calls[0][0];
    expect(createCall.createdById).toBe('user-42');
  });
});
