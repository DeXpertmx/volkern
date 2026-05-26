import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock withTenantAuth para evitar autenticación real
vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test', slug: 'test', plan: 'pro' },
        user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
      };
      return handler(request, mockAuth, context);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET } from '@/app/api/erp/projects/[id]/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockProject = {
  id: 'proj-1',
  tenantId: 'test-tenant-id',
  name: 'Remodelación Oficina Centro',
  description: 'Remodelación completa de oficinas corporativas',
  status: 'PLANNING',
  startDate: new Date('2025-06-01'),
  endDate: null,
  budget: 45000,
  currency: 'EUR',
  progress: 0,
  leadId: 'lead-1',
  latitude: null,
  longitude: null,
  createdAt: new Date('2025-05-20'),
  updatedAt: new Date('2025-05-25'),
  lead: {
    id: 'lead-1',
    nombre: 'TechCorp SL',
    email: 'info@techcorp.com',
    empresa: 'TechCorp',
  },
  milestones: [
    {
      id: 'ms-1',
      name: 'Demolición',
      dueDate: new Date('2025-06-15'),
      status: 'PENDING',
    },
    {
      id: 'ms-2',
      name: 'Obra gruesa',
      dueDate: new Date('2025-07-01'),
      status: 'PENDING',
    },
  ],
  _count: { milestones: 2, expenses: 0, qualityChecks: 1 },
};

function mockRequest(id: string): Request {
  return new Request(`https://volkern.app/api/erp/projects/${id}`);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/erp/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver el proyecto con lead, hitos y conteos', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.id).toBe('proj-1');
    expect(data.name).toBe('Remodelación Oficina Centro');
    expect(data.status).toBe('PLANNING');
    expect(data.budget).toBe(45000);
    expect(data.currency).toBe('EUR');

    // Lead incluido
    expect(data.lead).toBeDefined();
    expect(data.lead.nombre).toBe('TechCorp SL');
    expect(data.lead.email).toBe('info@techcorp.com');

    // Milestones incluidos y ordenados
    expect(data.milestones).toHaveLength(2);
    expect(data.milestones[0].name).toBe('Demolición');
    expect(data.milestones[1].name).toBe('Obra gruesa');

    // Conteos
    expect(data._count).toEqual({ milestones: 2, expenses: 0, qualityChecks: 1 });
  });

  it('debe llamar a findUnique con tenantId para aislamiento', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'proj-1', tenantId: 'test-tenant-id' },
      include: {
        lead: { select: { id: true, nombre: true, email: true, empresa: true } },
        milestones: { orderBy: { dueDate: 'asc' } },
        _count: { select: { milestones: true, expenses: true, qualityChecks: true } },
      },
    });
  });

  it('debe devolver 404 si el proyecto no existe', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(null);

    const response = await GET(mockRequest('no-existe'), { params: { id: 'no-existe' } });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Proyecto no encontrado');
  });

  it('debe devolver 500 si Prisma lanza error', async () => {
    (prisma.project.findUnique as any).mockRejectedValue(new Error('DB connection error'));

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al obtener el proyecto');
  });

  it('debe manejar proyecto sin lead asociado', async () => {
    const projectWithoutLead = {
      ...mockProject,
      lead: null,
      leadId: null,
    };
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutLead);

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.lead).toBeNull();
    expect(data.leadId).toBeNull();
  });

  it('debe manejar proyecto sin hitos', async () => {
    const projectWithoutMilestones = {
      ...mockProject,
      milestones: [],
      _count: { ...mockProject._count, milestones: 0 },
    };
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutMilestones);

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.milestones).toEqual([]);
    expect(data._count.milestones).toBe(0);
  });

  it('debe serializar fechas como strings ISO en la respuesta JSON', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });
    const data = await response.json();

    expect(typeof data.startDate).toBe('string');
    expect(data.startDate).toBe(mockProject.startDate.toISOString());

    expect(typeof data.createdAt).toBe('string');
    expect(data.createdAt).toBe(mockProject.createdAt.toISOString());

    expect(typeof data.updatedAt).toBe('string');
    expect(data.updatedAt).toBe(mockProject.updatedAt.toISOString());
  });

  it('debe incluir endDate como null si no tiene fecha fin', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });
    const data = await response.json();

    expect(data.endDate).toBeNull();
  });

  it('debe devolver correctamente campos opcionales con valores null', async () => {
    const projectWithNulls = {
      ...mockProject,
      description: null,
      latitude: null,
      longitude: null,
    };
    (prisma.project.findUnique as any).mockResolvedValue(projectWithNulls);

    const response = await GET(mockRequest('proj-1'), { params: { id: 'proj-1' } });
    const data = await response.json();

    expect(data.description).toBeNull();
    expect(data.latitude).toBeNull();
    expect(data.longitude).toBeNull();
  });

  it('debe pasar el ID del proyecto desde params', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    await GET(mockRequest('different-id'), { params: { id: 'different-id' } });

    expect(prisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'different-id' }),
      })
    );
  });

  it('debe devolver 500 si params.id está vacío', async () => {
    (prisma.project.findUnique as any).mockRejectedValue(new Error('Invalid ID'));

    const response = await GET(mockRequest(''), { params: { id: '' } });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al obtener el proyecto');
  });
});
