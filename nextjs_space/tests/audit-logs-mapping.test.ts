import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ─── Hoisted mock refs (vi.hoisted para evitar ReferenceError) ───────────── */

const { mockGetServerSession, mockHasPermission, mockFindUnique, mockFindMany } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockHasPermission: vi.fn(() => true),
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
}));

/* ─── Mocks ───────────────────────────────────────────────────────────────── */

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
    auditLog: { findMany: mockFindMany },
  },
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
  default: { getServerSession: mockGetServerSession },
}));

vi.mock('@/lib/permissions', () => ({
  hasPermission: mockHasPermission,
}));

/* ─── Imports ─────────────────────────────────────────────────────────────── */

import { GET } from '@/app/api/audit-logs/route';

/* ─── Fixtures ────────────────────────────────────────────────────────────── */

const mockUser = {
  id: 'user-1',
  email: 'admin@volkern.com',
  name: 'Admin',
  tenantId: 'tenant-1',
  role: { nombre: 'Admin', permisos: {} },
};

const mockSpanishLogs = [
  {
    id: 'log-1',
    accion: 'crear',
    entidad: 'deal',
    entidadId: 'deal-1',
    descripcion: 'Usuario creó deal "Venta grande"',
    fechaCreacion: new Date('2025-06-10T10:00:00Z'),
    ipAddress: '192.168.1.1',
    metadata: { source: 'api' },
    userId: 'user-1',
    tenantId: 'tenant-1',
    user: { id: 'user-1', name: 'Admin', email: 'admin@volkern.com' },
  },
  {
    id: 'log-2',
    accion: 'actualizar',
    entidad: 'contrato',
    entidadId: 'contrato-1',
    descripcion: 'Contrato actualizado',
    fechaCreacion: new Date('2025-06-09T15:30:00Z'),
    ipAddress: null,
    metadata: {},
    userId: 'user-2',
    tenantId: 'tenant-1',
    user: { id: 'user-2', name: 'Manager', email: 'manager@volkern.com' },
  },
  {
    id: 'log-3',
    accion: 'eliminar',
    entidad: 'contact',
    entidadId: 'contact-1',
    descripcion: 'Contacto eliminado',
    fechaCreacion: new Date('2025-06-08T08:00:00Z'),
    ipAddress: null,
    metadata: null,
    userId: 'user-1',
    tenantId: 'tenant-1',
    user: null,
  },
];

function mockRequest(url = 'https://volkern.app/api/audit-logs'): Request {
  return new Request(url);
}

function mockAuthenticatedSession() {
  mockGetServerSession.mockResolvedValue({
    user: { id: 'user-1', email: 'admin@volkern.com', name: 'Admin' },
  });
}

function mockNoSession() {
  mockGetServerSession.mockResolvedValue(null);
}

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('GET /api/audit-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(true);
  });

  /* ─── Campo mapeado: action (no accion) ─── */
  describe('Campo mapeado: action ← accion', () => {
    it('debe devolver "action" (inglés), no "accion" (español)', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(data.logs).toHaveLength(3);
      for (const log of data.logs) {
        expect(log).toHaveProperty('action');
        expect(typeof log.action).toBe('string');
        expect(log).not.toHaveProperty('accion');
      }

      expect(data.logs[0].action).toBe('crear');
      expect(data.logs[1].action).toBe('actualizar');
      expect(data.logs[2].action).toBe('eliminar');
    });
  });

  /* ─── Campo mapeado: entity (no entidad) ─── */
  describe('Campo mapeado: entity ← entidad', () => {
    it('debe devolver "entity" (inglés), no "entidad" (español)', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      for (const log of data.logs) {
        expect(log).toHaveProperty('entity');
        expect(typeof log.entity).toBe('string');
        expect(log).not.toHaveProperty('entidad');
      }

      expect(data.logs[0].entity).toBe('deal');
      expect(data.logs[1].entity).toBe('contrato');
      expect(data.logs[2].entity).toBe('contact');
    });
  });

  /* ─── Campo mapeado: entityId (no entidadId) ─── */
  describe('Campo mapeado: entityId ← entidadId', () => {
    it('debe devolver "entityId" (inglés), no "entidadId" (español)', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      for (const log of data.logs) {
        expect(log).toHaveProperty('entityId');
        expect(typeof log.entityId).toBe('string');
        expect(log).not.toHaveProperty('entidadId');
      }

      expect(data.logs[0].entityId).toBe('deal-1');
      expect(data.logs[1].entityId).toBe('contrato-1');
      expect(data.logs[2].entityId).toBe('contact-1');
    });
  });

  /* ─── Campo mapeado: description (no descripcion) ─── */
  describe('Campo mapeado: description ← descripcion', () => {
    it('debe devolver "description" (inglés), no "descripcion" (español)', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      for (const log of data.logs) {
        expect(log).toHaveProperty('description');
        expect(typeof log.description).toBe('string');
        expect(log).not.toHaveProperty('descripcion');
      }

      expect(data.logs[0].description).toBe('Usuario creó deal "Venta grande"');
    });
  });

  /* ─── Campo mapeado: createdAt (no fechaCreacion) ─── */
  describe('Campo mapeado: createdAt ← fechaCreacion', () => {
    it('debe devolver "createdAt" (inglés), no "fechaCreacion" (español)', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      for (const log of data.logs) {
        expect(log).toHaveProperty('createdAt');
        expect(typeof log.createdAt).toBe('string');
        expect(log).not.toHaveProperty('fechaCreacion');
      }

      expect(data.logs[0].createdAt).toBe('2025-06-10T10:00:00.000Z');
      expect(data.logs[1].createdAt).toBe('2025-06-09T15:30:00.000Z');
    });
  });

  /* ─── Todos los campos mapeados juntos ─── */
  describe('Mapeo completo de la respuesta', () => {
    it('debe incluir todos los campos mapeados y ninguno en español', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(data.logs).toHaveLength(3);

      const firstLog = data.logs[0];
      // entityId (con 'y') = inglés; entidadId (con 'd') = español
      const expectedEnglishKeys = [
        'id', 'action', 'entity', 'entityId', 'description',
        'createdAt', 'ipAddress', 'metadata', 'userId', 'tenantId', 'user',
      ];
      const forbiddenSpanishKeys = [
        'accion', 'entidad', 'entidadId', 'descripcion', 'fechaCreacion',
      ];

      for (const key of expectedEnglishKeys) {
        expect(firstLog).toHaveProperty(key);
      }
      for (const key of forbiddenSpanishKeys) {
        expect(firstLog).not.toHaveProperty(key);
      }
    });

    it('debe preservar campos que no requieren traducción', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(data.logs[0].id).toBe('log-1');
      expect(data.logs[0].ipAddress).toBe('192.168.1.1');
      expect(data.logs[0].metadata).toEqual({ source: 'api' });
      expect(data.logs[0].userId).toBe('user-1');
      expect(data.logs[0].tenantId).toBe('tenant-1');
      expect(data.logs[0].user).toEqual({
        id: 'user-1',
        name: 'Admin',
        email: 'admin@volkern.com',
      });
    });
  });

  /* ─── Autenticación ─── */
  describe('Autenticación', () => {
    it('debe devolver 401 si no hay sesión', async () => {
      mockNoSession();

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('No autorizado');
    });

    it('debe devolver 404 si el usuario no existe en BD', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'ghost', email: 'ghost@volkern.com' },
      });
      mockFindUnique.mockResolvedValue(null);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Usuario no encontrado');
    });

    it('debe devolver 403 si el usuario no tiene permiso', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockHasPermission.mockReturnValue(false);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Sin permiso para ver logs');
    });
  });

  /* ─── Filtrado y paginación ─── */
  describe('Filtrado y paginación', () => {
    it('debe filtrar por entityId cuando se pasa el parámetro', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([mockSpanishLogs[0]]);

      await GET(mockRequest('https://volkern.app/api/audit-logs?entityId=deal-1'));

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            entidadId: 'deal-1',
          }),
        })
      );
    });

    it('debe filtrar por entity cuando se pasa el parámetro', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([mockSpanishLogs[0]]);

      await GET(mockRequest('https://volkern.app/api/audit-logs?entity=deal'));

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            entidad: 'deal',
          }),
        })
      );
    });

    it('debe respetar el límite pasado como parámetro', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs.slice(0, 2));

      await GET(mockRequest('https://volkern.app/api/audit-logs?limit=2'));

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 })
      );
    });

    it('debe usar limit=50 por defecto si no se pasa', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      await GET(mockRequest());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });
  });

  /* ─── Edge cases ─── */
  describe('Edge cases', () => {
    it('debe devolver array vacío si no hay logs', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([]);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.logs).toEqual([]);
    });

    it('debe devolver 500 si Prisma lanza error', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockRejectedValue(new Error('DB error'));

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Error al obtener logs');
    });

    it('debe manejar logs con user null (sin usuario asociado)', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([mockSpanishLogs[2]]);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(data.logs).toHaveLength(1);
      expect(data.logs[0].user).toBeNull();
      expect(data.logs[0].action).toBe('eliminar');
    });

    it('debe manejar valores null en ipAddress y metadata', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([mockSpanishLogs[2]]);

      const response = await GET(mockRequest());
      const data = await response.json();

      expect(data.logs[0].ipAddress).toBeNull();
      expect(data.logs[0].metadata).toBeNull();
    });

    it('debe ordenar por fechaCreacion descendente', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      await GET(mockRequest());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { fechaCreacion: 'desc' },
        })
      );
    });

    it('debe incluir datos del usuario en el include de Prisma', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue(mockSpanishLogs);

      await GET(mockRequest());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      );
    });

    it('debe permitir múltiples filtros simultáneos', async () => {
      mockAuthenticatedSession();
      mockFindUnique.mockResolvedValue(mockUser);
      mockFindMany.mockResolvedValue([mockSpanishLogs[0]]);

      await GET(mockRequest(
        'https://volkern.app/api/audit-logs?entityId=deal-1&entity=deal&limit=10'
      ));

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            entidadId: 'deal-1',
            entidad: 'deal',
          }),
          take: 10,
        })
      );
    });
  });
});
