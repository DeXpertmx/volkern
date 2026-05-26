import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    deal: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dealActivity: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  getTenantDb: vi.fn(),
  dbContext: { tenantId: 'test-tenant-id' },
}));

vi.mock('@/lib/skills/context', () => ({
  createSystemContext: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: vi.fn().mockResolvedValue({ success: true, channel: 'telegram', status: 'sent' }),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, PATCH, DELETE } from '@/app/api/deals/[id]/route';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function mockRequest(url: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url);
}

const mockUser = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@test.com',
  tenantId: 'test-tenant-id',
};

const mockDeal = {
  id: 'deal-1',
  tenantId: 'test-tenant-id',
  titulo: 'Proyecto IoT TechCorp',
  descripcion: 'Implementación de sensores IoT',
  valor: 50000,
  moneda: 'EUR',
  etapa: 'negociacion',
  estado: 'activo',
  probabilidad: 60,
  prioridad: 'alta',
  leadId: 'lead-1',
  contactId: null,
  companyId: null,
  usuarioAsignadoId: 'test-user-id',
  fechaCreacion: new Date('2025-05-20T10:00:00Z'),
  fechaActualizacion: new Date('2025-05-22T14:00:00Z'),
  fechaEstimadaCierre: null,
  fechaCierre: null,
  razonPerdida: null,
  competidor: null,
  notasInternas: null,
  valorReal: null,
  descuento: null,
  tags: 'iot,tech',
  origen: 'web',
  lead: { id: 'lead-1', nombre: 'Ana García', email: 'ana@ecogreen.com', telefono: '+34 600 222 333' },
  usuarioAsignado: { id: 'test-user-id', name: 'Test User', email: 'test@test.com', image: null },
  cotizaciones: [],
  actividades: [],
  archivos: [],
  comisiones: [],
};

// ─── Helpers ───────────────────────────────────────────────────────────────

async function setupDefaultAuth() {
  (getServerSession as any).mockResolvedValue({ user: { email: 'test@test.com' } });
  (prisma.user.findUnique as any).mockResolvedValue(mockUser);
}

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/deals/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver el deal con includes', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.deal.titulo).toBe('Proyecto IoT TechCorp');
    expect(json.deal.valor).toBe(50000);
  });

  it('debe incluir lead, usuarioAsignado, cotizaciones, actividades, archivos, comisiones', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });
    const json = await response.json();

    expect(json.deal.lead).toEqual(expect.objectContaining({ nombre: 'Ana García' }));
    expect(json.deal.usuarioAsignado).toEqual(expect.objectContaining({ name: 'Test User' }));
    expect(json.deal.cotizaciones).toEqual([]);
    expect(json.deal.actividades).toEqual([]);
    expect(json.deal.archivos).toEqual([]);
    expect(json.deal.comisiones).toEqual([]);
  });

  it('debe buscar con id + tenantId para aislamiento', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);

    await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(prisma.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe incluir todas las relaciones en el include', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);

    await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(prisma.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          lead: true,
          usuarioAsignado: { select: { id: true, name: true, email: true, image: true } },
          cotizaciones: expect.objectContaining({ orderBy: { fechaCreacion: 'desc' } }),
          actividades: expect.any(Object),
          archivos: expect.any(Object),
          comisiones: expect.any(Object),
        }),
      }),
    );
  });

  it('debe devolver 404 si el deal no existe', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-nonexistent'), {
      params: { id: 'deal-nonexistent' },
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Deal no encontrado');
  });

  it('debe devolver 404 para deal de otro tenant (aislamiento)', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-other'), {
      params: { id: 'deal-other' },
    });

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al obtener deal');
  });

  it('debe serializar fechas como ISO strings', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });
    const json = await response.json();

    expect(typeof json.deal.fechaCreacion).toBe('string');
    expect(json.deal.fechaCreacion).toBe(mockDeal.fechaCreacion.toISOString());
    expect(typeof json.deal.fechaActualizacion).toBe('string');
    expect(json.deal.fechaActualizacion).toBe(mockDeal.fechaActualizacion.toISOString());
  });

  it('debe devolver 401 si no hay sesión', async () => {
    (getServerSession as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('No autenticado');
  });

  it('debe devolver 403 si el usuario no tiene tenant', async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: 'test@test.com' } });
    (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, tenantId: null });

    const response = await GET(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Usuario sin tenant');
  });
});

// ─── PATCH Tests ───────────────────────────────────────────────────────────

describe('PATCH /api/deals/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe actualizar el deal y devolver { deal }', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue({ ...mockDeal, titulo: 'Título Actualizado' });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'Título Actualizado' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.deal.titulo).toBe('Título Actualizado');
  });

  it('debe pasar campos actualizados a prisma.deal.update', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        titulo: 'Nuevo Título',
        descripcion: 'Nueva descripción',
        moneda: 'USD',
        prioridad: 'baja',
        tags: 'nuevo,test',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titulo: 'Nuevo Título',
          descripcion: 'Nueva descripción',
          moneda: 'USD',
          prioridad: 'baja',
          tags: 'nuevo,test',
          fechaUltimaActividad: expect.any(Date),
        }),
      }),
    );
  });

  it('debe incluir solo campos enviados (ignorar undefined)', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        titulo: 'Solo Título',
      }),
      { params: { id: 'deal-1' } },
    );

    const updateCallArgs = (prisma.deal.update as any).mock.calls[0][0];
    expect(updateCallArgs.data.descripcion).toBeUndefined();
    expect(updateCallArgs.data.moneda).toBeUndefined();
    expect(updateCallArgs.data.titulo).toBe('Solo Título');
  });

  it('debe parsear valor como float y probabilidad como int', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        valor: '35000.50',
        probabilidad: '75',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          valor: 35000.50,
          probabilidad: 75,
        }),
      }),
    );
  });

  it('debe parsear valorReal y descuento como float', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        valorReal: '48000',
        descuento: '2000',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          valorReal: 48000,
          descuento: 2000,
        }),
      }),
    );
  });

  it('debe manejar fechaEstimadaCierre como Date o null', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        fechaEstimadaCierre: '2025-08-01T00:00:00.000Z',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fechaEstimadaCierre: expect.any(Date),
        }),
      }),
    );

    // Probar con null para limpiar la fecha
    vi.clearAllMocks();
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        fechaEstimadaCierre: null,
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fechaEstimadaCierre: null,
        }),
      }),
    );
  });

  it('debe crear dealActivity si cambia etapa', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        etapa: 'propuesta',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.dealActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: 'deal-1',
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          tipo: 'cambio_etapa',
          titulo: 'Cambio de etapa',
          descripcion: 'Etapa cambiada de "negociacion" a "propuesta"',
        }),
      }),
    );
  });

  it('debe crear dealActivity de cierre y notificar si estado cambia a ganado', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        estado: 'ganado',
        valorReal: 48000,
      }),
      { params: { id: 'deal-1' } },
    );

    // DealActivity de cierre
    expect(prisma.dealActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'cierre',
          titulo: 'Deal ganado',
          resultado: 'ganado',
        }),
      }),
    );

    // Notificación Telegram (debe llamarse porque estado cambió a ganado)
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    expect(notifyByTelegram).toHaveBeenCalled();

    // Prisma.update debe incluir fechaCierre
    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'ganado',
          fechaCierre: expect.any(Date),
        }),
      }),
    );
  });

  it('debe crear dealActivity de cierre si estado cambia a perdido', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        estado: 'perdido',
        razonPerdida: 'Presupuesto insuficiente',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.dealActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'cierre',
          titulo: 'Deal perdido',
          resultado: 'perdido',
        }),
      }),
    );

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    expect(notifyByTelegram).toHaveBeenCalled();

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'perdido',
          razonPerdida: 'Presupuesto insuficiente',
          fechaCierre: expect.any(Date),
        }),
      }),
    );
  });

  it('NO debe crear dealActivity si etapa/estado no cambian', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', {
        descripcion: 'Solo cambio descripción',
      }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.dealActivity.create).not.toHaveBeenCalled();
  });

  it('debe incluir lead y usuarioAsignado en el resultado update', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'Test Include' }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          lead: true,
          usuarioAsignado: { select: { id: true, name: true, email: true } },
        }),
      }),
    );
  });

  it('debe crear auditLog con prisma.auditLog.create', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue({ ...mockDeal, titulo: 'Audit Test' });

    await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'Audit Test' }),
      { params: { id: 'deal-1' } },
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          accion: 'actualizar',
          entidad: 'deal',
          entidadId: 'deal-1',
          descripcion: expect.stringContaining('Audit Test'),
          cambiosAntes: mockDeal,
          cambiosDespues: expect.objectContaining({ titulo: 'Audit Test' }),
        }),
      }),
    );
  });

  it('debe continuar si notifyByTelegram falla (catch silencioso)', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    (notifyByTelegram as any).mockRejectedValueOnce(new Error('Telegram error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { estado: 'ganado' }),
      { params: { id: 'deal-1' } },
    );

    // La notificación tiene catch silencioso, la actualización se completa
    expect(response.status).toBe(200);
  });

  it('debe devolver 404 si el deal no existe', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'No Existe' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Deal no encontrado');
    expect(prisma.deal.update).not.toHaveBeenCalled();
  });

  it('debe devolver 404 para deal de otro tenant', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-other', { titulo: 'Otro Tenant' }),
      { params: { id: 'deal-other' } },
    );

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla en findFirst', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'Error' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar deal');
  });

  it('debe devolver 500 si Prisma falla en update', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'Error Update' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(500);
  });

  it('debe devolver 401 si no hay sesión', async () => {
    (getServerSession as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'No Auth' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(401);
  });

  it('debe devolver 403 si el usuario no tiene tenant', async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: 'test@test.com' } });
    (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, tenantId: null });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'No Tenant' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Usuario sin tenant');
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.update as any).mockResolvedValue(mockDeal);
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/deals/deal-1', { titulo: 'Audit Fail' }),
      { params: { id: 'deal-1' } },
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar deal');
  });
});

// ─── DELETE Tests ──────────────────────────────────────────────────────────

describe('DELETE /api/deals/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe eliminar el deal y devolver { success: true }', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.delete as any).mockResolvedValue(mockDeal);
    (prisma.auditLog.create as any).mockResolvedValue({});

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('debe llamar a prisma.deal.delete con id correcto', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.delete as any).mockResolvedValue(mockDeal);

    await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(prisma.deal.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'deal-1' } }),
    );
  });

  it('debe verificar existencia con findFirst incluyendo tenantId', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.delete as any).mockResolvedValue(mockDeal);

    await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(prisma.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe crear auditLog con accion eliminar y cambiosAntes', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.delete as any).mockResolvedValue(mockDeal);

    await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          accion: 'eliminar',
          entidad: 'deal',
          entidadId: 'deal-1',
          descripcion: expect.stringContaining('Proyecto IoT TechCorp'),
          cambiosAntes: mockDeal,
        }),
      }),
    );
  });

  it('debe devolver 404 si el deal no existe', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Deal no encontrado');
    expect(prisma.deal.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 404 para deal de otro tenant', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-other'), {
      params: { id: 'deal-other' },
    });

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla en findFirst', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar deal');
  });

  it('debe devolver 500 si Prisma falla en delete', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.delete as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar deal');
  });

  it('debe devolver 401 si no hay sesión', async () => {
    (getServerSession as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(401);
  });

  it('debe devolver 403 si el usuario no tiene tenant', async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: 'test@test.com' } });
    (prisma.user.findUnique as any).mockResolvedValue({ ...mockUser, tenantId: null });

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Usuario sin tenant');
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    await setupDefaultAuth();
    (prisma.deal.findFirst as any).mockResolvedValue(mockDeal);
    (prisma.deal.delete as any).mockResolvedValue(mockDeal);
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/deals/deal-1'), {
      params: { id: 'deal-1' },
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar deal');
  });
});
