// @vitest-environment node
//
// GUARDIA de la calibración del health score (C6) — el otro lado de la
// guardia que congela: aquí se vigila la pieza que EVALÚA el dataset
// (HealthSnapshot) para que, algún día, mover pesos y cortes sea una
// decisión con datos y no una opinión.
//
//   1. Módulo puro (lib/sales/health-calibracion.ts): una fila por deal
//      cerrado (la ÚLTIMA snapshot, no todas), el resumen por desenlace, la
//      evaluación de cortes con precisión/recall (y sus null sin muestra),
//      el veredicto «¿el score separa?» y el color de confianza.
//   2. API (GET /api/deals/calibracion): lee y entrega, no interpreta;
//      ámbito por tenant; veredicto y métricas salen del módulo.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  snapFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    healthSnapshot: { findMany: mocks.snapFindMany },
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));

import {
  ultimosPorDeal,
  resumenPorDesenlace,
  evaluarCorte,
  elScoreSepara,
  colorDeMuestra,
  CORTE_ALERTA,
  type SnapshotCalibracion,
} from '@/lib/sales/health-calibracion';

const hace = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000);
const snap = (over: Partial<SnapshotCalibracion> = {}): SnapshotCalibracion => ({
  dealId: 'd1',
  healthScore: 50,
  healthStatus: 'CRITICAL',
  diasSinMovimiento: 10,
  diasSinActividad: 8,
  slaVencido: true,
  desenlace: null,
  createdAt: hace(1),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Calibración C6 · módulo puro', () => {
  it('el dataset es la ÚLTIMA snapshot por deal: el historial no infla la muestra', () => {
    const ultimos = ultimosPorDeal([
      snap({ dealId: 'd1', healthScore: 70, createdAt: hace(72) }),
      snap({ dealId: 'd1', healthScore: 40, createdAt: hace(24) }), // la que vale
      snap({ dealId: 'd1', healthScore: 35, createdAt: hace(1) }), // la última
    ]);

    expect(ultimos.get('d1')!.healthScore).toBe(35);
    expect(ultimos.size).toBe(1);
  });

  it('resumen por desenlace: solo deals cerrados, score medio redondeado y bajos del corte', () => {
    const resumen = resumenPorDesenlace([
      snap({ dealId: 'a', desenlace: 'perdido', healthScore: 30, createdAt: hace(2) }),
      snap({ dealId: 'b', desenlace: 'perdido', healthScore: 45, createdAt: hace(2) }),
      snap({ dealId: 'c', desenlace: 'ganado', healthScore: 80, createdAt: hace(2) }),
      snap({ dealId: 'd', desenlace: null, healthScore: 10, createdAt: hace(2) }), // abierto: fuera
    ]);

    const perdidos = resumen.find(r => r.desenlace === 'perdido')!;
    const ganados = resumen.find(r => r.desenlace === 'ganado')!;

    expect(perdidos).toEqual({ desenlace: 'perdido', deals: 2, scoreMedio: 38, bajoElCorte: 2 });
    expect(ganados).toEqual({ desenlace: 'ganado', deals: 1, scoreMedio: 80, bajoElCorte: 0 });
  });

  it('sin deals cerrados: medias null y conteos a cero — nada inventado', () => {
    const resumen = resumenPorDesenlace([snap({ desenlace: null })]);

    for (const r of resumen) {
      expect(r.deals).toBe(0);
      expect(r.scoreMedio).toBeNull();
      expect(r.bajoElCorte).toBe(0);
    }
  });

  it('evalúa el corte 50 por defecto: precisión y recall del dataset cerrado', () => {
    const ev = evaluarCorte([
      snap({ dealId: 'p1', desenlace: 'perdido', healthScore: 40 }), // VP
      snap({ dealId: 'g1', desenlace: 'ganado', healthScore: 45 }), // FP (marcado, pero ganó)
      snap({ dealId: 'g2', desenlace: 'ganado', healthScore: 80 }), // VN
    ]);

    expect(ev).toMatchObject({
      corte: 50,
      verdaderosPositivos: 1,
      falsosPositivos: 1,
      verdaderosNegativos: 1,
      falsosNegativos: 0,
      precision: 50, // 1 de los 2 marcados se perdió
      recall: 100, // lo único que se perdió estaba marcado
    });
  });

  it('los falsos negativos existen: perdido con score alto se escapa del corte', () => {
    const ev = evaluarCorte([
      snap({ dealId: 'p1', desenlace: 'perdido', healthScore: 60 }), // FN
      snap({ dealId: 'p2', desenlace: 'perdido', healthScore: 30 }), // VP
    ]);

    expect(ev.falsosNegativos).toBe(1);
    expect(ev.recall).toBe(50);
  });

  it('sin denominador, precisión o recall son null (no 0): no hay evidencia', () => {
    // nada perdido → recall null; nada bajo el corte → precisión null
    const ev = evaluarCorte([snap({ dealId: 'g1', desenlace: 'ganado', healthScore: 90 })]);
    expect(ev.precision).toBeNull();
    expect(ev.recall).toBeNull();
  });

  it('evaluar cortes alternativos cambia el veredicto: con corte 70, el caso 60 ya cuenta como marcado', () => {
    const datos = [snap({ dealId: 'p1', desenlace: 'perdido', healthScore: 60 })];
    expect(evaluarCorte(datos, 50).verdaderosPositivos).toBe(0);
    expect(evaluarCorte(datos, 70).verdaderosPositivos).toBe(1);
    expect(CORTE_ALERTA).toBe(50);
  });

  it('el veredicto «¿el score separa?» solo existe con muestra en ambos lados', () => {
    const separa = [
      snap({ dealId: 'a', desenlace: 'perdido', healthScore: 30 }),
      snap({ dealId: 'b', desenlace: 'ganado', healthScore: 80 }),
    ];
    expect(elScoreSepara(separa)).toBe(true);
    expect(elScoreSepara([snap({ dealId: 'a', desenlace: 'perdido', healthScore: 30 })])).toBeNull();
    expect(elScoreSepara([])).toBeNull();
  });

  it('y si los ganados cierran con MENOS score que los perdidos, el veredicto es NO', () => {
    const alReves = [
      snap({ dealId: 'a', desenlace: 'perdido', healthScore: 80 }),
      snap({ dealId: 'b', desenlace: 'ganado', healthScore: 30 }),
    ];
    expect(elScoreSepara(alReves)).toBe(false);
  });

  it('color de la muestra: 0 gris, <20 rojo, <100 ámbar, ≥100 verde', () => {
    expect(colorDeMuestra(0)).toBe('gris');
    expect(colorDeMuestra(19)).toBe('rojo');
    expect(colorDeMuestra(99)).toBe('ambar');
    expect(colorDeMuestra(100)).toBe('verde');
  });
});

describe('Calibración C6 · GET /api/deals/calibracion', () => {
  const DATASET = [
    snap({ dealId: 'p1', desenlace: 'perdido', healthScore: 40, createdAt: hace(3) }),
    snap({ dealId: 'g1', desenlace: 'ganado', healthScore: 80, createdAt: hace(3) }),
    snap({ dealId: 'g2', desenlace: 'ganado', healthScore: 45, createdAt: hace(3) }),
  ];

  function peticion() {
    return new Request('http://localhost/api/deals/calibracion');
  }

  beforeEach(() => {
    mocks.getServerSession.mockResolvedValue({ user: { email: 'jefe@empresa.test' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
  });

  it('lee y entrega: veredicto, métricas y color salen del módulo, la API no interpreta', async () => {
    mocks.snapFindMany.mockResolvedValue(DATASET);
    const { GET } = await import('@/app/api/deals/calibracion/route');

    const res = await GET();
    const cuerpo = await res.json();

    expect(cuerpo.corteActual).toBe(50);
    expect(cuerpo.dealsCerrados).toBe(3);
    // perdidos: media 40 · ganados: (80+45)/2 = 63 → separa
    expect(cuerpo.elScoreSepara).toBe(true);
    expect(cuerpo.corteEvaluado).toMatchObject({
      precision: 50,
      recall: 100,
      falsosPositivos: 1,
    });
    expect(cuerpo.cortesAlternativos).toHaveLength(4);
    expect(cuerpo.cortesAlternativos.map((c: any) => c.corte)).toEqual([30, 40, 60, 70]);
    expect(cuerpo.colorMuestra).toBe('rojo'); // 3 deals: muestra insuficiente, y lo dice
  });

  it('ámbito por tenant: la consulta del dataset lleva el tenant del usuario', async () => {
    mocks.snapFindMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/deals/calibracion/route');

    await GET();

    expect(mocks.snapFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } })
    );
  });

  it('sin sesión → 401; sin tenant → 403', async () => {
    const { GET } = await import('@/app/api/deals/calibracion/route');

    mocks.getServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    mocks.getServerSession.mockResolvedValue({ user: { email: 'x@test' } });
    mocks.userFindUnique.mockResolvedValue({ id: 'u', tenantId: null });
    expect((await GET()).status).toBe(403);
  });

  it('dataset vacío: responde con ceros y color gris — la calibración no explota sin datos', async () => {
    mocks.snapFindMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/deals/calibracion/route');

    const cuerpo = await (await GET()).json();

    expect(cuerpo.dealsCerrados).toBe(0);
    expect(cuerpo.elScoreSepara).toBeNull();
    expect(cuerpo.colorMuestra).toBe('gris');
    expect(cuerpo.corteEvaluado.precision).toBeNull();
  });
});
