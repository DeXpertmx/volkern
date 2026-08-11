import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    configuracion: {
      findMany: vi.fn(),
      upsert: vi.fn(),
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
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

vi.mock('@/lib/s3', () => ({
  getDownloadUrl: vi.fn().mockResolvedValue('https://signed-url.example.com/logo.png'),
}));

vi.mock('@/lib/audit-service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/configuracion/route';
import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/audit-service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(url: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url);
}

// ─── POST /api/configuracion — Filtro de claves basura ─────────────────────

describe('POST /api/configuracion — filtro de claves basura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.configuracion.upsert as any).mockResolvedValue({ id: 'cfg-1' });
    // Por defecto no existen claves previas (es un alta)
    (prisma.configuracion.findMany as any).mockResolvedValue([]);
  });

  it('NO debe persistir la clave interna _tenantId', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        _tenantId: 'test-tenant-id',
        business_name: 'Mi Empresa',
      }),
    );

    expect(response.status).toBe(200);
    // Upsert solo se llama con claves legítimas
    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0][0].where.tenantId_clave.clave).toBe('business_name');
    expect(llamadas[0][0].where.tenantId_clave.clave).not.toBe('_tenantId');
  });

  it('debe descartar la clave data suelta junto a otras claves (unwrap no aplica)', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        data: { smtp_host: 'smtp.legacy.com' },
        timezone: 'Europe/Madrid',
      }),
    );

    expect(response.status).toBe(200);
    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    const claves = llamadas.map((c: any) => c[0].where.tenantId_clave.clave);
    expect(claves).not.toContain('data');
    expect(claves).toContain('timezone');
  });

  it('NO debe persistir NINGUNA clave con prefijo _', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        _a: '1',
        _b: '2',
        horariosAtencion: { lunes: { activo: true, rangos: [] } },
      }),
    );

    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    const claves = llamadas.map((c: any) => c[0].where.tenantId_clave.clave);
    expect(claves).toEqual(['horariosAtencion']);
  });

  it('debe desempaquetar el wrapper {section, data} y guardar los campos internos', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        section: 'email',
        data: { smtp_host: 'smtp.larksuite.com', smtp_enabled: true },
      }),
    );

    expect(response.status).toBe(200);
    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    const claves = llamadas.map((c: any) => c[0].where.tenantId_clave.clave);
    expect(claves).toEqual(['smtp_host', 'smtp_enabled']);
    // Los booleans se guardan como string (igual que el valor original)
    expect(llamadas[1][0].create.valor).toBe('true');
  });

  it('debe desempaquetar {data} suelto (compat legacy sin section)', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        data: { defaultCurrency: 'EUR', portalEnabled: true },
      }),
    );

    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    const claves = llamadas.map((c: any) => c[0].where.tenantId_clave.clave);
    expect(claves).toEqual(['defaultCurrency', 'portalEnabled']);
  });

  it('debe serializar objetos como JSON (arrays y horarios)', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        exportFormats: ['xml', 'csv'],
        horariosAtencion: { lunes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] } },
      }),
    );

    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    const exportCall = llamadas.find((c: any) => c[0].where.tenantId_clave.clave === 'exportFormats');
    const horCall = llamadas.find((c: any) => c[0].where.tenantId_clave.clave === 'horariosAtencion');
    expect(JSON.parse(exportCall[0].create.valor)).toEqual(['xml', 'csv']);
    expect(JSON.parse(horCall[0].create.valor).lunes.rangos[0].inicio).toBe('09:00');
  });

  it('debe persistir smtp_enabled=false como string "false" (no descartar falsy)', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        section: 'email',
        data: { smtp_enabled: false },
      }),
    );

    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0][0].create.valor).toBe('false');
  });

  it('debe extraer la S3 key de una URL firmada de logo_corporativo', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        logo_corporativo: 'https://s3.amazonaws.com/volkern-tenant-1/public/catalogo/logo.png?X-Amz-Signature=abc123',
      }),
    );

    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0][0].create.valor).toBe('volkern-tenant-1/public/catalogo/logo.png');
  });

  it('debe usar tenantId del auth en create y where', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'Mi Empresa',
      }),
    );

    const llamada = (prisma.configuracion.upsert as any).mock.calls[0][0];
    expect(llamada.where.tenantId_clave.tenantId).toBe('test-tenant-id');
    expect(llamada.create.tenantId).toBe('test-tenant-id');
  });

  it('debe ignorar valores null/undefined', async () => {
    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'OK',
        logo_corporativo: null,
      }),
    );

    const llamadas = (prisma.configuracion.upsert as any).mock.calls;
    const claves = llamadas.map((c: any) => c[0].where.tenantId_clave.clave);
    expect(claves).toEqual(['business_name']);
  });

  it('debe devolver 200 success en guardado correcto', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        timezone: 'Europe/Madrid',
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.configuracion.upsert as any).mockRejectedValueOnce(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'Error Test',
      }),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al guardar configuración');
  });
});

// ─── POST /api/configuracion — Historial de cambios (auditoría) ─────────────

describe('POST /api/configuracion — historial de cambios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.configuracion.upsert as any).mockResolvedValue({ id: 'cfg-1' });
  });

  it('debe registrar en el historial un cambio de valor (antes → después)', async () => {
    // Existe un valor previo distinto (los strings se guardan SIN comillas JSON)
    (prisma.configuracion.findMany as any).mockResolvedValue([
      { clave: 'business_name', valor: 'Empresa Antigua' },
    ]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'Empresa Nueva',
      }),
    );

    expect(AuditService.log).toHaveBeenCalledTimes(1);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        action: 'actualizar_configuracion',
        entity: 'configuracion',
        entityId: 'business_name',
        description: expect.stringContaining('business_name'),
        changesBefore: { business_name: 'Empresa Antigua' },
        changesAfter: { business_name: 'Empresa Nueva' },
      }),
    );
  });

  it('debe registrar como null en changesBefore si la clave no existía (alta)', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        timezone: 'Europe/Madrid',
      }),
    );

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'timezone',
        changesBefore: null,
        changesAfter: { timezone: 'Europe/Madrid' },
      }),
    );
  });

  it('NO debe registrar si el valor no cambió', async () => {
    // Los strings se guardan sin comillas JSON: mismo valor que llega → sin cambio
    (prisma.configuracion.findMany as any).mockResolvedValue([
      { clave: 'timezone', valor: 'Europe/Madrid' },
    ]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        timezone: 'Europe/Madrid',
      }),
    );

    expect(AuditService.log).not.toHaveBeenCalled();
  });

  it('NO debe registrar si solo llegan claves basura (_tenantId, data)', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        _tenantId: 'basura',
        data: { smtp_host: 'x' },
      }),
    );

    expect(AuditService.log).not.toHaveBeenCalled();
  });

  it('debe registrar un historial por cada clave cambiada', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'A',
        timezone: 'UTC',
      }),
    );

    expect(AuditService.log).toHaveBeenCalledTimes(2);
    const entityIds = (AuditService.log as any).mock.calls.map((c: any) => c[0].entityId);
    expect(entityIds).toEqual(['business_name', 'timezone']);
  });

  it('debe enmascarar secretos (password) en el historial', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        section: 'email',
        data: { smtp_password: 'MiContraseñaSecreta', smtp_host: 'smtp.example.com' },
      }),
    );

    expect(AuditService.log).toHaveBeenCalledTimes(2);
    const calls = (AuditService.log as any).mock.calls;
    const passwordCall = calls.find((c: any) => c[0].entityId === 'smtp_password');
    const hostCall = calls.find((c: any) => c[0].entityId === 'smtp_host');
    // El password NUNCA queda en claro
    expect(JSON.stringify(passwordCall[0])).not.toContain('MiContraseñaSecreta');
    expect(passwordCall[0].changesAfter).toEqual({ smtp_password: '[REDACTED]' });
    // La clave normal sí registra su valor
    expect(hostCall[0].changesAfter).toEqual({ smtp_host: 'smtp.example.com' });
  });

  it('debe seguir guardando aunque la auditoría falle (try/catch)', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([]);
    (AuditService.log as any).mockRejectedValueOnce(new Error('audit boom'));

    const response = await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'Sin Auditoría',
      }),
    );

    // El guardado NO debe fallar aunque el historial falle
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('debe leer las claves existentes con findMany para comparar', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([]);

    await POST(
      mockRequest('https://volkern.app/api/configuracion', {
        business_name: 'A',
      }),
    );

    expect(prisma.configuracion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'test-tenant-id',
          clave: { in: ['business_name'] },
        }),
      }),
    );
  });
});

// ─── GET /api/configuracion ────────────────────────────────────────────────

describe('GET /api/configuracion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver la config como objeto clave→valor', async () => {
    (prisma.configuracion.findMany as any).mockResolvedValue([
      { clave: 'business_name', valor: '"Mi Empresa"' },
      { clave: 'timezone', valor: '"Europe/Madrid"' },
    ]);

    const response = await GET(mockRequest('https://volkern.app/api/configuracion'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.business_name).toBe('Mi Empresa');
    expect(data.timezone).toBe('Europe/Madrid');
    // El tenantId se agrega como _tenantId para los códigos de embed
    expect(data._tenantId).toBe('test-tenant-id');
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.configuracion.findMany as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/configuracion'));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al obtener configuración');
  });
});
