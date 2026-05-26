import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockTx = {
  project: { create: vi.fn() },
  lead: { update: vi.fn() },
  projectMilestone: { create: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    chatChannel: { findFirst: vi.fn() },
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

// Mock Smart Connect (import dinámico, envuelto en try/catch en el handler)
vi.mock('@/lib/connect/connect-service', () => ({
  ConnectService: {
    notifySystem: vi.fn().mockResolvedValue(undefined),
    createEntityChannel: vi.fn().mockResolvedValue({ id: 'channel-1' }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { POST } from '@/app/api/erp/projects/route';
import { prisma } from '@/lib/db';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(body: unknown): Request {
  return new Request('https://volkern.app/api/erp/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/erp/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockTx methods are reset by vi.clearAllMocks() above
  });

  // ── Validación ───────────────────────────────────────────────────────

  it('debe devolver 400 si el nombre está vacío', async () => {
    const response = await POST(mockRequest({ name: '' }), undefined);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('El nombre es obligatorio');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si el nombre no se envía', async () => {
    const response = await POST(mockRequest({ description: 'test' }), undefined);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('El nombre es obligatorio');
  });

  // ── Creación básica ──────────────────────────────────────────────────

  it('debe crear un proyecto con campos mínimos', async () => {
    const newProject = {
      id: 'proj-new',
      tenantId: 'test-tenant-id',
      name: 'Proyecto Test',
      status: 'PLANNING',
      budget: 0,
      currency: 'EUR',
      startDate: new Date(),
      createdAt: new Date(),
    };
    mockTx.project.create.mockResolvedValue(newProject);

    const response = await POST(mockRequest({ name: 'Proyecto Test' }), undefined);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe('proj-new');
    expect(data.name).toBe('Proyecto Test');
    expect(data.status).toBe('PLANNING');
    expect(data.currency).toBe('EUR');
  });

  it('debe enviar todos los campos a project.create', async () => {
    const newProject = {
      id: 'proj-full',
      tenantId: 'test-tenant-id',
      name: 'Obra Completa',
      description: 'Descripción detallada',
      leadId: 'lead-1',
      budget: 50000,
      currency: 'USD',
      status: 'PLANNING',
      startDate: new Date('2025-07-01'),
      endDate: new Date('2025-12-31'),
    };
    mockTx.project.create.mockResolvedValue(newProject);

    await POST(mockRequest({
      name: 'Obra Completa',
      description: 'Descripción detallada',
      leadId: 'lead-1',
      budget: '50000',
      currency: 'USD',
      startDate: '2025-07-01T00:00:00.000Z',
      endDate: '2025-12-31T00:00:00.000Z',
    }), undefined);

    expect(mockTx.project.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'test-tenant-id',
        name: 'Obra Completa',
        description: 'Descripción detallada',
        leadId: 'lead-1',
        budget: 50000,
        currency: 'USD',
        status: 'PLANNING',
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      },
    });
  });

  it('debe parsear budget como float', async () => {
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', status: 'PLANNING', budget: 1234.56 });

    await POST(mockRequest({ name: 'Test', budget: '1234.56' }), undefined);

    expect(mockTx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ budget: 1234.56 }),
      }),
    );
  });

  it('debe usar EUR como currency por defecto', async () => {
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', status: 'PLANNING', budget: 0, startDate: new Date() });

    await POST(mockRequest({ name: 'Test' }), undefined);

    expect(mockTx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'EUR' }),
      }),
    );
  });

  it('debe usar 0 como budget por defecto', async () => {
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', status: 'PLANNING', budget: 0, startDate: new Date() });

    await POST(mockRequest({ name: 'Test' }), undefined);

    expect(mockTx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ budget: 0 }),
      }),
    );
  });

  it('debe usar Date.now para startDate si no se envía', async () => {
    const before = Date.now();
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', status: 'PLANNING', budget: 0, startDate: new Date() });

    await POST(mockRequest({ name: 'Test' }), undefined);

    const call = mockTx.project.create.mock.calls[0][0];
    const startDate = call.data.startDate.getTime();
    expect(startDate).toBeGreaterThanOrEqual(before);
    expect(startDate).toBeLessThanOrEqual(Date.now());
  });

  // ── Lead update ──────────────────────────────────────────────────────

  it('debe actualizar lead a ganado si se envía leadId', async () => {
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', startDate: new Date(), budget: 0 });

    await POST(mockRequest({ name: 'Test', leadId: 'lead-1' }), undefined);

    expect(mockTx.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { estado: 'ganado' },
    });
  });

  it('NO debe actualizar lead si no se envía leadId', async () => {
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', startDate: new Date(), budget: 0 });

    await POST(mockRequest({ name: 'Test' }), undefined);

    expect(mockTx.lead.update).not.toHaveBeenCalled();
  });

  // ── Hitos genéricos ──────────────────────────────────────────────────

  it('debe crear 3 hitos genéricos si no hay palabras clave', async () => {
    const startDate = new Date('2025-06-01');
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Obra Civil General', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Obra Civil General' }), undefined);

    expect(mockTx.projectMilestone.create).toHaveBeenCalledTimes(3);
    // Verificar hitos específicos
    const calls = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0]);
    const names = calls.map((c: any) => c.data.name);
    expect(names).toContain('Inicio de Proyecto / Kickoff');
    expect(names).toContain('Entregable de Fase 1');
    expect(names).toContain('Cierre de Proyecto');
  });

  it('los hitos genéricos deben tener dueDate calculado desde startDate + días', async () => {
    const startDate = new Date('2025-06-01');
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Obra Civil', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Obra Civil' }), undefined);

    const calls = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0]);
    const dueDates = calls.map((c: any) => c.data.dueDate);

    // Kickoff: startDate + 1 día
    expect(dueDates[0].toISOString()).toBe(new Date('2025-06-02').toISOString());
    // Fase 1: startDate + 15 días
    expect(dueDates[1].toISOString()).toBe(new Date('2025-06-16').toISOString());
    // Cierre: startDate + 30 días
    expect(dueDates[2].toISOString()).toBe(new Date('2025-07-01').toISOString());
  });

  it('los hitos genéricos deben tener isCritical correcto', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Obra Civil', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Obra Civil' }), undefined);

    const calls = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0]);
    expect(calls[0].data.isCritical).toBe(true);  // Kickoff
    expect(calls[1].data.isCritical).toBe(false); // Fase 1
    expect(calls[2].data.isCritical).toBe(true);  // Cierre
  });

  // ── Hitos solar/energía ──────────────────────────────────────────────

  it('debe crear 4 hitos solares si el nombre contiene "solar"', async () => {
    const startDate = new Date('2025-06-01');
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Instalación Solar Parque', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Instalación Solar Parque' }), undefined);

    expect(mockTx.projectMilestone.create).toHaveBeenCalledTimes(4);
    const names = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0].data.name);
    expect(names).toContain('Estudio de Viabilidad Fotovoltaica');
    expect(names).toContain('Adquisición de Paneles e Inversores');
    expect(names).toContain('Instalación de Estructuras');
    expect(names).toContain('Conexión a Red y Pruebas');
  });

  it('debe crear 4 hitos solares si la descripción contiene "energía"', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Proyecto Renovable', startDate, budget: 0 });

    await POST(mockRequest({
      name: 'Proyecto Renovable',
      description: 'Instalación de energía fotovoltaica',
    }), undefined);

    expect(mockTx.projectMilestone.create).toHaveBeenCalledTimes(4);
    const names = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0].data.name);
    expect(names).toContain('Estudio de Viabilidad Fotovoltaica');
  });

  it('los hitos solares deben tener dueDate correcto', async () => {
    const startDate = new Date('2025-06-01');
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Instalación Solar', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Instalación Solar' }), undefined);

    const calls = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0]);
    // Solar milestones: 7, 20, 35, 45 días desde startDate
    expect(calls[0].data.dueDate.toISOString()).toBe(new Date('2025-06-08').toISOString());  // +7
    expect(calls[1].data.dueDate.toISOString()).toBe(new Date('2025-06-21').toISOString());  // +20
    expect(calls[2].data.dueDate.toISOString()).toBe(new Date('2025-07-06').toISOString());  // +35
    expect(calls[3].data.dueDate.toISOString()).toBe(new Date('2025-07-16').toISOString());  // +45
  });

  // ── Hitos mantenimiento ──────────────────────────────────────────────

  it('debe crear 4 hitos de mantenimiento si el nombre contiene "mantenimiento"', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Mantenimiento Anual Torre', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Mantenimiento Anual Torre' }), undefined);

    expect(mockTx.projectMilestone.create).toHaveBeenCalledTimes(4);
    const names = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0].data.name);
    expect(names).toContain('Diagnóstico Técnico Inicial');
    expect(names).toContain('Suministro de Repuestos');
    expect(names).toContain('Ejecución de Trabajos');
    expect(names).toContain('Certificación de Entrega');
  });

  it('debe crear 4 hitos de mantenimiento si el nombre contiene "reparación"', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Reparación Estructural', startDate, budget: 0 });

    await POST(mockRequest({ name: 'Reparación Estructural' }), undefined);

    expect(mockTx.projectMilestone.create).toHaveBeenCalledTimes(4);
    const names = mockTx.projectMilestone.create.mock.calls.map((c: any[]) => c[0].data.name);
    expect(names).toContain('Diagnóstico Técnico Inicial');
    expect(names).toContain('Suministro de Repuestos');
  });

  // ── Errores ──────────────────────────────────────────────────────────

  it('debe devolver 500 si la transacción falla', async () => {
    mockTx.project.create.mockRejectedValue(new Error('DB error'));

    const response = await POST(mockRequest({ name: 'Proyecto Test' }), undefined);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al crear el proyecto');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/erp/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await POST(req, undefined);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al crear el proyecto');
  });

  // ── Smart Connect ────────────────────────────────────────────────────

  it('debe llamar a Smart Connect notifySystem tras crear el proyecto', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({
      id: 'proj-sc',
      name: 'Proyecto Smart',
      currency: 'EUR',
      budget: 25000,
      startDate,
    });

    const { ConnectService } = await import('@/lib/connect/connect-service');

    await POST(mockRequest({ name: 'Proyecto Smart', budget: '25000' }), undefined);

    expect(ConnectService.notifySystem).toHaveBeenCalledWith(
      'test-tenant-id',
      'Ventas',
      expect.stringContaining('Proyecto Smart'),
      { entityType: 'Project', entityId: 'proj-sc' },
    );
  });

  it('debe llamar a Smart Connect createEntityChannel', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({
      id: 'proj-ch',
      name: 'Canal Test Project',
      currency: 'EUR',
      budget: 10000,
      startDate,
    });

    const { ConnectService } = await import('@/lib/connect/connect-service');

    await POST(mockRequest({ name: 'Canal Test Project' }), undefined);

    expect(ConnectService.createEntityChannel).toHaveBeenCalledWith({
      tenantId: 'test-tenant-id',
      name: expect.stringContaining('CANAL-TEST'),
      type: 'project',
      entityId: 'proj-ch',
      userIds: ['test-user-id'],
    });
  });

  it('debe devolver 200 aunque Smart Connect falle (catch silencioso)', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({
      id: 'proj-fail',
      name: 'Smart Fail',
      currency: 'EUR',
      budget: 5000,
      startDate,
    });

    // Hacer que notifySystem falle (solo una vez — mockRejectedValueOnce para no contaminar tests siguientes)
    const { ConnectService } = await import('@/lib/connect/connect-service');
    (ConnectService.notifySystem as any).mockRejectedValueOnce(new Error('Smart Connect timeout'));

    const response = await POST(mockRequest({ name: 'Smart Fail' }), undefined);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('Smart Fail');
  });

  it('debe enviar mensaje de bienvenida si se encuentra el canal del proyecto', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({
      id: 'proj-welcome',
      name: 'Proyecto Bienvenida',
      currency: 'EUR',
      budget: 5000,
      startDate,
    });
    (prisma.chatChannel.findFirst as any).mockResolvedValue({ id: 'channel-1', name: 'PROYECTO-BIENVENIDA' });

    const { ConnectService } = await import('@/lib/connect/connect-service');

    await POST(mockRequest({ name: 'Proyecto Bienvenida' }), undefined);

    expect(ConnectService.sendMessage).toHaveBeenCalledWith({
      tenantId: 'test-tenant-id',
      channelId: 'channel-1',
      content: expect.stringContaining('Proyecto Bienvenida'),
      isSystemMessage: true,
      attributions: [{ entityType: 'Project', entityId: 'proj-welcome' }],
    });
  });

  it('NO debe enviar mensaje si no se encuentra el canal del proyecto', async () => {
    const startDate = new Date();
    mockTx.project.create.mockResolvedValue({
      id: 'proj-nochan',
      name: 'Sin Canal',
      currency: 'EUR',
      budget: 5000,
      startDate,
    });
    (prisma.chatChannel.findFirst as any).mockResolvedValue(null);

    const { ConnectService } = await import('@/lib/connect/connect-service');

    await POST(mockRequest({ name: 'Sin Canal' }), undefined);

    expect(ConnectService.sendMessage).not.toHaveBeenCalled();
  });

  // ── Tenant isolation ─────────────────────────────────────────────────

  it('debe crear el proyecto con el tenantId correcto del auth', async () => {
    mockTx.project.create.mockResolvedValue({ id: 'p1', name: 'Test', startDate: new Date(), budget: 0 });

    await POST(mockRequest({ name: 'Test' }), undefined);

    expect(mockTx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });
});
