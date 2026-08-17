import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.hoisted()) ────────────────────────────────────────────────────
// Las rutas de scoring usan getServerSession('next-auth') + authOptions, y
// unas instancian `new PrismaClient()` directo (@prisma/client) mientras que
// otras delegan en ScoringEngine. Se mockean ambas capas para probar el
// contrato HTTP de cada endpoint sin tocar la BD.

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  prisma: {
    scoringRule: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    scoreCategory: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  engine: {
    getScoringStats: vi.fn(),
    calculateScore: vi.fn(),
    recalculateLeadScore: vi.fn(),
    getLeadScore: vi.fn(),
    getScoreHistory: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mocks.prisma),
}));

vi.mock('@/lib/scoring-engine', () => ({
  ScoringEngine: mocks.engine,
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
import { GET as rulesGET, POST as rulesPOST, PUT as rulesPUT, DELETE as rulesDELETE } from '@/app/api/scoring/rules/route';
import { GET as catsGET, POST as catsPOST, PUT as catsPUT } from '@/app/api/scoring/categories/route';
import { GET as statsGET } from '@/app/api/scoring/stats/route';
import { POST as calculatePOST } from '@/app/api/scoring/calculate/route';
import { GET as leadGET, POST as leadPOST } from '@/app/api/scoring/lead/[id]/route';
import { PrismaClient } from '@prisma/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION = { user: { id: 'u1', email: 'test@volkern.app' } };

function jsonReq(url: string, body?: unknown, method = 'GET'): Request {
  return new Request(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue(SESSION);
  // PrismaClient solo se instancia una vez por módulo (import-time) en las
  // rutas que lo usan; el constructor mock devuelve siempre el mismo objeto.
  (PrismaClient as any).mockClear?.();
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH común: todas las sub-rutas exigen sesión
// ════════════════════════════════════════════════════════════════════════════

describe('scoring API — auth (401 sin sesión en todas las sub-rutas)', () => {
  beforeEach(() => {
    mocks.getServerSession.mockResolvedValue(null);
  });

  it('GET /api/scoring/rules → 401', async () => {
    const res = await rulesGET(jsonReq('https://volkern.app/api/scoring/rules'));
    expect(res.status).toBe(401);
    expect(mocks.prisma.scoringRule.findMany).not.toHaveBeenCalled();
  });

  it('POST /api/scoring/rules → 401', async () => {
    const res = await rulesPOST(jsonReq('https://volkern.app/api/scoring/rules', { nombre: 'x' }, 'POST'));
    expect(res.status).toBe(401);
  });

  it('PUT /api/scoring/rules → 401', async () => {
    const res = await rulesPUT(jsonReq('https://volkern.app/api/scoring/rules', { id: 'r1' }, 'PUT'));
    expect(res.status).toBe(401);
  });

  it('DELETE /api/scoring/rules → 401', async () => {
    const res = await rulesDELETE(jsonReq('https://volkern.app/api/scoring/rules?id=r1', undefined, 'DELETE'));
    expect(res.status).toBe(401);
  });

  it('GET /api/scoring/categories → 401', async () => {
    const res = await catsGET(jsonReq('https://volkern.app/api/scoring/categories'));
    expect(res.status).toBe(401);
  });

  it('POST /api/scoring/categories → 401', async () => {
    const res = await catsPOST(jsonReq('https://volkern.app/api/scoring/categories', { nombre: 'x' }, 'POST'));
    expect(res.status).toBe(401);
  });

  it('PUT /api/scoring/categories → 401', async () => {
    const res = await catsPUT(jsonReq('https://volkern.app/api/scoring/categories', { id: 'c1' }, 'PUT'));
    expect(res.status).toBe(401);
  });

  it('GET /api/scoring/stats → 401', async () => {
    const res = await statsGET(jsonReq('https://volkern.app/api/scoring/stats'));
    expect(res.status).toBe(401);
  });

  it('POST /api/scoring/calculate → 401', async () => {
    const res = await calculatePOST(jsonReq('https://volkern.app/api/scoring/calculate', { leadId: 'l1' }, 'POST'));
    expect(res.status).toBe(401);
  });

  it('GET /api/scoring/lead/[id] → 401', async () => {
    const res = await leadGET(jsonReq('https://volkern.app/api/scoring/lead/l1'), { params: { id: 'l1' } });
    expect(res.status).toBe(401);
  });

  it('POST /api/scoring/lead/[id] → 401', async () => {
    const res = await leadPOST(jsonReq('https://volkern.app/api/scoring/lead/l1', {}, 'POST'), { params: { id: 'l1' } });
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/scoring/rules
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/scoring/rules', () => {
  it('devolver 200 con la lista de reglas', async () => {
    mocks.prisma.scoringRule.findMany.mockResolvedValue([
      { id: 'r1', nombre: 'Email válido', evento: 'lead_created', puntos: 10, activo: true },
    ]);
    const res = await rulesGET(jsonReq('https://volkern.app/api/scoring/rules'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].nombre).toBe('Email válido');
  });

  it('pasar filtros categoria y activo a findMany', async () => {
    mocks.prisma.scoringRule.findMany.mockResolvedValue([]);
    await rulesGET(jsonReq('https://volkern.app/api/scoring/rules?categoria=demografica&activo=true'));
    expect(mocks.prisma.scoringRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoria: 'demografica', activo: true },
        orderBy: [{ orden: 'asc' }, { fechaCreacion: 'desc' }],
      }),
    );
  });

  it('devolver 500 si Prisma falla', async () => {
    mocks.prisma.scoringRule.findMany.mockRejectedValue(new Error('DB error'));
    const res = await rulesGET(jsonReq('https://volkern.app/api/scoring/rules'));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Error obteniendo reglas de scoring');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/scoring/rules
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/scoring/rules', () => {
  const BODY = { nombre: 'Nueva regla', categoria: 'demografica', evento: 'lead_created', puntos: 15 };

  it('crear regla y devolver 201', async () => {
    mocks.prisma.scoringRule.create.mockResolvedValue({ id: 'r-new', ...BODY, activo: true, orden: 0 });
    const res = await rulesPOST(jsonReq('https://volkern.app/api/scoring/rules', BODY, 'POST'));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('r-new');
    expect(data.puntos).toBe(15);
  });

  it('guardar condiciones y activo por defecto', async () => {
    mocks.prisma.scoringRule.create.mockResolvedValue({ id: 'r-new', ...BODY });
    await rulesPOST(jsonReq('https://volkern.app/api/scoring/rules', BODY, 'POST'));
    expect(mocks.prisma.scoringRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nombre: 'Nueva regla',
        condiciones: {},
        activo: true,
        orden: 0,
      }),
    });
  });

  it('400 si faltan campos requeridos', async () => {
    const res = await rulesPOST(jsonReq('https://volkern.app/api/scoring/rules', { nombre: 'solo nombre' }, 'POST'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Faltan campos requeridos');
    expect(mocks.prisma.scoringRule.create).not.toHaveBeenCalled();
  });

  it('500 si Prisma falla', async () => {
    mocks.prisma.scoringRule.create.mockRejectedValue(new Error('DB error'));
    const res = await rulesPOST(jsonReq('https://volkern.app/api/scoring/rules', BODY, 'POST'));
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/scoring/rules
// ════════════════════════════════════════════════════════════════════════════

describe('PUT /api/scoring/rules', () => {
  it('actualizar regla y devolver 200', async () => {
    mocks.prisma.scoringRule.update.mockResolvedValue({ id: 'r1', nombre: 'Editada', puntos: 20 });
    const res = await rulesPUT(jsonReq('https://volkern.app/api/scoring/rules', { id: 'r1', nombre: 'Editada', puntos: 20 }, 'PUT'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.puntos).toBe(20);
  });

  it('400 si falta id', async () => {
    const res = await rulesPUT(jsonReq('https://volkern.app/api/scoring/rules', { nombre: 'sin id' }, 'PUT'));
    expect(res.status).toBe(400);
    expect(mocks.prisma.scoringRule.update).not.toHaveBeenCalled();
  });

  it('pasar solo los campos del body (sin id) a update', async () => {
    mocks.prisma.scoringRule.update.mockResolvedValue({ id: 'r1' });
    await rulesPUT(jsonReq('https://volkern.app/api/scoring/rules', { id: 'r1', puntos: 5, activo: false }, 'PUT'));
    expect(mocks.prisma.scoringRule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { puntos: 5, activo: false },
    });
  });

  it('500 si Prisma falla', async () => {
    mocks.prisma.scoringRule.update.mockRejectedValue(new Error('DB error'));
    const res = await rulesPUT(jsonReq('https://volkern.app/api/scoring/rules', { id: 'r1' }, 'PUT'));
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DELETE /api/scoring/rules
// ════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/scoring/rules', () => {
  it('eliminar regla por id y devolver 200', async () => {
    mocks.prisma.scoringRule.delete.mockResolvedValue({ id: 'r1' });
    const res = await rulesDELETE(jsonReq('https://volkern.app/api/scoring/rules?id=r1', undefined, 'DELETE'));
    expect(res.status).toBe(200);
    expect(mocks.prisma.scoringRule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('400 si falta id', async () => {
    const res = await rulesDELETE(jsonReq('https://volkern.app/api/scoring/rules', undefined, 'DELETE'));
    expect(res.status).toBe(400);
    expect(mocks.prisma.scoringRule.delete).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/scoring/categories
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/scoring/categories', () => {
  it('devolver 200 con categorías ordenadas', async () => {
    mocks.prisma.scoreCategory.findMany.mockResolvedValue([
      { id: 'c1', nombre: 'A - Hot', etiqueta: 'Hot', puntuacionMin: 80, puntuacionMax: 100 },
    ]);
    const res = await catsGET(jsonReq('https://volkern.app/api/scoring/categories'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].nombre).toBe('A - Hot');
    expect(mocks.prisma.scoreCategory.findMany).toHaveBeenCalledWith({ orderBy: { orden: 'asc' } });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/scoring/categories
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/scoring/categories', () => {
  const BODY = { nombre: 'A - Hot', etiqueta: 'Hot', puntuacionMin: 80, puntuacionMax: 100 };

  it('crear categoría y devolver 201', async () => {
    mocks.prisma.scoreCategory.create.mockResolvedValue({ id: 'c-new', ...BODY, orden: 1 });
    const res = await catsPOST(jsonReq('https://volkern.app/api/scoring/categories', BODY, 'POST'));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('c-new');
  });

  it('400 si faltan campos requeridos (nombre, etiqueta, min, max)', async () => {
    const res = await catsPOST(jsonReq('https://volkern.app/api/scoring/categories', { nombre: 'incompleta' }, 'POST'));
    expect(res.status).toBe(400);
    expect(mocks.prisma.scoreCategory.create).not.toHaveBeenCalled();
  });

  it('500 si Prisma falla', async () => {
    mocks.prisma.scoreCategory.create.mockRejectedValue(new Error('DB error'));
    const res = await catsPOST(jsonReq('https://volkern.app/api/scoring/categories', BODY, 'POST'));
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/scoring/categories
// ════════════════════════════════════════════════════════════════════════════

describe('PUT /api/scoring/categories', () => {
  it('actualizar categoría y devolver 200', async () => {
    mocks.prisma.scoreCategory.update.mockResolvedValue({ id: 'c1', nombre: 'B - Warm' });
    const res = await catsPUT(jsonReq('https://volkern.app/api/scoring/categories', { id: 'c1', nombre: 'B - Warm' }, 'PUT'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nombre).toBe('B - Warm');
  });

  it('400 si falta id', async () => {
    const res = await catsPUT(jsonReq('https://volkern.app/api/scoring/categories', { nombre: 'sin id' }, 'PUT'));
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/scoring/stats
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/scoring/stats', () => {
  it('devolver 200 con las estadísticas del motor', async () => {
    mocks.engine.getScoringStats.mockResolvedValue({
      totalLeads: 10,
      promedioScore: 14,
      distribucionCategorias: { 'Sin categoría': 10 },
      topLeads: [],
    });
    const res = await statsGET(jsonReq('https://volkern.app/api/scoring/stats'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalLeads).toBe(10);
    expect(data.promedioScore).toBe(14);
  });

  it('devolver 500 si el motor devuelve null', async () => {
    mocks.engine.getScoringStats.mockResolvedValue(null);
    const res = await statsGET(jsonReq('https://volkern.app/api/scoring/stats'));
    expect(res.status).toBe(500);
  });

  it('devolver 500 si el motor lanza', async () => {
    mocks.engine.getScoringStats.mockRejectedValue(new Error('engine error'));
    const res = await statsGET(jsonReq('https://volkern.app/api/scoring/stats'));
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/scoring/calculate
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/scoring/calculate', () => {
  const BODY = { leadId: 'l1', evento: 'lead_created', categoria: 'demografica', detalles: { fuente: 'web' } };

  it('calcular score y devolver 200 con el resultado', async () => {
    mocks.engine.calculateScore.mockResolvedValue({
      puntuacionAnterior: 0,
      puntuacionNueva: 15,
      cambio: 15,
      categoria: 'Sin categoría',
    });
    const res = await calculatePOST(jsonReq('https://volkern.app/api/scoring/calculate', BODY, 'POST'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cambio).toBe(15);
  });

  it('pasar leadId, evento, categoria y detalles al motor', async () => {
    mocks.engine.calculateScore.mockResolvedValue({
      puntuacionAnterior: 0, puntuacionNueva: 5, cambio: 5, categoria: null,
    });
    await calculatePOST(jsonReq('https://volkern.app/api/scoring/calculate', BODY, 'POST'));
    expect(mocks.engine.calculateScore).toHaveBeenCalledWith({
      leadId: 'l1',
      evento: 'lead_created',
      categoria: 'demografica',
      detalles: { fuente: 'web' },
    });
  });

  it('400 si faltan leadId, evento o categoria', async () => {
    const res = await calculatePOST(jsonReq('https://volkern.app/api/scoring/calculate', { leadId: 'l1' }, 'POST'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Faltan campos requeridos');
    expect(mocks.engine.calculateScore).not.toHaveBeenCalled();
  });

  it('500 si el motor devuelve null', async () => {
    mocks.engine.calculateScore.mockResolvedValue(null);
    const res = await calculatePOST(jsonReq('https://volkern.app/api/scoring/calculate', BODY, 'POST'));
    expect(res.status).toBe(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/scoring/lead/[id]
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/scoring/lead/[id]', () => {
  const PARAMS = { params: { id: 'l1' } };

  it('devolver 200 con score + historial', async () => {
    mocks.engine.getLeadScore.mockResolvedValue({
      id: 's1', leadId: 'l1', puntuacion: 15, lead: { nombre: 'Juan' },
    });
    mocks.engine.getScoreHistory.mockResolvedValue([{ id: 'h1', cambio: 5 }]);
    const res = await leadGET(jsonReq('https://volkern.app/api/scoring/lead/l1'), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.score.puntuacion).toBe(15);
    expect(data.history).toHaveLength(1);
    expect(mocks.engine.getScoreHistory).toHaveBeenCalledWith('l1', 20);
  });

  it('devolver 404 si no hay score', async () => {
    mocks.engine.getLeadScore.mockResolvedValue(null);
    const res = await leadGET(jsonReq('https://volkern.app/api/scoring/lead/l1'), PARAMS);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Score no encontrado');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/scoring/lead/[id]
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/scoring/lead/[id]', () => {
  const PARAMS = { params: { id: 'l1' } };

  it('recalcular score y devolver 200', async () => {
    mocks.engine.recalculateLeadScore.mockResolvedValue({
      puntuacionAnterior: 5, puntuacionNueva: 15, cambio: 10, categoria: 'B - Warm',
    });
    const res = await leadPOST(jsonReq('https://volkern.app/api/scoring/lead/l1', {}, 'POST'), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cambio).toBe(10);
    expect(mocks.engine.recalculateLeadScore).toHaveBeenCalledWith('l1');
  });

  it('500 si el motor devuelve null', async () => {
    mocks.engine.recalculateLeadScore.mockResolvedValue(null);
    const res = await leadPOST(jsonReq('https://volkern.app/api/scoring/lead/l1', {}, 'POST'), PARAMS);
    expect(res.status).toBe(500);
  });
});
