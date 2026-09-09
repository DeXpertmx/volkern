import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests del helper `recordExternalSearch` (extraído del GET de
 * /api/leads/external/search). Se mockea @/lib/db (patrón del proyecto).
 */

const { create } = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: 'search-1' })),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    externalLeadSearch: { create },
  },
}));

import { recordExternalSearch } from '@/lib/leads/external-search-history';

beforeEach(() => {
  create.mockClear();
});

describe('recordExternalSearch', () => {
  it('crea el registro de historial con todos los campos', async () => {
    const criterios = { source: 'hunter', company: 'Acme', limit: 20 };
    const resultados = [{ email: 'a@acme.com' }, { email: 'b@acme.com' }];

    const result = await recordExternalSearch({
      tenantId: 'tenant-1',
      userId: 'user-1',
      criterios: criterios as any,
      fuente: 'hunter',
      totalResultados: 2,
      resultados: resultados as any,
    });

    expect(result).toEqual({ id: 'search-1' });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant-1');
    expect(data.userId).toBe('user-1');
    expect(data.criterios).toEqual(criterios);
    expect(data.fuente).toBe('hunter');
    expect(data.totalResultados).toBe(2);
    expect(data.resultados).toEqual(resultados);
  });
});