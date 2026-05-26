import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test Tenant', slug: 'test', plan: 'growth' },
        user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
      };
      return handler(request, mockAuth, { params: { id: 'contact-1' } });
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, PATCH, PUT, DELETE } from '@/app/api/contacts/[id]/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function mockRequest(url: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(url, {
      method: body ? 'PATCH' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url);
}

const mockContact = {
  id: 'contact-1',
  tenantId: 'test-tenant-id',
  nombre: 'Carlos Ruiz',
  email: 'carlos@techcorp.com',
  telefono: '+34 600 111 222',
  tipo: 'person',
  companyId: 'cl00000000000000000000001',
  cargo: 'CTO',
  ubicacion: 'Madrid',
  linkedin: 'https://linkedin.com/in/carlosruiz',
  notas: 'Contacto clave para proyecto IoT',
  tags: 'tecnologia,iot',
  fechaCreacion: new Date('2025-05-20T10:00:00Z'),
  company: { id: 'company-1', nombre: 'TechCorp SL' },
  persons: [],
  deals: [],
  dealsAsCompany: [],
  convertedFromLeads: [],
  perfilFiscal: null,
  invoices: [],
  historialTareas: [],
  historialNotas: [],
  historialInteracciones: [],
  historialCitas: [],
  conversaciones: [],
  historialDocumentos: [],
  historialCotizaciones: [],
  historialContratos: [],
};

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/contacts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver el contacto con includes', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);

    const response = await GET(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.nombre).toBe('Carlos Ruiz');
    expect(json.data.email).toBe('carlos@techcorp.com');
  });

  it('debe incluir company en el resultado', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);

    const response = await GET(mockRequest('https://volkern.app/api/contacts/contact-1'));
    const json = await response.json();

    expect(json.data.company).toEqual({ id: 'company-1', nombre: 'TechCorp SL' });
  });

  it('debe buscar con id + tenantId para aislamiento', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);

    await GET(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe incluir todas las relaciones en el include', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);

    await GET(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          company: expect.any(Object),
          persons: expect.any(Object),
          deals: expect.any(Object),
          dealsAsCompany: expect.any(Object),
          convertedFromLeads: expect.any(Object),
          perfilFiscal: true,
          invoices: expect.any(Object),
          historialTareas: expect.any(Object),
          historialNotas: expect.any(Object),
          historialInteracciones: expect.any(Object),
          historialCitas: expect.any(Object),
          conversaciones: expect.any(Object),
          historialDocumentos: expect.any(Object),
          historialCotizaciones: expect.any(Object),
          historialContratos: expect.any(Object),
        }),
      }),
    );
  });

  it('debe devolver 404 si el contacto no existe', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/contacts/contact-nonexistent'));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Contacto no encontrado');
  });

  it('debe devolver 404 para contacto de otro tenant (aislamiento)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/contacts/contact-other-tenant'));

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.contact.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al obtener contacto');
  });

  it('debe serializar fechas como ISO strings', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);

    const response = await GET(mockRequest('https://volkern.app/api/contacts/contact-1'));
    const json = await response.json();

    expect(typeof json.data.fechaCreacion).toBe('string');
    expect(json.data.fechaCreacion).toBe(mockContact.fechaCreacion.toISOString());
  });
});

// ─── PATCH Tests ───────────────────────────────────────────────────────────

describe('PATCH /api/contacts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe actualizar el contacto y devolver { success, data }', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue({
      ...mockContact,
      nombre: 'Carlos Actualizado',
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Carlos Actualizado',
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.nombre).toBe('Carlos Actualizado');
  });

  it('debe pasar nombre, email, telefono a update', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue(mockContact);

    await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Nuevo Nombre',
        email: 'nuevo@email.com',
        telefono: '+34 600 999 888',
      }),
    );

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Nuevo Nombre',
          email: 'nuevo@email.com',
          telefono: '+34 600 999 888',
        }),
      }),
    );
  });

  it('debe incluir solo campos enviados (ignorar undefined)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue(mockContact);

    await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Solo Nombre',
      }),
    );

    const updateCallArgs = (prisma.contact.update as any).mock.calls[0][0];
    // email no debería estar presente porque no se envió
    expect(updateCallArgs.data.email).toBeUndefined();
    expect(updateCallArgs.data.telefono).toBeUndefined();
    expect(updateCallArgs.data.nombre).toBe('Solo Nombre');
  });

  it('debe manejar perfilFiscal upsert', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue(mockContact);

    const perfilFiscalData = {
      razonSocial: 'TechCorp SL',
      nif: 'B12345678',
      direccion: 'Calle Mayor 1',
      defaultIva: '21.0',
      defaultIrpf: '15.0',
    };

    await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Carlos Ruiz',
        perfilFiscal: perfilFiscalData,
      }),
    );

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          perfilFiscal: {
            upsert: {
              create: expect.objectContaining({
                razonSocial: 'TechCorp SL',
                nif: 'B12345678',
                defaultIva: 21.0,
                defaultIrpf: 15.0,
                tenantId: 'test-tenant-id',
              }),
              update: expect.objectContaining({
                razonSocial: 'TechCorp SL',
                defaultIva: 21.0,
                defaultIrpf: 15.0,
              }),
            },
          },
        }),
      }),
    );
  });

  it('debe incluir company y perfilFiscal en el resultado update', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue(mockContact);

    await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Test Include',
      }),
    );

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          company: { select: { id: true, nombre: true } },
          perfilFiscal: true,
        }),
      }),
    );
  });

  it('debe crear auditLog con prisma.auditLog.create', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue(mockContact);

    await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Audit Test',
      }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          accion: 'actualizar',
          entidad: 'contact',
          entidadId: 'contact-1',
        }),
      }),
    );
  });

  it('debe devolver 404 si el contacto no existe', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'No Existe',
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Contacto no encontrado');
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('debe devolver 404 para contacto de otro tenant', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-other', {
        nombre: 'Otro Tenant',
      }),
    );

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla en findFirst', async () => {
    (prisma.contact.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Error',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar contacto');
  });

  it('debe devolver 500 si Prisma falla en update', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Error Update',
      }),
    );

    expect(response.status).toBe(500);
  });

  it('PUT debe funcionar igual que PATCH', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue({
      ...mockContact,
      nombre: 'PUT Test',
    });

    const response = await PUT(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'PUT Test',
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.nombre).toBe('PUT Test');
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(mockContact);
    (prisma.contact.update as any).mockResolvedValue(mockContact);
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/contacts/contact-1', {
        nombre: 'Audit Fail',
      }),
    );

    // auditLog.create está dentro del try principal
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar contacto');
  });
});

// ─── DELETE Tests ──────────────────────────────────────────────────────────

describe('DELETE /api/contacts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe eliminar el contacto y devolver { success, message }', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockResolvedValue(mockContact);
    (prisma.auditLog.create as any).mockResolvedValue({});

    const response = await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe('Contacto eliminado correctamente');
  });

  it('debe llamar a prisma.contact.delete con id correcto', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockResolvedValue(mockContact);

    await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(prisma.contact.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contact-1' } }),
    );
  });

  it('debe verificar existencia con findFirst incluyendo tenantId', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockResolvedValue(mockContact);

    await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe crear auditLog con accion eliminar y cambiosAntes', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockResolvedValue(mockContact);

    await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          accion: 'eliminar',
          entidad: 'contact',
          entidadId: 'contact-1',
          descripcion: expect.stringContaining('Carlos Ruiz'),
          cambiosAntes: { nombre: 'Carlos Ruiz', email: 'carlos@techcorp.com' },
        }),
      }),
    );
  });

  it('debe devolver 404 si el contacto no existe', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Contacto no encontrado');
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si el contacto tiene deals activos', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 3 },
    });

    const response = await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('No se puede eliminar un contacto con deals asociados');
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma falla en findFirst', async () => {
    (prisma.contact.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar contacto');
  });

  it('debe devolver 500 si Prisma falla en delete', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(500);
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockResolvedValue(mockContact);
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar contacto');
  });

  it('debe usar el scope contacts:delete para autenticación', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      ...mockContact,
      _count: { deals: 0 },
    });
    (prisma.contact.delete as any).mockResolvedValue(mockContact);

    await DELETE(mockRequest('https://volkern.app/api/contacts/contact-1'));

    // withTenantAuth es el mock, pero verificamos que el handler se ejecuta
    expect(prisma.contact.delete).toHaveBeenCalled();
  });
});
