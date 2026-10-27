/**
 * Aislamiento multitenant de la franquicia inmobiliaria — conexiones.
 *
 * El aislamiento no depende solo del filtro `tenantId`: cada tenant puede tener
 * su propia base de datos y el proxy `prisma` envía los modelos de negocio al
 * cliente que esté en el contexto. Por eso la consolidación de una franquicia no
 * puede ser un `IN` sobre una sola conexión.
 *
 * Este test mockea **solo `globalPrisma`** (la lectura de `Tenant`, que vive en
 * el control plane) y `getTenantDb`. El proxy `prisma` y el `dbContext` reales se
 * ejercitan de verdad: son justamente lo que hay que comprobar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  getTenantDb: vi.fn(),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...real,
    globalPrisma: {
      tenant: { findMany: mocks.tenantFindMany, findUnique: vi.fn() },
    },
    getTenantDb: mocks.getTenantDb,
  };
});

import { prisma, dbContext } from '@/lib/db';
import {
  enCadaConexion,
  oficinasDeFranquicia,
  sumarPorMoneda,
} from '@/lib/real-estate/franquicia';

/** Marca que expone el cliente puesto en el contexto, para saber con qué conexión se consultó. */
function marcaDelClienteEnContexto(): string | undefined {
  return (prisma as unknown as { catalogoItem?: { marca?: string } }).catalogoItem?.marca;
}

describe('enCadaConexion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantFindMany.mockResolvedValue([]);
    mocks.getTenantDb.mockResolvedValue({ client: {} });
  });

  it('consulta la base compartida por la conexión global, no por la de la matriz', async () => {
    mocks.tenantFindMany.mockResolvedValueOnce([
      { id: 'matriz', dbUrl: 'postgresql://localhost/volkern_tenant_matriz' },
      { id: 'norte', dbUrl: null },
      { id: 'sur', dbUrl: null },
    ]);
    mocks.getTenantDb.mockResolvedValue({
      client: { catalogoItem: { marca: 'conexion-de-la-matriz' } },
    });

    const grupos: Array<{ ids: string[]; marca?: string }> = [];

    await dbContext.run(
      {
        tenantId: 'matriz',
        client: { catalogoItem: { marca: 'contexto-de-la-matriz' } } as never,
      },
      () =>
        enCadaConexion(['matriz', 'norte', 'sur'], async (ids) => {
          grupos.push({ ids: [...ids].sort(), marca: marcaDelClienteEnContexto() });
          return [];
        }),
    );

    const grupoMatriz = grupos.find((g) => g.ids.includes('matriz'));
    const grupoOficinas = grupos.find((g) => g.ids.includes('norte'));

    // La matriz se consulta con su propia conexión…
    expect(grupoMatriz?.marca).toBe('conexion-de-la-matriz');
    // …y las oficinas con la global, nunca con la de la matriz ni con la del
    // contexto: ese era el fallo que dejaba el panel consolidado a cero.
    expect(grupoOficinas?.marca).not.toBe('conexion-de-la-matriz');
    expect(grupoOficinas?.marca).not.toBe('contexto-de-la-matriz');
    // Las oficinas viajan juntas en una sola consulta.
    expect(grupoOficinas?.ids).toEqual(['norte', 'sur']);
    expect(mocks.getTenantDb).toHaveBeenCalledTimes(1);
    expect(mocks.getTenantDb).toHaveBeenCalledWith('matriz');
  });

  it('abre una conexión por oficina con base propia', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 'matriz', dbUrl: null },
      { id: 'norte', dbUrl: null },
      { id: 'con-bd', dbUrl: 'postgresql://localhost/volkern_tenant_con_bd' },
    ]);
    mocks.getTenantDb.mockResolvedValue({
      client: { catalogoItem: { marca: 'conexion-propia' } },
    });

    const grupos: string[][] = [];
    const resultado = await enCadaConexion(['matriz', 'norte', 'con-bd'], async (ids) => {
      grupos.push([...ids].sort());
      return [ids.length];
    });

    expect(grupos).toHaveLength(2);
    expect(grupos).toContainEqual(['matriz', 'norte']);
    expect(grupos).toContainEqual(['con-bd']);
    expect(resultado.sort()).toEqual([1, 2]);
    expect(mocks.getTenantDb).toHaveBeenCalledTimes(1);
    expect(mocks.getTenantDb).toHaveBeenCalledWith('con-bd');
  });
});

describe('oficinasDeFranquicia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantFindMany.mockResolvedValue([]);
  });

  it('solo devuelve oficinas vigentes', async () => {
    mocks.tenantFindMany.mockResolvedValue([
      { id: 'norte', nombre: 'Oficina Norte', moneda: 'MXN' },
    ]);

    const oficinas = await oficinasDeFranquicia('matriz');

    expect(oficinas).toEqual([{ id: 'norte', nombre: 'Oficina Norte', moneda: 'MXN' }]);
    expect(mocks.tenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 'matriz', estado: { in: ['activo', 'trial'] } },
      }),
    );
  });
});

describe('sumarPorMoneda', () => {
  it('agrupa por divisa en lugar de sumarlas juntas', () => {
    const totales = sumarPorMoneda([
      { moneda: 'MXN', monto: 1000, estado: 'pendiente' },
      { moneda: 'EUR', monto: 100, estado: 'pagada' },
      { moneda: 'MXN', monto: 500, estado: 'pagada' },
    ]);

    expect(totales).toHaveLength(2);
    expect(totales[0]).toEqual({
      moneda: 'MXN',
      total: 1500,
      pendientes: 1000,
      aprobadas: 0,
      pagadas: 500,
      cantidad: 2,
    });
    expect(totales[1]).toEqual({
      moneda: 'EUR',
      total: 100,
      pendientes: 0,
      aprobadas: 0,
      pagadas: 100,
      cantidad: 1,
    });
  });
});
