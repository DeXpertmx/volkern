import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockTxClient = {
  projectMilestone: { deleteMany: vi.fn() },
  project: { delete: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectMilestone: {
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: typeof mockTxClient) => Promise<void>) =>
      cb(mockTxClient),
    ),
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

// Mocks para dependencias con import dinámico (wrapped en try/catch en el handler)
vi.mock('@/lib/audit-service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/connect/connect-service', () => ({
  ConnectService: {
    notifySystem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { PATCH, DELETE } from '@/app/api/erp/projects/[id]/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const existingProject = {
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
};

const updatedProject = {
  ...existingProject,
  name: 'Remodelación Oficina Centro (Ampliación)',
  description: 'Remodelación completa con ampliación',
  status: 'IN_PROGRESS',
  budget: 65000,
  progress: 25,
  updatedAt: new Date('2025-05-26'),
  lead: { id: 'lead-1', nombre: 'TechCorp SL' },
  milestones: [
    { id: 'ms-1', name: 'Demolición', dueDate: new Date('2025-06-15'), status: 'IN_PROGRESS' },
    { id: 'ms-2', name: 'Obra gruesa', dueDate: new Date('2025-07-01'), status: 'PENDING' },
  ],
};

const projectWithExpenses = {
  ...existingProject,
  _count: { expenses: 3, qualityChecks: 1 },
};

const projectWithoutExpenses = {
  ...existingProject,
  _count: { expenses: 0, qualityChecks: 1 },
};

function mockRequest(id: string, body?: unknown): Request {
  const url = `https://volkern.app/api/erp/projects/${id}`;
  if (body !== undefined) {
    return new Request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url, { method: 'DELETE' });
}

// ─── PATCH Tests ───────────────────────────────────────────────────────────

describe('PATCH /api/erp/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe actualizar campos básicos y devolver success + data', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    const body = { name: 'Remodelación Oficina Centro (Ampliación)', description: 'Remodelación completa con ampliación' };
    const response = await PATCH(mockRequest('proj-1', body), { params: { id: 'proj-1' } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Remodelación Oficina Centro (Ampliación)');
    expect(data.data.description).toBe('Remodelación completa con ampliación');
    expect(data.data.status).toBe('IN_PROGRESS');
  });

  it('debe actualizar todos los campos escalares', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    const body = {
      name: 'Remodelación Oficina Centro (Ampliación)',
      status: 'IN_PROGRESS',
      budget: '65000',
      currency: 'USD',
      progress: '25',
    };
    await PATCH(mockRequest('proj-1', body), { params: { id: 'proj-1' } });

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: {
        name: 'Remodelación Oficina Centro (Ampliación)',
        status: 'IN_PROGRESS',
        budget: 65000,
        currency: 'USD',
        progress: 25,
      },
      include: {
        lead: { select: { id: true, nombre: true } },
        milestones: { orderBy: { dueDate: 'asc' } },
      },
    });
  });

  it('debe parsear budget y progress como float', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { budget: '1234.56', progress: '75.5' }), { params: { id: 'proj-1' } });

    const call = (prisma.project.update as any).mock.calls[0][0];
    expect(call.data.budget).toBe(1234.56);
    expect(call.data.progress).toBe(75.5);
  });

  it('debe convertir fechas a Date objects', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { startDate: '2025-07-01T00:00:00.000Z' }), { params: { id: 'proj-1' } });

    const call = (prisma.project.update as any).mock.calls[0][0];
    expect(call.data.startDate).toBeInstanceOf(Date);
    expect(call.data.startDate.toISOString()).toBe('2025-07-01T00:00:00.000Z');
  });

  it('debe establecer endDate a null si se envía como null', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { endDate: null }), { params: { id: 'proj-1' } });

    const call = (prisma.project.update as any).mock.calls[0][0];
    expect(call.data.endDate).toBeNull();
  });

  it('debe incluir endDate como fecha si se envía valor', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { endDate: '2025-12-31T00:00:00.000Z' }), { params: { id: 'proj-1' } });

    const call = (prisma.project.update as any).mock.calls[0][0];
    expect(call.data.endDate).toBeInstanceOf(Date);
    expect(call.data.endDate.toISOString()).toBe('2025-12-31T00:00:00.000Z');
  });

  it('debe ignorar campos no enviados (undefined)', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { name: 'Solo nombre' }), { params: { id: 'proj-1' } });

    const call = (prisma.project.update as any).mock.calls[0][0];
    // Solo name debe estar en data
    expect(Object.keys(call.data)).toEqual(['name']);
    expect(call.data.name).toBe('Solo nombre');
  });

  it('debe manejar latitude y longitude como float', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { latitude: '40.4168', longitude: '-3.7038' }), { params: { id: 'proj-1' } });

    const call = (prisma.project.update as any).mock.calls[0][0];
    expect(call.data.latitude).toBe(40.4168);
    expect(call.data.longitude).toBe(-3.7038);
  });

  it('debe devolver 404 si el proyecto no existe', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(null);

    const response = await PATCH(mockRequest('no-existe', { name: 'Test' }), { params: { id: 'no-existe' } });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Proyecto no encontrado');
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma lanza error en findUnique', async () => {
    (prisma.project.findUnique as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(mockRequest('proj-1', { name: 'Test' }), { params: { id: 'proj-1' } });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al actualizar el proyecto');
  });

  it('debe verificar que el proyecto pertenece al tenant', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    await PATCH(mockRequest('proj-1', { name: 'Test' }), { params: { id: 'proj-1' } });

    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'proj-1', tenantId: 'test-tenant-id' },
    });
  });

  it('debe incluir lead y milestones en la respuesta del update', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(existingProject);
    (prisma.project.update as any).mockResolvedValue(updatedProject);

    const response = await PATCH(mockRequest('proj-1', { name: 'Test' }), { params: { id: 'proj-1' } });

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          lead: { select: { id: true, nombre: true } },
          milestones: { orderBy: { dueDate: 'asc' } },
        },
      }),
    );
  });
});

// ─── DELETE Tests ──────────────────────────────────────────────────────────

describe('DELETE /api/erp/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe eliminar proyecto y devolver success', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutExpenses);

    const response = await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe('Proyecto eliminado correctamente');
  });

  it('debe usar transacción para eliminar hitos primero y luego el proyecto', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutExpenses);

    await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(mockTxClient.projectMilestone.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
    });
    expect(mockTxClient.project.delete).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
    });
  });

  it('debe crear audit log después de eliminar', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutExpenses);

    await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        accion: 'DELETE',
        entidad: 'Project',
        entidadId: 'proj-1',
        descripcion: expect.stringContaining('Remodelación Oficina Centro'),
        cambiosAntes: expect.stringContaining('PLANNING'),
      },
    });
  });

  it('debe devolver 404 si el proyecto no existe', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('no-existe'), { params: { id: 'no-existe' } });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Proyecto no encontrado');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('debe devolver 409 si el proyecto tiene gastos', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithExpenses);

    const response = await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain('gastos');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma lanza error en findUnique', async () => {
    (prisma.project.findUnique as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al eliminar el proyecto');
  });

  it('debe verificar que el proyecto pertenece al tenant', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutExpenses);

    await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'proj-1', tenantId: 'test-tenant-id' },
      include: { _count: { select: { expenses: true, qualityChecks: true } } },
    });
  });

  it('debe devolver 500 si $transaction falla', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutExpenses);
    (prisma.$transaction as any).mockRejectedValueOnce(new Error('Transaction failed'));

    const response = await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al eliminar el proyecto');
  });

  it('debe continuar aunque auditLog.create falle (catch silencioso)', async () => {
    (prisma.project.findUnique as any).mockResolvedValue(projectWithoutExpenses);
    (prisma.auditLog.create as any).mockRejectedValue(new Error('Audit DB error'));

    const response = await DELETE(mockRequest('proj-1'), { params: { id: 'proj-1' } });

    // La respuesta debe ser exitosa aunque el audit log falle
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
