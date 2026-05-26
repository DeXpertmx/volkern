import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    lead: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    note: {
      create: vi.fn(),
    },
  },
}));

// Mock withTenantAuth para evitar autenticación real
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

// Mocks para dependencias externas usadas en el POST handler
vi.mock('@/lib/limits', () => ({
  validateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/subscription', () => ({
  checkFeatureLimit: vi.fn().mockResolvedValue({ current: 0, limit: -1, allowed: true }),
  incrementUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/scoring-engine', () => ({
  ScoringEngine: {
    recalculateLeadScore: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/automation-engine', () => ({
  triggerAutomation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email', () => ({
  sendNewLeadNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/skills/context', () => ({
  SkillContext: class MockSkillContext {
    constructor(data: any) { Object.assign(this, data); }
    get tenantId() { return 'test-tenant-id'; }
    toJSON() { return { tenantId: 'test-tenant-id' }; }
    toLogContext() { return { tenantId: 'test-tenant-id' }; }
    hasPermission() { return true; }
  },
  createSystemContext: vi.fn().mockReturnValue({ tenantId: 'test-tenant-id' }),
}));

vi.mock('@/lib/leads/assignment', () => ({
  assignLeadAutomatically: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/telemetry/adoption-kpis', () => ({
  AdoptionTelemetry: {
    trackHubView: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: vi.fn().mockResolvedValue({ success: true, channel: 'telegram', status: 'sent' }),
  notifyByEmail: vi.fn().mockResolvedValue({ success: true, channel: 'email', status: 'sent' }),
  notifyByWhatsApp: vi.fn().mockResolvedValue({ success: true, channel: 'whatsapp', status: 'sent' }),
  notifyUser: vi.fn().mockResolvedValue({ success: true, channel: 'in_app', status: 'sent' }),
  notificationService: {
    send: vi.fn().mockResolvedValue({ success: true, status: 'sent' }),
    sendBulk: vi.fn().mockResolvedValue([]),
    sendMultiChannel: vi.fn().mockResolvedValue({}),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/leads/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockLeads = [
  {
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
    fechaCreacion: new Date('2025-05-20'),
    fechaUltimaActividad: new Date('2025-05-25'),
    citas: [
      {
        id: 'cita-1',
        fecha: new Date('2025-05-28'),
        servicio: { id: 'svc-1', nombre: 'Consulta solar' },
      },
    ],
    asignadoUsuario: {
      id: 'user-2',
      name: 'Ana Vendedora',
      email: 'ana@test.com',
    },
    score: {
      id: 'score-1',
      total: 85,
      categoria: 'Caliente',
    },
  },
  {
    id: 'lead-2',
    tenantId: 'test-tenant-id',
    nombre: 'María López',
    email: 'maria@ecogreen.com',
    telefono: '+34 610 987 654',
    notas: null,
    empresa: 'EcoGreen Solutions',
    cargo: 'Directora',
    ubicacion: 'Barcelona',
    linkedin: null,
    scoreValue: 45,
    fuente: 'recomendacion',
    estado: 'nuevo',
    contextoProyecto: null,
    metadataExterna: {},
    tokenPublico: 'mock-token-2',
    fechaCreacion: new Date('2025-05-22'),
    fechaUltimaActividad: new Date('2025-05-22'),
    citas: [],
    asignadoUsuario: null,
    score: null,
  },
];

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

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe listar todos los leads del tenant con includes', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    const response = await GET(mockRequest('https://volkern.app/api/leads'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data[0].nombre).toBe('Juan Pérez');
    expect(data[1].nombre).toBe('María López');
  });

  it('debe incluir citas, asignadoUsuario y score en cada lead', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    const response = await GET(mockRequest('https://volkern.app/api/leads'));
    const data = await response.json();

    // Lead 1 con relaciones
    expect(data[0].citas).toHaveLength(1);
    expect(data[0].citas[0].servicio.nombre).toBe('Consulta solar');
    expect(data[0].asignadoUsuario.name).toBe('Ana Vendedora');
    expect(data[0].score.categoria).toBe('Caliente');

    // Lead 2 sin relaciones
    expect(data[1].citas).toEqual([]);
    expect(data[1].asignadoUsuario).toBeNull();
    expect(data[1].score).toBeNull();
  });

  it('debe filtrar por tenantId para aislamiento', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    await GET(mockRequest('https://volkern.app/api/leads'));

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  it('debe ordenar por fechaCreacion descendente', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    await GET(mockRequest('https://volkern.app/api/leads'));

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fechaCreacion: 'desc' } }),
    );
  });

  it('debe filtrar por etapa si se proporciona query param', async () => {
    (prisma.lead.findMany as any).mockResolvedValue([mockLeads[0]]);

    const response = await GET(mockRequest('https://volkern.app/api/leads?etapa=calificacion'));

    expect(response.status).toBe(200);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'calificacion' }),
      }),
    );
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].estado).toBe('calificacion');
  });

  it('debe buscar por query (q) con OR sobre nombre, email, teléfono y empresa', async () => {
    (prisma.lead.findMany as any).mockResolvedValue([mockLeads[0]]);

    await GET(mockRequest('https://volkern.app/api/leads?q=TechCorp'));

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { empresa: { contains: 'TechCorp', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('debe combinar filtro de etapa y búsqueda simultáneamente', async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/leads?etapa=nuevo&q=María'));

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: 'nuevo',
          OR: expect.arrayContaining([
            { nombre: { contains: 'María', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('debe devolver array vacío si no hay leads', async () => {
    (prisma.lead.findMany as any).mockResolvedValue([]);

    const response = await GET(mockRequest('https://volkern.app/api/leads'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('debe devolver fallback con data vacío en caso de error de DB', async () => {
    (prisma.lead.findMany as any).mockRejectedValue(new Error('DB connection error'));

    const response = await GET(mockRequest('https://volkern.app/api/leads'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      data: [],
      fallback: true,
      error: 'Error al obtener leads',
    });
  });

  it('debe ignorar etapa si está vacío', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    await GET(mockRequest('https://volkern.app/api/leads?etapa='));

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe tratar etapa "todos" como sin filtro', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    await GET(mockRequest('https://volkern.app/api/leads?etapa=todos'));

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe serializar fechas como ISO strings en la respuesta JSON', async () => {
    (prisma.lead.findMany as any).mockResolvedValue(mockLeads);

    const response = await GET(mockRequest('https://volkern.app/api/leads'));
    const data = await response.json();

    expect(typeof data[0].fechaCreacion).toBe('string');
    expect(data[0].fechaCreacion).toBe(mockLeads[0].fechaCreacion.toISOString());
    expect(typeof data[0].fechaUltimaActividad).toBe('string');
    expect(data[0].fechaUltimaActividad).toBe(mockLeads[0].fechaUltimaActividad.toISOString());
  });
});

// ─── POST Tests ────────────────────────────────────────────────────────────

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validación ─────────────────────────────────────────────────────────

  it('debe devolver 400 si el nombre no se envía', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/leads', { email: 'test@test.com' }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Datos inválidos');
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si el email es inválido', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Test',
        email: 'email-invalido',
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Datos inválidos');
    expect(data.details).toBeDefined();
  });

  it('debe devolver 400 si linkedin no es URL válida', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Test',
        email: 'test@test.com',
        linkedin: 'no-es-url',
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Datos inválidos');
  });

  // ── Creación ──────────────────────────────────────────────────────────

  it('debe crear un nuevo lead con campos básicos', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({
      id: 'lead-new',
      nombre: 'Carlos Ruiz',
      email: 'carlos@example.com',
      estado: 'nuevo',
      scoreValue: 0,
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Carlos Ruiz',
        email: 'carlos@example.com',
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.nombre).toBe('Carlos Ruiz');
    expect(data.email).toBe('carlos@example.com');
    expect(data.estado).toBe('nuevo');
  });

  it('debe crear lead con todos los campos opcionales', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-full' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Ana García',
        email: 'ana@test.com',
        telefono: '+34 600 111 222',
        empresa: 'InnovaCorp',
        cargo: 'CTO',
        ubicacion: 'Valencia',
        linkedin: 'https://linkedin.com/in/anagarcia',
        notas: 'Cliente potencial para proyecto IoT',
        fuente: 'linkedin',
        etapa: 'calificacion',
        scoreValue: 70,
        contextoProyecto: 'Transformación digital',
        tags: 'iot,digital',
      }),
    );

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Ana García',
          email: 'ana@test.com',
          telefono: '+34 600 111 222',
          empresa: 'InnovaCorp',
          cargo: 'CTO',
          ubicacion: 'Valencia',
          linkedin: 'https://linkedin.com/in/anagarcia',
          scoreValue: 70,
          fuente: 'linkedin',
          estado: 'calificacion',
          contextoProyecto: 'Transformación digital',
          tenantId: 'test-tenant-id',
        }),
      }),
    );
  });

  it('debe usar valores por defecto (estado "nuevo", score 0, fuente null)', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-default' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Test Defaults',
        email: 'test@defaults.com',
      }),
    );

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'nuevo',
          scoreValue: 0,
          fuente: null,
          metadataExterna: {},
        }),
      }),
    );
  });

  it('debe generar tokenPublico como UUID', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    let capturedData: any;
    (prisma.lead.create as any).mockImplementation(({ data }: any) => {
      capturedData = data;
      return { id: 'lead-uuid' };
    });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'UUID Test',
        email: 'uuid@test.com',
      }),
    );

    expect(capturedData.tokenPublico).toBeDefined();
    expect(typeof capturedData.tokenPublico).toBe('string');
    expect(capturedData.tokenPublico.length).toBeGreaterThan(10);
  });

  it('debe crear nota inicial si se proporciona notas', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-note' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Nota Test',
        email: 'nota@test.com',
        notas: 'Nota inicial de prueba',
      }),
    );

    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 'lead-note',
          contenido: 'Nota inicial de prueba',
          creadoPor: 'test-user-id',
        }),
      }),
    );
  });

  it('NO debe crear nota si notas está vacío', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-no-note' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'No Note',
        email: 'nonote@test.com',
        notas: '',
      }),
    );

    expect(prisma.note.create).not.toHaveBeenCalled();
  });

  // ── Dedup ──────────────────────────────────────────────────────────────

  it('debe actualizar lead existente si el email ya está registrado', async () => {
    const existingLead = { id: 'lead-exist', nombre: 'Original', email: 'existente@test.com' };
    (prisma.lead.findFirst as any).mockResolvedValueOnce(existingLead); // dedup por email
    (prisma.lead.update as any).mockResolvedValue({ ...existingLead, nombre: 'Actualizado' });

    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Actualizado',
        email: 'existente@test.com',
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-exist' },
        data: expect.objectContaining({
          nombre: 'Actualizado',
          fechaUltimaActividad: expect.any(Date),
        }),
      }),
    );
  });

  it('debe actualizar lead existente si el teléfono coincide (fallback tras email)', async () => {
    const existingLead = { id: 'lead-phone', nombre: 'Por Teléfono', email: '' };
    (prisma.lead.findFirst as any)
      .mockResolvedValueOnce(null)        // 1er findFirst por email → null
      .mockResolvedValueOnce(existingLead); // 2do findFirst por teléfono → encontrado
    (prisma.lead.update as any).mockResolvedValue(existingLead);

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Por Teléfono',
        email: 'nuevo@test.com',
        telefono: '+34 600 000 000',
      }),
    );

    expect(prisma.lead.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-phone' },
        data: expect.objectContaining({ telefono: '+34 600 000 000' }),
      }),
    );
  });

  it('NO debe actualizar si no hay duplicado por email ni teléfono', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null); // No existe duplicado
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-new-2' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Nuevo Lead',
        email: 'nuevo@test.com',
        telefono: '+34 600 111 222',
      }),
    );

    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it('debe crear nota también en actualización si se envían notas', async () => {
    const existingLead = { id: 'lead-exist2', nombre: 'Original', email: 'exist2@test.com' };
    (prisma.lead.findFirst as any).mockResolvedValueOnce(existingLead);
    (prisma.lead.update as any).mockResolvedValue({ ...existingLead, notas: 'Nueva nota' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Actualizado',
        email: 'exist2@test.com',
        notas: 'Nota de actualización',
      }),
    );

    // La nota se crea con el ID del lead existente
    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 'lead-exist2',
          contenido: 'Nota de actualización',
        }),
      }),
    );
  });

  // ── Post-actions ───────────────────────────────────────────────────────

  it('debe llamar a assignLeadAutomatically tras crear lead nuevo', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-assign', nombre: 'Assign Test' });
    (prisma.lead.findUnique as any).mockResolvedValueOnce({ id: 'lead-assign', asignadoA: 'user-2' });

    const { assignLeadAutomatically } = await import('@/lib/leads/assignment');

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Assign Test',
        email: 'assign@test.com',
      }),
    );

    expect(assignLeadAutomatically).toHaveBeenCalledWith('lead-assign', 'test-tenant-id');
  });

  it('debe llamar a ScoringEngine.recalculateLeadScore tras crear', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-score' });

    const { ScoringEngine } = await import('@/lib/scoring-engine');

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Score Test',
        email: 'score@test.com',
      }),
    );

    expect(ScoringEngine.recalculateLeadScore).toHaveBeenCalledWith('lead-score');
  });

  it('debe llamar a triggerAutomation tras crear lead', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-auto' });

    const { triggerAutomation } = await import('@/lib/automation-engine');

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Auto Test',
        email: 'auto@test.com',
      }),
    );

    expect(triggerAutomation).toHaveBeenCalled();
  });

  it('debe llamar a sendNewLeadNotification tras crear lead nuevo', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({
      id: 'lead-notif',
      nombre: 'Notif Test',
      email: 'notif@test.com',
      telefono: null,
      notas: null,
    });

    const { sendNewLeadNotification } = await import('@/lib/email');

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Notif Test',
        email: 'notif@test.com',
      }),
    );

    expect(sendNewLeadNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Notif Test',
        email: 'notif@test.com',
        tenantId: 'test-tenant-id',
      }),
    );
  });

  it('debe devolver 200 aunque las post-actions fallen (catch silencioso)', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-fail-silent' });

    // Hacer que scoring y automation fallen
    const { ScoringEngine } = await import('@/lib/scoring-engine');
    const { triggerAutomation } = await import('@/lib/automation-engine');
    (ScoringEngine.recalculateLeadScore as any).mockRejectedValueOnce(new Error('Scoring timeout'));

    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Silent Fail',
        email: 'silent@test.com',
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe('lead-fail-silent');
  });

  it('debe llamar a incrementUsage tras crear lead (no en actualización)', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-usage' });

    const { incrementUsage } = await import('@/lib/subscription');

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Usage Test',
        email: 'usage@test.com',
      }),
    );

    expect(incrementUsage).toHaveBeenCalledWith('test-tenant-id', 'leads', 1);
  });

  it('NO debe llamar a incrementUsage si es actualización de lead existente', async () => {
    const existing = { id: 'lead-exist-usage', nombre: 'Existente', email: 'exist-u@test.com' };
    (prisma.lead.findFirst as any).mockResolvedValue(existing);
    (prisma.lead.update as any).mockResolvedValue(existing);

    const { incrementUsage } = await import('@/lib/subscription');

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Actualizado',
        email: 'exist-u@test.com',
      }),
    );

    expect(incrementUsage).not.toHaveBeenCalled();
  });

  // ── Errores ────────────────────────────────────────────────────────────

  it('debe devolver 403 si validateLimit indica límite alcanzado', async () => {
    const { validateLimit } = await import('@/lib/limits');
    (validateLimit as any).mockResolvedValueOnce({
      allowed: false,
      error: {
        status: 403,
        message: 'Has alcanzado el límite de leads para tu plan',
        code: 'LIMIT_REACHED',
      },
    });

    (prisma.lead.findFirst as any).mockResolvedValue(null);

    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Limit Test',
        email: 'limit@test.com',
      }),
    );

    expect(response.status).toBe(403);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('debe devolver 500 si Prisma lanza error en create', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockRejectedValue(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Error Test',
        email: 'error@test.com',
      }),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al procesar lead');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await POST(req, undefined);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al procesar lead');
  });

  // ── Aislamiento ────────────────────────────────────────────────────────

  it('debe crear el lead con tenantId del auth', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);
    (prisma.lead.create as any).mockResolvedValue({ id: 'lead-tenant' });

    await POST(
      mockRequest('https://volkern.app/api/leads', {
        nombre: 'Tenant Test',
        email: 'tenant@test.com',
      }),
    );

    expect(prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });
});
