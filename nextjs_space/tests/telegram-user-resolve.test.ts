// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  expenseClaimsFindMany: vi.fn(),
  expenseClaimsFindUnique: vi.fn(),
  expenseClaimsUpdate: vi.fn(),
  expenseCreate: vi.fn(),
  systemAlertCreate: vi.fn(),
  financialAuditCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    task: { findMany: mocks.taskFindMany },
    erp_expense_claims: {
      findMany: mocks.expenseClaimsFindMany,
      findUnique: mocks.expenseClaimsFindUnique,
      update: mocks.expenseClaimsUpdate,
    },
    expense: { create: mocks.expenseCreate },
    systemAlert: { create: mocks.systemAlertCreate },
    financialAudit: { create: mocks.financialAuditCreate },
  },
}));

vi.mock('@/lib/skills/event-bus', () => ({
  eventBus: { emitEvent: vi.fn() },
  EVENTS: {},
}));

vi.mock('@/lib/security/integrity-service', () => ({
  generateIntegrityHash: vi.fn().mockResolvedValue('hash-abc'),
  verifyFinancialIntegrity: vi.fn().mockResolvedValue(true),
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
});
