import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Dynamic auth config ──────────────────────────────────────────────────
const currentAccountType = vi.hoisted(() => ({ value: 'AGENCY' }));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => {
    return async (request: Request, _context?: any) => {
      const isSuperadmin = currentAccountType.value === 'SUPERADMIN';
      return handler(request, {
        valid: true,
        tenant: { id: 'test-agency-id', nombre: 'Test Agency', slug: 'test-agency', plan: 'pro-agency' },
        user: {
          id: 'test-user-id',
          name: 'Test User',
          email: 'test@test.com',
          role: { nombre: isSuperadmin ? 'Superadmin' : 'Agency Admin', permisos: {} },
          accountType: currentAccountType.value,
        },
      });
    };
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { SlotManager } from '@/lib/slot-manager';
import { GET } from '@/app/api/slots/route';
import { prisma } from '@/lib/db';
import { PLANS } from '@/lib/plans';

// ─── Mock data ─────────────────────────────────────────────────────────────

const AGENCY_SLOTS = [
  {
    id: 'slot-a1',
    nombre: 'Cliente Agencia Alpha',
    slug: 'cliente-alpha',
    plan: PLANS.AGENCY_SLOT,
    estado: 'activo',
    fechaCreacion: new Date('2026-05-01'),
    enabledModules: ['CRM', 'LEADS'],
    billingEmail: 'admin@alpha.com',
    _count: { leads: 5, users: 2 },
  },
  {
    id: 'slot-a2',
    nombre: 'Cliente Agencia Beta',
    slug: 'cliente-beta',
    plan: PLANS.AGENCY_SLOT,
    estado: 'activo',
    fechaCreacion: new Date('2026-05-15'),
    enabledModules: ['CRM'],
    billingEmail: 'admin@beta.com',
    _count: { leads: 0, users: 1 },
  },
];

const ACCOUNTING_SLOTS = [
  {
    id: 'slot-c1',
    nombre: 'Empresa Contable Gamma',
    slug: 'empresa-gamma',
    plan: PLANS.ACCOUNTING_SLOT,
    estado: 'activo',
    fechaCreacion: new Date('2026-06-01'),
    enabledModules: ['CONTABILIDAD', 'FACTURACION'],
    billingEmail: 'admin@gamma.com',
    _count: { leads: 10, users: 3 },
  },
  {
    id: 'slot-c2',
    nombre: 'Empresa Contable Delta',
    slug: 'empresa-delta',
    plan: PLANS.ACCOUNTING_SLOT,
    estado: 'inactivo',
    fechaCreacion: new Date('2026-06-10'),
    enabledModules: ['CONTABILIDAD'],
    billingEmail: 'admin@delta.com',
    _count: { leads: 2, users: 1 },
  },
];

const ALL_SLOTS = [...AGENCY_SLOTS, ...ACCOUNTING_SLOTS];

// ─── Tests: SlotManager.listSlots ──────────────────────────────────────────

describe('SlotManager.listSlots — filtro por type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  it('sin type debe devolver todos los slots (agency + accounting)', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(ALL_SLOTS);

    const result = await SlotManager.listSlots('test-agency-id');

    expect(result).toHaveLength(4);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentId: 'test-agency-id',
          estado: { not: 'eliminado' },
        }),
      }),
    );
    // Verificar que NO se añadió filtro de plan
    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBeUndefined();
  });

  it("type='agency' debe filtrar solo slots con plan AGENCY_SLOT", async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(AGENCY_SLOTS);

    const result = await SlotManager.listSlots('test-agency-id', 'agency');

    expect(result).toHaveLength(2);
    result.forEach(slot => {
      expect(slot.plan).toBe(PLANS.AGENCY_SLOT);
    });

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBe(PLANS.AGENCY_SLOT);
  });

  it("type='accounting' debe filtrar solo slots con plan ACCOUNTING_SLOT", async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(ACCOUNTING_SLOTS);

    const result = await SlotManager.listSlots('test-agency-id', 'accounting');

    expect(result).toHaveLength(2);
    result.forEach(slot => {
      expect(slot.plan).toBe(PLANS.ACCOUNTING_SLOT);
    });

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBe(PLANS.ACCOUNTING_SLOT);
  });

  it('type inválido debe comportarse como undefined (sin filtro)', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(ALL_SLOTS);

    // @ts-expect-error — probar con valor inválido intencionalmente
    const result = await SlotManager.listSlots('test-agency-id', 'invalid');

    expect(result).toHaveLength(4);
    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBeUndefined();
  });

  it('filtro type=agency debe excluir slots accounting', async () => {
    // Simular que la DB solo devuelve AGENCY_SLOT cuando se filtra
    (prisma.tenant.findMany as any).mockImplementation((args: any) => {
      if (args.where.plan === PLANS.AGENCY_SLOT) return Promise.resolve(AGENCY_SLOTS);
      if (args.where.plan === PLANS.ACCOUNTING_SLOT) return Promise.resolve(ACCOUNTING_SLOTS);
      return Promise.resolve(ALL_SLOTS);
    });

    const agencyResult = await SlotManager.listSlots('test-agency-id', 'agency');
    const accountingResult = await SlotManager.listSlots('test-agency-id', 'accounting');

    expect(agencyResult).toHaveLength(2);
    expect(accountingResult).toHaveLength(2);

    // IDs no deben solaparse entre filtros
    const agencyIds = agencyResult.map(s => s.id);
    const accountingIds = accountingResult.map(s => s.id);
    const overlap = agencyIds.filter(id => accountingIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it('debe seguir filtrando por estado != eliminado cuando se usa type', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(AGENCY_SLOTS);

    await SlotManager.listSlots('test-agency-id', 'agency');

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.estado).toEqual({ not: 'eliminado' });
    expect(callArgs.where.parentId).toBe('test-agency-id');
    expect(callArgs.where.plan).toBe(PLANS.AGENCY_SLOT);
  });
});

// ─── Tests: GET /api/slots with type param ─────────────────────────────────

describe('GET /api/slots — query param type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  it('GET /api/slots (sin type) debe devolver todos los slots', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(ALL_SLOTS);

    const response = await GET(new Request('https://volkern.app/api/slots'));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveLength(4);

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBeUndefined();
  });

  it('GET /api/slots?type=agency debe devolver solo AGENCY_SLOT', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(AGENCY_SLOTS);

    const response = await GET(new Request('https://volkern.app/api/slots?type=agency'));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveLength(2);
    json.forEach((slot: any) => {
      expect(slot.plan).toBe(PLANS.AGENCY_SLOT);
    });

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBe(PLANS.AGENCY_SLOT);
  });

  it('GET /api/slots?type=accounting debe devolver solo ACCOUNTING_SLOT', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(ACCOUNTING_SLOTS);

    const response = await GET(new Request('https://volkern.app/api/slots?type=accounting'));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveLength(2);
    json.forEach((slot: any) => {
      expect(slot.plan).toBe(PLANS.ACCOUNTING_SLOT);
    });

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBe(PLANS.ACCOUNTING_SLOT);
  });

  it('GET /api/slots con type desconocido debe comportarse como sin filtro', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(ALL_SLOTS);

    const response = await GET(new Request('https://volkern.app/api/slots?type=unknown'));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveLength(4);

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.plan).toBeUndefined();
  });

  it('GET /api/slots?type=agency debe excluir slots accounting (aislamiento)', async () => {
    (prisma.tenant.findMany as any)
      .mockResolvedValueOnce(AGENCY_SLOTS)
      .mockResolvedValueOnce(ACCOUNTING_SLOTS);

    // Primera llamada con type=agency
    const agencyResponse = await GET(new Request('https://volkern.app/api/slots?type=agency'));
    const agencyJson = await agencyResponse.json();

    // Segunda llamada con type=accounting
    const accountingResponse = await GET(new Request('https://volkern.app/api/slots?type=accounting'));
    const accountingJson = await accountingResponse.json();

    const agencyIds = agencyJson.map((s: any) => s.id);
    const accountingIds = accountingJson.map((s: any) => s.id);
    const overlap = agencyIds.filter((id: string) => accountingIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it('GET /api/slots debe filtrar por parentId del tenant autenticado (aislamiento multi-tenant)', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue([]);

    await GET(new Request('https://volkern.app/api/slots?type=agency'));

    const callArgs = (prisma.tenant.findMany as any).mock.calls[0][0];
    expect(callArgs.where.parentId).toBe('test-agency-id');
    expect(callArgs.where.estado).toEqual({ not: 'eliminado' });
    expect(callArgs.where.plan).toBe(PLANS.AGENCY_SLOT);
  });

  it('debe devolver 403 si no es AGENCY (con type param)', async () => {
    currentAccountType.value = 'BUSINESS';

    const response = await GET(new Request('https://volkern.app/api/slots?type=agency'));
    currentAccountType.value = 'AGENCY';

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });
});
