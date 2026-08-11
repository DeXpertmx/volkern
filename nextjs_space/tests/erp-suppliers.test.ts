import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    supplier: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (req: any, ctx?: any) =>
    handler(req, { tenant: { id: 'tenant-1' } }, ctx || {}),
  authenticateRequest: vi.fn().mockResolvedValue({ valid: true, tenant: { id: 'tenant-1' } }),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { PATCH } from '@/app/api/erp/suppliers/[id]/route';
import { POST } from '@/app/api/erp/suppliers/route';
import { prisma } from '@/lib/db';

function makeReq(body: any, url = 'http://localhost/api/erp/suppliers/x') {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

const supplierBase = {
  id: 'sup-1',
  tenantId: 'tenant-1',
  name: 'Acme SL',
  taxId: 'B12345674',
  category: 'Varios',
  balance: 0,
  active: true,
  vatRates: [21],
};

// ─── PATCH /api/erp/suppliers/[id] ────────────────────────────────────────

describe('PATCH /api/erp/suppliers/[id]', () => {
  it('actualiza vatRates con múltiples tipos y devuelve el proveedor', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(supplierBase as any);
    vi.mocked(prisma.supplier.update).mockResolvedValue({
      ...supplierBase,
      vatRates: [4, 10, 21],
    } as any);

    const res = await PATCH(makeReq({ vatRates: [21, 10, 4] }), { params: { id: 'sup-1' } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vatRates).toEqual([4, 10, 21]);
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vatRates: [21, 10, 4] }),
      })
    );
  });

  it('filtra valores inválidos (negativos, no numéricos)', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(supplierBase as any);
    vi.mocked(prisma.supplier.update).mockResolvedValue({ ...supplierBase } as any);

    await PATCH(makeReq({ vatRates: [21, -5, 'abc', 0] }), { params: { id: 'sup-1' } } as any);
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vatRates: [21, 0] }),
      })
    );
  });

  it('devuelve 404 si el proveedor no pertenece al tenant', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null as any);

    const res = await PATCH(makeReq({ vatRates: [10] }), { params: { id: 'sup-1' } } as any);
    expect(res.status).toBe(404);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });
});

// ─── POST /api/erp/suppliers ──────────────────────────────────────────────

describe('POST /api/erp/suppliers', () => {
  it('crea el proveedor con vatRates', async () => {
    vi.mocked(prisma.supplier.create).mockResolvedValue({
      ...supplierBase,
      vatRates: [21, 10],
    } as any);

    const res = await POST(
      new Request('http://localhost/api/erp/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Acme SL', category: 'Varios', vatRates: [21, 10] }),
      }) as any,
      {} as any
    );
    expect(res.status).toBe(200);
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vatRates: [21, 10] }),
      })
    );
  });
});
