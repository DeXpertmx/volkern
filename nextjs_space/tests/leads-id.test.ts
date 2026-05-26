import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
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

vi.mock('@/lib/audit-service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, PATCH, PUT, DELETE } from '@/app/api/leads/[id]/route';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockLead = {
  id: 'lead-1',
  tenantId: 'test-tenant-id',
  nombre: 'Juan Pérez',
  email: 'juan@techcorp.com',
  telefono: '+34 600 123 456',
  notas: 'Interesado en paneles solares',
  empresa: 'TechCorp SL',
  cargo: 'CEO',
  ubicacion: 'Madrid',
  linkedin: 'https://linkedin.com/in/juanperez',
  scoreValue: 85,
  fuente: 'web',
  estado: 'calificacion',
  contextoProyecto: 'Instalación fotovoltaica 50kW',
  metadataExterna: {},
  tokenPublico: 'mock-token-1',
  fechaCreacion: new Date('2025-05-20T10:00:00Z'),
  fechaUltimaActividad: new Date('2025-05-25T14:30:00Z'),
  citas: [
    {
      id: 'cita-1',
      fechaHora: new Date('2025-05-28T09:00:00Z'),
      servicio: { id: 'svc-1', nombre: 'Consulta solar' },
    },
  ],
  cotizaciones: [],
  contratos: [],
  deals: [],
  attachments: [],
};

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

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver el lead con todos los includes', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.nombre).toBe('Juan Pérez');
    expect(data.email).toBe('juan@techcorp.com');
  });

  it('debe incluir citas, cotizaciones, contratos, deals y attachments', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    const data = await response.json();
    expect(data.citas).toHaveLength(1);
    expect(data.citas[0].servicio.nombre).toBe('Consulta solar');
    expect(data.cotizaciones).toEqual([]);
    expect(data.contratos).toEqual([]);
    expect(data.deals).toEqual([]);
    expect(data.attachments).toEqual([]);
  });

  it('debe buscar por id y tenantId para aislamiento', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);

    await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.lead.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe auto-generar tokenPublico si no existe', async () => {
    const leadSinToken = { ...mockLead, tokenPublico: null };
    const leadConToken = { ...mockLead, tokenPublico: 'nuevo-token-uuid' };

    (prisma.lead.findUnique as any).mockResolvedValueOnce(leadSinToken);
    (prisma.lead.update as any).mockResolvedValue(leadConToken);

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.tokenPublico).toBe('nuevo-token-uuid');
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({ tokenPublico: expect.any(String) }),
      }),
    );
  });

  it('debe devolver 404 si el lead no existe', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-999'),
      { params: { id: 'lead-999' } },
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Lead no encontrado');
  });

  it('debe devolver 404 si el lead no pertenece al tenant (tenant isolation)', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-other'),
      { params: { id: 'lead-other' } },
    );

    expect(response.status).toBe(404);
    expect(prisma.lead.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-other', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.lead.findUnique as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al obtener lead');
  });

  it('debe devolver 401 si authenticateRequest falla', async () => {
    (authenticateRequest as any).mockResolvedValueOnce({ valid: false });

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('No autorizado');
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
  });

  it('debe serializar fechas como ISO strings en la respuesta', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);

    const response = await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    const data = await response.json();
    expect(typeof data.fechaCreacion).toBe('string');
    expect(data.fechaCreacion).toBe(mockLead.fechaCreacion.toISOString());
    expect(typeof data.fechaUltimaActividad).toBe('string');
    expect(data.fechaUltimaActividad).toBe(mockLead.fechaUltimaActividad.toISOString());
  });

  it('NO debe generar tokenPublico si ya existe', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);

    await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    // findUnique se llama, pero update NO debe llamarse porque tokenPublico ya existe
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('debe pasar el id correcto desde params', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);

    await GET(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.lead.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'lead-1' }),
      }),
    );
  });
});

// ─── PATCH Tests ───────────────────────────────────────────────────────────

describe('PATCH /api/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe actualizar lead y devolver success con lead', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue({
      ...mockLead,
      nombre: 'Juan Actualizado',
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Juan Actualizado',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.lead.nombre).toBe('Juan Actualizado');
  });

  it('debe pasar los campos actualizados a prisma.lead.update', async () => {
    const actualizacion = {
      nombre: 'Nuevo Nombre',
      email: 'nuevo@email.com',
      telefono: '+34 600 999 999',
      empresa: 'Nueva Empresa SL',
      estado: 'calificacion',
      scoreValue: 90,
      notas: 'Nota actualizada',
      contextoProyecto: 'Nuevo contexto',
      tags: 'solar,industrial',
      origen: 'web',
      ciudad: 'Madrid',
      pais: 'España',
    };

    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue({
      ...mockLead,
      ...actualizacion,
    });

    await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', actualizacion),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining(actualizacion),
      }),
    );
  });

  it('debe actualizar fechaUltimaActividad con la fecha actual', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue({
      ...mockLead,
      nombre: 'Test',
    });

    const before = Date.now();

    await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Test',
      }),
      { params: { id: 'lead-1' } },
    );

    const callData = (prisma.lead.update as any).mock.calls[0][0].data;
    const fechaUpdate = callData.fechaUltimaActividad.getTime();
    expect(fechaUpdate).toBeGreaterThanOrEqual(before);
    expect(fechaUpdate).toBeLessThanOrEqual(Date.now());
  });

  it('debe incluir solo campos enviados (ignorar undefined)', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue(mockLead);

    await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Solo Nombre',
      }),
      { params: { id: 'lead-1' } },
    );

    const data = (prisma.lead.update as any).mock.calls[0][0].data;
    // El campo enviado debe estar
    expect(data.nombre).toBe('Solo Nombre');
    // Los no enviados NO deben aparecer en data
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('estado');
    expect(data).not.toHaveProperty('scoreValue');
  });

  it('debe llamar a AuditService.log tras actualizar', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue({
      ...mockLead,
      nombre: 'Audit Test',
    });

    const { AuditService } = await import('@/lib/audit-service');

    await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Audit Test',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        action: 'UPDATE',
        entity: 'Lead',
        entityId: 'lead-1',
      }),
    );
  });

  it('debe devolver 404 si el lead no existe', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-999', {
        nombre: 'Test',
      }),
      { params: { id: 'lead-999' } },
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Lead no encontrado');
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('debe devolver 404 si el lead no pertenece al tenant', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-other', {
        nombre: 'Test',
      }),
      { params: { id: 'lead-other' } },
    );

    expect(response.status).toBe(404);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma falla en findUnique', async () => {
    (prisma.lead.findUnique as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Test',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al actualizar lead');
  });

  it('debe devolver 500 si Prisma falla en update', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockRejectedValue(new Error('Update error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Test',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
  });

  it('debe devolver 401 si authenticateRequest falla', async () => {
    (authenticateRequest as any).mockResolvedValueOnce({ valid: false });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Test',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('No autorizado');
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
  });

  it('debe pasar metadataExterna si se envía', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue(mockLead);

    await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        metadataExterna: { source: 'apollo', externalId: 'ext-123' },
      }),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadataExterna: { source: 'apollo', externalId: 'ext-123' },
        }),
      }),
    );
  });

  it('debe funcionar igual con PUT (mismo handler interno)', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue({
      ...mockLead,
      nombre: 'Put Test',
    });

    const response = await PUT(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Put Test',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.lead.nombre).toBe('Put Test');
  });

  it('debe devolver 500 si AuditService.log falla (no hay catch silencioso)', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.update as any).mockResolvedValue({
      ...mockLead,
      nombre: 'Audit Fail Test',
    });

    const { AuditService } = await import('@/lib/audit-service');
    (AuditService.log as any).mockRejectedValueOnce(new Error('Audit DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/leads/lead-1', {
        nombre: 'Audit Fail Test',
      }),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al actualizar lead');
  });
});

// ─── DELETE Tests ──────────────────────────────────────────────────────────

describe('DELETE /api/leads/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe eliminar lead y devolver success con message', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe('Lead eliminado correctamente');
  });

  it('debe llamar a prisma.lead.delete con el id correcto', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);

    await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.lead.delete).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
    });
  });

  it('debe verificar existencia con findUnique + tenantId antes de eliminar', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);

    await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.lead.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe crear auditLog con datos correctos tras eliminar', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);

    await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        accion: 'DELETE',
        entidad: 'Lead',
        entidadId: 'lead-1',
        descripcion: expect.stringContaining('Lead eliminado'),
        cambiosAntes: expect.stringContaining('Juan Pérez'),
      }),
    });
  });

  it('debe incluir nombre y email del lead en cambiosAntes del auditLog', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);

    await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cambiosAntes: JSON.stringify({
          nombre: 'Juan Pérez',
          email: 'juan@techcorp.com',
        }),
      }),
    });
  });

  it('debe devolver 404 si el lead no existe', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-999'),
      { params: { id: 'lead-999' } },
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Lead no encontrado');
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 404 si el lead no pertenece al tenant', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-other'),
      { params: { id: 'lead-other' } },
    );

    expect(response.status).toBe(404);
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma falla en findUnique', async () => {
    (prisma.lead.findUnique as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al eliminar lead');
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma falla en delete', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockRejectedValue(new Error('Delete error'));

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al eliminar lead');
  });

  it('debe devolver 401 si authenticateRequest falla', async () => {
    (authenticateRequest as any).mockResolvedValueOnce({ valid: false });

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('No autorizado');
    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit log error'));

    const response = await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al eliminar lead');
  });

  it('debe usar el scope leads:delete para autenticación', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(mockLead);
    (prisma.lead.delete as any).mockResolvedValue(mockLead);

    await DELETE(
      mockRequest('https://volkern.app/api/leads/lead-1'),
      { params: { id: 'lead-1' } },
    );

    expect(authenticateRequest).toHaveBeenCalledWith(expect.any(Request), ['leads:delete']);
  });
});
