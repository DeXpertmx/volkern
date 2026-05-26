import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
    },
  },
}));

// Mock withTenantAuth para evitar autenticación real
vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test', slug: 'test', plan: 'pro' },
        user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
      };
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET } from '@/app/api/erp/projects/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockProjects = [
  {
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
    lead: { id: 'lead-1', nombre: 'TechCorp SL' },
    milestones: [
      { id: 'ms-1', name: 'Demolición', dueDate: new Date('2025-06-15'), status: 'PENDING' },
      { id: 'ms-2', name: 'Obra gruesa', dueDate: new Date('2025-07-01'), status: 'PENDING' },
    ],
    _count: { milestones: 2 },
  },
  {
    id: 'proj-2',
    tenantId: 'test-tenant-id',
    name: 'Instalación Solar Parque Industrial',
    description: 'Instalación de paneles solares en cubierta',
    status: 'IN_PROGRESS',
    startDate: new Date('2025-04-15'),
    endDate: new Date('2025-08-30'),
    budget: 120000,
    currency: 'EUR',
    progress: 40,
    leadId: 'lead-2',
    latitude: 40.4168,
    longitude: -3.7038,
    createdAt: new Date('2025-04-10'),
    updatedAt: new Date('2025-05-22'),
    lead: { id: 'lead-2', nombre: 'EcoEnergy Solutions' },
    milestones: [
      { id: 'ms-3', name: 'Estudio de Viabilidad', dueDate: new Date('2025-05-01'), status: 'COMPLETED' },
    ],
    _count: { milestones: 1 },
  },
  {
    id: 'proj-3',
    tenantId: 'test-tenant-id',
    name: 'Mantenimiento Anual Edificio Torre',
    description: null,
    status: 'COMPLETED',
    startDate: new Date('2024-01-10'),
    endDate: new Date('2024-12-20'),
    budget: 25000,
    currency: 'EUR',
    progress: 100,
    leadId: null,
    latitude: null,
    longitude: null,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-12-21'),
    lead: null,
    milestones: [],
    _count: { milestones: 0 },
  },
];

function mockRequest(url: string): Request {
  return new Request(url);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/erp/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe listar todos los proyectos del tenant', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(3);
    expect(data[0].name).toBe('Remodelación Oficina Centro');
    expect(data[1].name).toBe('Instalación Solar Parque Industrial');
    expect(data[2].name).toBe('Mantenimiento Anual Edificio Torre');
  });

  it('debe filtrar por tenantId para aislamiento', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  it('debe incluir lead, milestones y _count en cada proyecto', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects'));
    const data = await response.json();

    // Lead info
    expect(data[0].lead).toBeDefined();
    expect(data[0].lead.nombre).toBe('TechCorp SL');
    expect(data[1].lead.nombre).toBe('EcoEnergy Solutions');
    expect(data[2].lead).toBeNull();

    // Milestones
    expect(data[0].milestones).toHaveLength(2);
    expect(data[1].milestones).toHaveLength(1);
    expect(data[2].milestones).toEqual([]);

    // _count
    expect(data[0]._count).toEqual({ milestones: 2 });
    expect(data[1]._count).toEqual({ milestones: 1 });
    expect(data[2]._count).toEqual({ milestones: 0 });
  });

  it('debe ordenar por createdAt descendente', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('debe limitar milestones a 10 y ordenarlos por dueDate ascendente', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          milestones: { orderBy: { dueDate: 'asc' }, take: 10 },
        }),
      }),
    );
  });

  it('debe incluir lead con id y nombre', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          lead: { select: { id: true, nombre: true } },
        }),
      }),
    );
  });

  it('debe filtrar por status si se proporciona query param', async () => {
    (prisma.project.findMany as any).mockResolvedValue([mockProjects[0]]); // solo PLANNING

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects?status=PLANNING'));

    expect(response.status).toBe(200);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PLANNING' }),
      }),
    );
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe('PLANNING');
  });

  it('debe filtrar por leadId si se proporciona query param', async () => {
    (prisma.project.findMany as any).mockResolvedValue([mockProjects[0]]);

    await GET(mockRequest('https://volkern.app/api/erp/projects?leadId=lead-1'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadId: 'lead-1' }),
      }),
    );
  });

  it('debe filtrar por status y leadId simultáneamente', async () => {
    (prisma.project.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/erp/projects?status=PLANNING&leadId=lead-1'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PLANNING',
          leadId: 'lead-1',
          tenantId: 'test-tenant-id',
        }),
      }),
    );
  });

  it('debe ignorar query params desconocidos', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    await GET(mockRequest('https://volkern.app/api/erp/projects?unknown=value&foo=bar'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe devolver array vacío si no hay proyectos', async () => {
    (prisma.project.findMany as any).mockResolvedValue([]);

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('debe devolver 500 si Prisma lanza error', async () => {
    (prisma.project.findMany as any).mockRejectedValue(new Error('DB connection error'));

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al cargar proyectos');
  });

  it('debe serializar fechas como ISO strings en la respuesta', async () => {
    (prisma.project.findMany as any).mockResolvedValue(mockProjects);

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects'));
    const data = await response.json();

    expect(typeof data[0].startDate).toBe('string');
    expect(data[0].startDate).toBe(mockProjects[0].startDate.toISOString());
    expect(typeof data[0].createdAt).toBe('string');
    expect(data[0].createdAt).toBe(mockProjects[0].createdAt.toISOString());

    // endDate null
    expect(data[0].endDate).toBeNull();
    // endDate con valor
    expect(typeof data[1].endDate).toBe('string');
    expect(data[1].endDate).toBe(mockProjects[1].endDate!.toISOString());
  });

  it('debe incluir milestones ordenados por dueDate ascendente', async () => {
    const projectsWithUnsortedMilestones = [
      {
        ...mockProjects[1],
        milestones: [
          { id: 'ms-3', name: 'Estudio de Viabilidad', dueDate: new Date('2025-05-01'), status: 'COMPLETED' },
        ],
      },
    ];
    (prisma.project.findMany as any).mockResolvedValue(projectsWithUnsortedMilestones);

    await GET(mockRequest('https://volkern.app/api/erp/projects'));

    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          milestones: { orderBy: { dueDate: 'asc' }, take: 10 },
        }),
      }),
    );
  });

  it('debe incluir proyectos sin lead asociado', async () => {
    (prisma.project.findMany as any).mockResolvedValue([mockProjects[2]]); // proj-3 sin lead

    const response = await GET(mockRequest('https://volkern.app/api/erp/projects'));
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].lead).toBeNull();
    expect(data[0].leadId).toBeNull();
  });
});
