/**
 * Tests de Integración — Real Estate AI Consult (RAG)
 *
 * Verifica el endpoint POST /api/ai/real-estate/consult con
 * mocks de Prisma, AIEngine y withTenantAuth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

// Mock withTenantAuth
vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: {
          id: 'test-tenant-id',
          nombre: 'Test Agency',
          slug: 'test-agency',
          plan: 'pro',
          accountType: 'AGENCY',
        },
        user: { id: 'test-user-id', name: 'Admin', email: 'admin@test.com' },
      };
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

// Mock AIEngine
vi.mock('@/lib/event-engine/ai-engine/ai-engine', () => ({
  AIEngine: {
    chat: vi.fn(),
  },
}));

// Mock property-helpers
vi.mock('@/lib/real-estate/property-helpers', () => ({
  parseInmueble: vi.fn((p: any) => ({
    propertyType: p.customFieldValues?.tipo_inmueble || 'Departamento',
    operationType: p.customFieldValues?.tipo_operacion || 'venta',
    precioBase: p.precioBase || 250000,
    city: p.customFieldValues?.zona || 'Madrid',
    area: p.customFieldValues?.zona || 'Centro',
    bedrooms: Number(p.customFieldValues?.habitaciones) || 3,
    bathrooms: Number(p.customFieldValues?.banos) || 2,
    areaM2: Number(p.customFieldValues?.superficie_total) || 100,
    hasPool: false,
    hasParking: true,
    hasElevator: true,
    hasGarden: false,
  })),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { POST } from '@/app/api/ai/real-estate/consult/route';
import { AIEngine } from '@/lib/event-engine/ai-engine/ai-engine';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(body: unknown): Request {
  return new Request('https://volkern.app/api/ai/real-estate/consult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/ai/real-estate/consult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validación ─────────────────────────────────────────────────────────

  it('debe devolver 400 si consulta no está presente', async () => {
    const res = await POST(mockRequest({}));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('consulta es requerida');
  });

  it('debe devolver 400 si consulta no es string', async () => {
    const res = await POST(mockRequest({ consulta: 123 }));
    expect(res.status).toBe(400);
  });

  // ── Flujo exitoso con AI ───────────────────────────────────────────────

  it('debe procesar consulta y retornar propiedades con IA', async () => {
    // 1. AI extrae filtros
    (AIEngine.chat as any)
      .mockResolvedValueOnce({
        content: JSON.stringify({
          tipoOperacion: 'venta',
          tipoInmueble: 'Departamento',
          ciudad: 'Madrid',
          precioMax: 300000,
          habitacionesMin: 2,
          intencion: 'busqueda',
          palabrasClave: [],
        }),
      })
      // 2. AI genera respuesta RAG
      .mockResolvedValueOnce({
        content: 'Te recomiendo estos 2 pisos en Madrid que se ajustan a tu presupuesto...',
      });

    // Query results
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'inm-1',
        titulo: 'Piso en Centro',
        nombre: 'Piso en Centro',
        precioBase: 250000,
        descripcion: 'Piso luminoso en el centro de Madrid',
        customFieldValues: {
          tipo_operacion: 'venta',
          tipo_inmueble: 'Departamento',
          zona: 'Madrid Centro',
          habitaciones: '3',
          banos: '2',
          superficie_total: '90',
          estado: 'disponible',
        },
        media: [{ url: 'https://cdn.example.com/img1.jpg', tipo: 'imagen' }],
        relevance_score: 45,
        activo: true,
        tenantId: 'test-tenant-id',
      },
      {
        id: 'inm-2',
        titulo: 'Piso en Chamberí',
        nombre: 'Piso en Chamberí',
        precioBase: 280000,
        descripcion: 'Piso reformado en Chamberí',
        customFieldValues: {
          tipo_operacion: 'venta',
          tipo_inmueble: 'Departamento',
          zona: 'Chamberí',
          habitaciones: '2',
          banos: '1',
          superficie_total: '70',
          estado: 'disponible',
        },
        media: [],
        relevance_score: 40,
        activo: true,
        tenantId: 'test-tenant-id',
      },
    ]);

    const res = await POST(mockRequest({ consulta: 'busco un piso en Madrid de hasta 300.000€ con 2 habitaciones' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.respuesta).toBe('Te recomiendo estos 2 pisos en Madrid que se ajustan a tu presupuesto...');
    expect(json.propiedades).toHaveLength(2);
    expect(json.total).toBe(2);
    expect(json.filtrosDetectados.tipoOperacion).toBe('venta');
    expect(json.filtrosDetectados.ciudad).toBe('Madrid');
    expect(json.propiedades[0].precio).toBe(250000);
    expect(json.propiedades[0].precioFormateado).toContain('250.000');
  });

  it('debe usar extractSimpleFilters como fallback cuando IA falla', async () => {
    // AI falla al extraer filtros
    (AIEngine.chat as any)
      .mockRejectedValueOnce(new Error('AI timeout'))
      .mockResolvedValueOnce({
        content: 'Respuesta de fallback procesada...',
      });

    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'inm-1',
        nombre: 'Casa en Madrid',
        precioBase: 250000,
        descripcion: 'Casa con jardín',
        customFieldValues: {
          tipo_operacion: 'venta',
          tipo_inmueble: 'Casa',
          zona: 'Madrid',
          habitaciones: '3',
          banos: '2',
          estado: 'disponible',
        },
        media: [],
        relevance_score: 30,
        activo: true,
        tenantId: 'test-tenant-id',
      },
    ]);

    const res = await POST(mockRequest({ consulta: 'quiero comprar una casa en Madrid' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.filtrosDetectados.tipoOperacion).toBe('venta');
    expect(json.filtrosDetectados.tipoInmueble).toBe('Casa');
  });

  it('debe usar mensaje genérico cuando AI falla también en respuesta', async () => {
    // IA falla en ambos llamados
    (AIEngine.chat as any)
      .mockRejectedValueOnce(new Error('AI timeout'))
      .mockRejectedValueOnce(new Error('AI timeout 2'));

    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const res = await POST(mockRequest({ consulta: 'piso en Marte' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.respuesta).toContain('No encontré propiedades');
    expect(json.propiedades).toHaveLength(0);
    expect(json.total).toBe(0);
  });

  it('debe detectar intención de recomendación', async () => {
    (AIEngine.chat as any)
      .mockRejectedValueOnce(new Error('AI timeout'))
      .mockResolvedValueOnce({
        content: 'Respuesta genérica',
      });

    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const res = await POST(mockRequest({ consulta: 'recomiéndame las mejores propiedades en Barcelona' }));
    const json = await res.json();

    expect(json.filtrosDetectados.intencion).toBe('recomendacion');
    expect(json.filtrosDetectados.ciudad).toBe('Barcelona');
  });

  it('debe detectar precio con sufijo k', async () => {
    (AIEngine.chat as any)
      .mockRejectedValueOnce(new Error('AI timeout'))
      .mockResolvedValueOnce({
        content: 'Respuesta',
      });

    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const res = await POST(mockRequest({ consulta: 'pisos hasta 200k en Madrid' }));
    const json = await res.json();

    // "hasta 200k" -> precioMax = 200 * 1000 = 200000
    expect(json.filtrosDetectados.precioMax).toBe(200000);
    expect(json.filtrosDetectados.ciudad).toBe('Madrid');
  });

  it('debe detectar rango de precios con "entre"', async () => {
    (AIEngine.chat as any)
      .mockRejectedValueOnce(new Error('AI timeout'))
      .mockResolvedValueOnce({
        content: 'Respuesta',
      });

    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const res = await POST(mockRequest({ consulta: 'quiero propiedades entre 100k y 300k' }));
    const json = await res.json();

    expect(json.filtrosDetectados.precioMin).toBe(100000);
    expect(json.filtrosDetectados.precioMax).toBe(300000);
  });

  it('debe devolver 500 si hay error inesperado', async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await POST(mockRequest({ consulta: 'piso en Madrid' }));
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe('Error al procesar la consulta');
  });

  it('debe detectar número de habitaciones en texto natural', async () => {
    (AIEngine.chat as any)
      .mockRejectedValueOnce(new Error('AI timeout'))
      .mockResolvedValueOnce({
        content: 'Respuesta',
      });

    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const res = await POST(mockRequest({ consulta: 'piso con 4 habitaciones en Valencia' }));
    const json = await res.json();

    expect(json.filtrosDetectados.habitacionesMin).toBe(4);
    expect(json.filtrosDetectados.ciudad).toBe('Valencia');
  });
});
