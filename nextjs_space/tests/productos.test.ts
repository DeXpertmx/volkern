import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    aseguradora: {
      findFirst: vi.fn(),
    },
    productoSeguro: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'test-tenant-id', nombre: 'Test Tenant', slug: 'test', plan: 'growth' },
    user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
    authMethod: 'session',
  }),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/insurance/productos/route';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockProducto = {
  id: 'prod-1',
  tenantId: 'test-tenant-id',
  aseguradoraId: 'aseg-1',
  nombre: 'Auto Todo Riesgo',
  ramo: 'AUTO',
  subramo: 'Particulares',
  descripcion: 'Cobertura completa de automóvil',
  primaReferencia: 650,
  comisionPct: 12.5,
  activo: true,
  aseguradora: { id: 'aseg-1', nombre: 'AXA Seguros' },
  _count: { polizas: 4 },
};

function makeReq(url = 'http://localhost/api/insurance/productos', init?: RequestInit) {
  return new Request(url, init) as any;
}

describe('GET /api/insurance/productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.productoSeguro.findMany as any).mockResolvedValue([mockProducto]);
  });

  it('devuelve { productos: [...] } (fix: antes devolvía array plano y la UI leía data.productos)', async () => {
    const res = await GET(makeReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(false);
    expect(body.productos).toHaveLength(1);
    expect(body.productos[0].nombre).toBe('Auto Todo Riesgo');
    expect(body.productos[0]._count.polizas).toBe(4);
  });

  it('filtra por tenant, incluye aseguradora y _count, ordena por nombre', async () => {
    await GET(makeReq());
    expect(prisma.productoSeguro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id' },
        include: {
          aseguradora: { select: { id: true, nombre: true } },
          _count: { select: { polizas: true } },
        },
        orderBy: { nombre: 'asc' },
      })
    );
  });

  it('aplica búsqueda por nombre/descripción, ramo, aseguradoraId y activo', async () => {
    await GET(makeReq('http://localhost/api/insurance/productos?search=auto&ramo=AUTO&aseguradoraId=aseg-1&activo=true'));
    expect(prisma.productoSeguro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'test-tenant-id',
          OR: [
            { nombre: { contains: 'auto', mode: 'insensitive' } },
            { descripcion: { contains: 'auto', mode: 'insensitive' } },
          ],
          ramo: 'AUTO',
          aseguradoraId: 'aseg-1',
          activo: true,
        },
      })
    );
  });

  it('devuelve 401 si no hay sesión válida', async () => {
    (authenticateRequest as any).mockResolvedValueOnce({ valid: false, error: 'No autorizado' });
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('devuelve 500 ante error de BD', async () => {
    (prisma.productoSeguro.findMany as any).mockRejectedValueOnce(new Error('db down'));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});

describe('POST /api/insurance/productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Validación de la aseguradora: existe en el tenant
    (prisma.aseguradora.findFirst as any).mockResolvedValue({ id: 'aseg-1', tenantId: 'test-tenant-id' });
    // No hay producto duplicado por defecto
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(null);
    (prisma.productoSeguro.create as any).mockResolvedValue(mockProducto);
  });

  it('crea un producto validando la aseguradora del tenant', async () => {
    const res = await POST(
      makeReq('http://localhost/api/insurance/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aseguradoraId: 'aseg-1',
          nombre: 'Auto Todo Riesgo',
          ramo: 'AUTO',
          subramo: 'Particulares',
          descripcion: 'Cobertura completa',
          primaReferencia: '650',
          comisionPct: '12.5',
        }),
      })
    );
    expect(res.status).toBe(201);
    expect(prisma.productoSeguro.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          aseguradoraId: 'aseg-1',
          nombre: 'Auto Todo Riesgo',
          ramo: 'AUTO',
          subramo: 'Particulares',
          primaReferencia: 650,
          comisionPct: 12.5,
        }),
      })
    );
  });

  it('rechaza sin aseguradoraId, nombre o ramo', async () => {
    const res = await POST(
      makeReq('http://localhost/api/insurance/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: 'Sin ramo' }),
      })
    );
    expect(res.status).toBe(400);
    expect(prisma.productoSeguro.create).not.toHaveBeenCalled();
  });

  it('devuelve 404 si la aseguradora no existe en el tenant', async () => {
    (prisma.aseguradora.findFirst as any).mockResolvedValueOnce(null);
    const res = await POST(
      makeReq('http://localhost/api/insurance/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aseguradoraId: 'aseg-x', nombre: 'X', ramo: 'AUTO' }),
      })
    );
    expect(res.status).toBe(404);
    expect(prisma.productoSeguro.create).not.toHaveBeenCalled();
  });

  it('rechaza duplicado por aseguradora + nombre', async () => {
    // La aseguradora existe (beforeEach); el producto ya está registrado
    (prisma.productoSeguro.findFirst as any).mockResolvedValueOnce(mockProducto);
    const res = await POST(
      makeReq('http://localhost/api/insurance/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aseguradoraId: 'aseg-1', nombre: 'Auto Todo Riesgo', ramo: 'AUTO' }),
      })
    );
    expect(res.status).toBe(400);
    expect(prisma.productoSeguro.create).not.toHaveBeenCalled();
  });
});
