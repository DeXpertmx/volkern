import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de Prisma antes de importar el módulo
vi.mock('@/lib/db', () => {
  const mockPrisma = {
    lead: { findUnique: vi.fn() },
    scoringRule: { findMany: vi.fn() },
    leadScore: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    scoreHistory: { findMany: vi.fn(), create: vi.fn() },
    scoreCategory: { findMany: vi.fn() },
  };
  return { prisma: mockPrisma };
});

import { ScoringEngine, ScoreChange, ScoreResult } from '@/lib/scoring-engine';
import { prisma } from '@/lib/db';

describe('ScoringEngine — evaluateConditions', () => {
  // Accedemos al método privado via casting para test unitario
  const evaluateConditions = (condiciones: any, context: any): boolean => {
    return (ScoringEngine as any).evaluateConditions(condiciones, context);
  };

  it('debe devolver true solo con objeto vacío, false con null/undefined', () => {
    // Objeto vacío: sin condiciones → pasa
    expect(evaluateConditions({}, { lead: {}, detalles: {} })).toBe(true);
    // null o undefined → TypeError atrapado → false
    expect(evaluateConditions(null, { lead: {}, detalles: {} })).toBe(false);
    expect(evaluateConditions(undefined, { lead: {}, detalles: {} })).toBe(false);
  });

  it('debe validar estadoLead correctamente', () => {
    const context = { lead: { estado: 'nuevo' }, detalles: {} };
    
    expect(evaluateConditions({ estadoLead: 'nuevo' }, context)).toBe(true);
    expect(evaluateConditions({ estadoLead: 'contactado' }, context)).toBe(false);
  });

  it('debe validar tieneEmail correctamente', () => {
    const conEmail = { lead: { email: 'test@test.com' }, detalles: {} };
    const sinEmail = { lead: { email: null }, detalles: {} };
    
    expect(evaluateConditions({ tieneEmail: true }, conEmail)).toBe(true);
    expect(evaluateConditions({ tieneEmail: true }, sinEmail)).toBe(false);
    expect(evaluateConditions({ tieneEmail: false }, sinEmail)).toBe(true);
  });

  it('debe validar tieneTelefono correctamente', () => {
    const conTel = { lead: { telefono: '+34600000000' }, detalles: {} };
    const sinTel = { lead: { telefono: null }, detalles: {} };
    
    expect(evaluateConditions({ tieneTelefono: true }, conTel)).toBe(true);
    expect(evaluateConditions({ tieneTelefono: false }, sinTel)).toBe(true);
    expect(evaluateConditions({ tieneTelefono: true }, sinTel)).toBe(false);
  });

  it('debe evaluar múltiples condiciones (AND lógico)', () => {
    const context = { lead: { estado: 'nuevo', email: 'test@test.com', telefono: '+34' }, detalles: {} };
    
    // Todas se cumplen
    expect(evaluateConditions(
      { estadoLead: 'nuevo', tieneEmail: true, tieneTelefono: true },
      context
    )).toBe(true);
    
    // Una falla → false
    expect(evaluateConditions(
      { estadoLead: 'contactado', tieneEmail: true, tieneTelefono: true },
      context
    )).toBe(false);
  });

  it('debe devolver false si el contexto es inválido', () => {
    expect(evaluateConditions({ estadoLead: 'nuevo' }, undefined)).toBe(false);
    expect(evaluateConditions({ estadoLead: 'nuevo' }, null)).toBe(false);
  });
});

describe('ScoringEngine — determineCategory', () => {
  it('debe devolver null si no hay categorías', async () => {
    (prisma.scoreCategory.findMany as any).mockResolvedValue([]);
    
    const result = await ScoringEngine.determineCategory(50);
    expect(result).toBeNull();
  });

  it('debe asignar la categoría correcta según puntuación', async () => {
    (prisma.scoreCategory.findMany as any).mockResolvedValue([
      { nombre: 'A - Hot', puntuacionMin: 80, puntuacionMax: 100 },
      { nombre: 'B - Warm', puntuacionMin: 60, puntuacionMax: 79 },
      { nombre: 'C - Cold', puntuacionMin: 40, puntuacionMax: 59 },
      { nombre: 'D - Unqualified', puntuacionMin: 0, puntuacionMax: 39 },
    ]);
    
    expect(await ScoringEngine.determineCategory(90)).toBe('A - Hot');
    expect(await ScoringEngine.determineCategory(75)).toBe('B - Warm');
    expect(await ScoringEngine.determineCategory(50)).toBe('C - Cold');
    expect(await ScoringEngine.determineCategory(20)).toBe('D - Unqualified');
    expect(await ScoringEngine.determineCategory(80)).toBe('A - Hot'); // límite
    expect(await ScoringEngine.determineCategory(39)).toBe('D - Unqualified'); // límite
  });

  it('debe respetar el orden descendente de puntuacionMin', async () => {
    (prisma.scoreCategory.findMany as any).mockResolvedValue([
      { nombre: 'Premium', puntuacionMin: 90, puntuacionMax: 100 },
      { nombre: 'Alto', puntuacionMin: 80, puntuacionMax: 89 },
      { nombre: 'Medio', puntuacionMin: 50, puntuacionMax: 79 },
    ]);
    
    // Debe elegir la primera que coincida (ordenada por puntuacionMin desc)
    expect(await ScoringEngine.determineCategory(85)).toBe('Alto');
    expect(await ScoringEngine.determineCategory(50)).toBe('Medio');
  });
});

describe('ScoringEngine — calculateScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver null si no hay leadId', async () => {
    const result = await ScoringEngine.calculateScore({
      leadId: '',
      evento: 'test',
      categoria: 'demografica',
    });
    expect(result).toBeNull();
  });

  it('debe devolver null si el lead no existe', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue(null);
    
    const result = await ScoringEngine.calculateScore({
      leadId: 'no-existe',
      evento: 'test',
      categoria: 'demografica',
    });
    expect(result).toBeNull();
  });

  it('debe devolver null si no hay reglas activas para el evento', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue({
      id: 'lead-1',
      estado: 'nuevo',
      email: 'test@test.com',
      score: { id: 'score-1', puntuacion: 50 },
      citas: [],
      conversaciones: [],
    });
    (prisma.scoringRule.findMany as any).mockResolvedValue([]);
    
    const result = await ScoringEngine.calculateScore({
      leadId: 'lead-1',
      evento: 'evento_sin_reglas',
      categoria: 'demografica',
    });
    expect(result).toBeNull();
  });

  it('debe sumar puntos de reglas y actualizar el score', async () => {
    const leadMock = {
      id: 'lead-1',
      estado: 'nuevo',
      email: 'test@test.com',
      score: { id: 'score-1', puntuacion: 50, puntuacionDemografica: 20 },
      citas: [],
      conversaciones: [],
    };
    
    (prisma.lead.findUnique as any).mockResolvedValue(leadMock);
    (prisma.scoringRule.findMany as any).mockResolvedValue([
      { id: 'rule-1', nombre: 'Email válido', evento: 'lead_created', puntos: 10, orden: 1, activo: true, condiciones: { tieneEmail: true } },
      { id: 'rule-2', nombre: 'Bonus nuevo', evento: 'lead_created', puntos: 15, orden: 2, activo: true, condiciones: { estadoLead: 'nuevo' } },
    ]);
    (prisma.scoreCategory.findMany as any).mockResolvedValue([
      { nombre: 'B - Warm', puntuacionMin: 60, puntuacionMax: 79 },
    ]);
    (prisma.leadScore.update as any).mockResolvedValue({
      id: 'score-1',
      puntuacion: 75,
      puntuacionDemografica: 45,
      categoria: 'B - Warm',
    });
    (prisma.scoreHistory.create as any).mockResolvedValue({});
    
    const result = await ScoringEngine.calculateScore({
      leadId: 'lead-1',
      evento: 'lead_created',
      categoria: 'demografica',
    });
    
    expect(result).not.toBeNull();
    expect(result!.puntuacionAnterior).toBe(50);
    expect(result!.puntuacionNueva).toBe(75);
    expect(result!.cambio).toBe(25);
    expect(result!.categoria).toBe('B - Warm');
  });

  it('debe crear leadScore si no existe', async () => {
    (prisma.lead.findUnique as any).mockResolvedValue({
      id: 'lead-2',
      estado: 'nuevo',
      email: 'nuevo@test.com',
      score: null,
      citas: [],
      conversaciones: [],
    });
    (prisma.scoringRule.findMany as any).mockResolvedValue([
      { id: 'rule-1', nombre: 'Base', evento: 'lead_created', puntos: 5, orden: 1, activo: true, condiciones: null },
    ]);
    (prisma.leadScore.create as any).mockResolvedValue({
      id: 'score-new',
      puntuacion: 0,
      puntuacionDemografica: 0,
      puntuacionComportamiento: 0,
      puntuacionInteraccion: 0,
      puntuacionEngagement: 0,
    });
    (prisma.scoreCategory.findMany as any).mockResolvedValue([]);
    (prisma.leadScore.update as any).mockResolvedValue({
      id: 'score-new',
      puntuacion: 5,
      categoria: null,
    });
    (prisma.scoreHistory.create as any).mockResolvedValue({});
    
    const result = await ScoringEngine.calculateScore({
      leadId: 'lead-2',
      evento: 'lead_created',
      categoria: 'comportamiento',
    });
    
    expect(result).not.toBeNull();
    expect(result!.puntuacionAnterior).toBe(0);
    expect(result!.puntuacionNueva).toBe(5);
    expect(result!.cambio).toBe(5);
  });
});

describe('ScoringEngine — getScoringStats', () => {
  it('debe calcular estadísticas correctamente', async () => {
    (prisma.leadScore.findMany as any).mockResolvedValue([
      { leadId: '1', puntuacion: 80, categoria: 'A - Hot', lead: { nombre: 'Lead 1' } },
      { leadId: '2', puntuacion: 60, categoria: 'B - Warm', lead: { nombre: 'Lead 2' } },
      { leadId: '3', puntuacion: 40, categoria: 'C - Cold', lead: { nombre: 'Lead 3' } },
      { leadId: '4', puntuacion: 20, categoria: null, lead: { nombre: 'Lead 4' } },
    ]);
    
    const stats = await ScoringEngine.getScoringStats();
    
    expect(stats).not.toBeNull();
    expect(stats!.totalLeads).toBe(4);
    expect(stats!.promedioScore).toBe(50); // (80+60+40+20)/4 = 50
    expect(stats!.distribucionCategorias).toEqual({
      'A - Hot': 1,
      'B - Warm': 1,
      'C - Cold': 1,
      'Sin categoría': 1,
    });
    expect(stats!.topLeads).toHaveLength(4);
    expect(stats!.topLeads[0].puntuacion).toBe(80);
  });

  it('debe manejar lista vacía', async () => {
    (prisma.leadScore.findMany as any).mockResolvedValue([]);
    
    const stats = await ScoringEngine.getScoringStats();
    
    expect(stats).not.toBeNull();
    expect(stats!.totalLeads).toBe(0);
    expect(stats!.promedioScore).toBe(0);
    expect(stats!.topLeads).toHaveLength(0);
  });
});
