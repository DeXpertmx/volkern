// @vitest-environment jsdom
//
// GUARDIA C5 · El ranking de cerradores — y que el dato SE VEA.
//
// Cuatro capas congeladas:
//   1. MÓDULO PURO (lib/sales/leaderboard.ts): el cruce con User, la media
//      redondeada, el ORDEN DETERMINISTA (media desc; a igual media gana
//      quien MÁS SESIONES completó — la práctica constante vale tanto como
//      el golpe de suerte), el truncado al top — y el CONCURSO: el periodo
//      mensual (clave AAAA-MM del mes NATURAL local), su rango [desde, hasta),
//      su nombre legible y el ganador (la primera entrada del ranking).
//   2. API (GET /api/analytics/training/leaderboard): agrega SOLO EL MES EN
//      CURSO por tenant (el ranking se REINICIA cada mes), cierra on-read las
//      ediciones pendientes y devuelve ranking + estado del concurso.
//   3. SERVICIO (lib/sales/contest-ediciones.ts): el cierre IDEMPOTENTE de
//      meses pendientes — el mes en curso NUNCA se cierra, un mes sin práctica
//      no corona a nadie, y la carrera entre lecturas la arbitra el unique.
//   4. PANTALLA (components/analytics/TrainingLeaderboard.tsx): cabecera de
//      la edición, ganadores de ediciones cerradas y el montaje en la Academia
//      (antes: API viva, componente que nadie importaba).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sessionGroupBy: vi.fn(),
  sessionFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  editionCreate: vi.fn(),
  editionFindFirst: vi.fn(),
  editionFindMany: vi.fn(),
  useSWR: vi.fn(),
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth:
    (handler: (req: Request, auth: unknown) => Promise<Response>) =>
    async (req: Request) => {
      const auth = await mocks.auth(req);
      return handler(req, auth);
    },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    trainingSession: { groupBy: mocks.sessionGroupBy, findFirst: mocks.sessionFindFirst },
    user: { findMany: mocks.userFindMany },
    salesContestEdition: {
      create: mocks.editionCreate,
      findFirst: mocks.editionFindFirst,
      findMany: mocks.editionFindMany,
    },
  },
}));

// SWR estubeado: la pantalla consume la ruta a través de él; aquí controlamos
// qué recibe y comprobamos que pide LA RUTA del leaderboard.
vi.mock('swr', () => ({
  default: (url: string) => mocks.useSWR(url),
}));

// framer-motion estubeado: nos importan los DATOS en pantalla, no la animación.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: Record<string, unknown>) => {
        const { initial, animate, transition, ...rest } = props;
        void initial;
        void animate;
        void transition;
        return React.createElement('div', rest);
      },
    }
  ),
}));

import {
  construirRanking,
  clavePeriodo,
  rangoPeriodo,
  nombrePeriodo,
  ganadorDe,
  TOP_RANKING,
  type FilaRanking,
  type UsuarioRanking,
} from '@/lib/sales/leaderboard';
import { cerrarEdicionesPendientes, estadoConcurso, rangoPeriodoActual } from '@/lib/sales/contest-ediciones';

// ── helpers ─────────────────────────────────────────────────────────────────

const fila = (userId: string, avg: number | null, max: number | null, count: number): FilaRanking => ({
  userId,
  _avg: { score: avg },
  _max: { score: max },
  _count: { id: count },
});

const usuario = (id: string, name: string | null): UsuarioRanking => ({ id, name, image: null });

const AUTH = { tenant: { id: 'tenant-1' }, user: { id: 'user-1' } };

const llamarAPI = async (auth: unknown = AUTH) => {
  const { GET } = await import('@/app/api/analytics/training/leaderboard/route');
  mocks.auth.mockResolvedValue(auth);
  return GET(new Request('https://volkern.app/api/analytics/training/leaderboard'));
};

/** Estado por defecto de los mocks del concurso: sin ediciones, sin historia. */
const estadoConcursoEnBlanco = () => {
  mocks.sessionFindFirst.mockResolvedValue(null);
  mocks.editionFindFirst.mockResolvedValue(null);
  mocks.editionFindMany.mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionGroupBy.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.editionCreate.mockResolvedValue({});
  estadoConcursoEnBlanco();
  mocks.useSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false });
});

// ── 1. MÓDULO PURO: orden, desempate, top y contrato ────────────────────────

describe('C5 · módulo: construirRanking', () => {
  it('ordena por MEDIA descendente y redondea (88.6 → 89, 88.4 → 88)', () => {
    const ranking = construirRanking(
      [fila('a', 71.4, 90, 5), fila('b', 88.6, 95, 3), fila('c', 60, 80, 9)],
      [usuario('a', 'A'), usuario('b', 'B'), usuario('c', 'C')]
    );

    expect(ranking.map((r) => r.userId)).toEqual(['b', 'a', 'c']);
    expect(ranking[0].averageScore).toBe(89);
    expect(ranking[1].averageScore).toBe(71);
  });

  it('DESEMPATE congelado: a igual media gana quien MÁS SESIONES completó', () => {
    const ranking = construirRanking(
      [fila('constante', 90, 95, 7), fila('golpe', 90, 100, 2)],
      [usuario('constante', 'Constante'), usuario('golpe', 'Golpe de suerte')]
    );

    expect(ranking[0].userId).toBe('constante');
  });

  it('empate total (misma media y sesiones): el orden de llegada se conserva', () => {
    const ranking = construirRanking(
      [fila('x', 80, 90, 4), fila('y', 80, 90, 4)],
      [usuario('x', 'X'), usuario('y', 'Y')]
    );

    expect(ranking.map((r) => r.userId)).toEqual(['x', 'y']);
  });

  it('trunca al TOP_RANKING (10): el onceavo no entra aunque haya', () => {
    const datos = Array.from({ length: 12 }, (_, i) => fila(`u${i}`, 100 - i, 100, 1));
    const usuarios = datos.map((d) => usuario(d.userId, d.userId));

    const ranking = construirRanking(datos, usuarios);

    expect(TOP_RANKING).toBe(10);
    expect(ranking).toHaveLength(10);
    expect(ranking.some((r) => r.userId === 'u10')).toBe(false); // avg 90, el 11.º
    expect(ranking[9].userId).toBe('u9'); // avg 91, el último que entra
  });

  it('usuario sin fila en User: entra con el nombre genérico y avatar null — la fila no se cae', () => {
    const ranking = construirRanking([fila('fantasma', 75, 90, 2)], []);

    expect(ranking[0]).toEqual({
      userId: 'fantasma',
      name: 'Agente de Ventas',
      avatar: null,
      averageScore: 75,
      maxScore: 90,
      totalSessions: 2,
    });
  });

  it('media null (sin scores puntuados) → 0, y maxScore null se conserva tal cual', () => {
    const ranking = construirRanking([fila('a', null, null, 3)], [usuario('a', 'A')]);

    expect(ranking[0].averageScore).toBe(0);
    expect(ranking[0].maxScore).toBeNull();
  });

  it('CONTRATO EXACTO de la pantalla: las claves y tipos que consume TrainingLeaderboard', () => {
    const ranking = construirRanking([fila('a', 88.6, 95, 4)], [usuario('a', 'Ana')]);

    expect(ranking[0]).toEqual({
      userId: 'a',
      name: 'Ana',
      avatar: null,
      averageScore: 89,
      maxScore: 95,
      totalSessions: 4,
    });
    // El espejo del interface LeaderboardEntry del componente: si un día
    // cambia una clave, la pantalla se rompe y esta prueba lo caza primero.
    expect(Object.keys(ranking[0]).sort()).toEqual([
      'avatar',
      'averageScore',
      'maxScore',
      'name',
      'totalSessions',
      'userId',
    ]);
  });
});

// ── 1b. MÓDULO PURO: el periodo del concurso ────────────────────────────────

describe('C5 · concurso: el periodo mensual', () => {
  it('clavePeriodo es AAAA-MM del MES NATURAL local, con ceros (misma fecha, misma clave)', () => {
    expect(clavePeriodo(new Date(2026, 8, 1))).toBe('2026-09'); // septiembre
    expect(clavePeriodo(new Date(2026, 0, 31))).toBe('2026-01'); // enero, no 1
    expect(clavePeriodo(new Date(2026, 11, 31, 23, 59))).toBe('2026-12');
    // La medianoche del día 1 del mes siguiente ya es OTRO periodo.
    expect(clavePeriodo(new Date(2026, 9, 1, 0, 0))).toBe('2026-10');
  });

  it('rangoPeriodo cubre el mes COMPLETO: desde el día 1 a las 00:00 hasta el 1 del mes siguiente', () => {
    const { desde, hasta } = rangoPeriodo('2026-09');

    expect(desde).toEqual(new Date(2026, 8, 1));
    expect(hasta).toEqual(new Date(2026, 9, 1));
    // Una sesión el 30/09 a las 23:59 cae dentro; el 1/10 a las 00:00, fuera.
    expect(new Date(2026, 8, 30, 23, 59) >= desde).toBe(true);
    expect(new Date(2026, 8, 30, 23, 59) < hasta).toBe(true);
    expect(new Date(2026, 9, 1, 0, 0) >= hasta).toBe(true);
  });

  it('rangoPeriodo rechaza claves malformadas: el servicio no consulta ventanas inventadas', () => {
    expect(() => rangoPeriodo('septiembre')).toThrow();
    expect(() => rangoPeriodo('2026-13')).toThrow();
    expect(() => rangoPeriodo('2026-00')).toThrow();
  });

  it('nombrePeriodo es legible y en español: la pantalla dice «septiembre 2026»', () => {
    expect(nombrePeriodo('2026-09')).toBe('septiembre 2026');
    expect(nombrePeriodo('2026-01')).toBe('enero 2026');
    expect(nombrePeriodo('2026-12')).toBe('diciembre 2026');
  });

  it('ganadorDe es la PRIMERA entrada del ranking (el orden ya lo decidió construirRanking)', () => {
    const ranking = construirRanking(
      [fila('a', 90, 95, 7), fila('b', 90, 95, 2)],
      [usuario('a', 'A'), usuario('b', 'B')]
    );

    expect(ganadorDe(ranking)?.userId).toBe('a'); // desempate por sesiones
  });

  it('sin práctica no hay ganador: ganadorDe de un ranking vacío es null', () => {
    expect(ganadorDe([])).toBeNull();
  });
});

// ── 2. SERVICIO: el cierre on-read de ediciones ─────────────────────────────

describe('C5 · concurso: cerrarEdicionesPendientes', () => {
  const AHORA = new Date(2026, 8, 15); // 15 de septiembre de 2026

  const mockCronologia = (opts: {
    primeraSesion?: Date | null;
    ultimaEdicion?: string | null;
    sesionesPorMes?: Record<string, FilaRanking[]>;
    usuarios?: UsuarioRanking[];
  }) => {
    mocks.sessionFindFirst.mockResolvedValue(
      opts.primeraSesion ? { createdAt: opts.primeraSesion } : null
    );
    mocks.editionFindFirst.mockResolvedValue(
      opts.ultimaEdicion ? { periodo: opts.ultimaEdicion } : null
    );
    // Responde por VENTANA REAL, no por orden de llamada: si el where pide
    // exactamente el rango de un mes (el bucle del cierre), devuelve ese mes;
    // si pide una ventana más ancha (el barrido del hueco), concatena los
    // meses que solapan.
    const meses = opts.sesionesPorMes ?? {};
    mocks.sessionGroupBy.mockImplementation(async (args: any) => {
      const w = args?.where?.createdAt;
      if (!w?.gte || !w?.lt) return [];
      const claves = Object.keys(meses);
      const exacta = claves.find((c) => {
        const r = rangoPeriodo(c);
        return r.desde.getTime() === w.gte.getTime() && r.hasta.getTime() === w.lt.getTime();
      });
      if (exacta) return meses[exacta];
      return claves
        .filter((c) => {
          const r = rangoPeriodo(c);
          return r.desde < w.lt && r.hasta > w.gte;
        })
        .flatMap((c) => meses[c]);
    });
    mocks.userFindMany.mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return (opts.usuarios ?? []).filter((u) => ids.includes(u.id));
    });
  };

  it('cierra el mes anterior con el ganador de SUS sesiones: la edición es el mes natural', async () => {
    mockCronologia({
      primeraSesion: new Date(2026, 7, 10), // agosto
      sesionesPorMes: { '2026-08': [fila('a', 91, 95, 3), fila('b', 91, 92, 8)] },
      usuarios: [usuario('a', 'Ana'), usuario('b', 'Bruno')],
    });
    mocks.editionCreate.mockResolvedValue({});

    const cerradas = await cerrarEdicionesPendientes('tenant-1');

    expect(cerradas).toBe(1);
    expect(mocks.editionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        periodo: '2026-08',
        ganadorId: 'b', // empate a 91: gana el desempate por SESIONES (8 vs 3)
      }),
    });
  });

  it('cierra TODOS los meses pendientes, uno por uno, desde la primera sesión', async () => {
    mockCronologia({
      primeraSesion: new Date(2026, 5, 10), // junio
      sesionesPorMes: {
        '2026-06': [fila('a', 80, 90, 2)],
        '2026-07': [fila('b', 85, 95, 1)],
        '2026-08': [fila('a', 70, 80, 1)],
      },
      usuarios: [usuario('a', 'Ana'), usuario('b', 'Bruno')],
    });
    mocks.editionCreate.mockResolvedValue({});

    const cerradas = await cerrarEdicionesPendientes('tenant-1');

    expect(cerradas).toBe(3);
    const periodos = mocks.editionCreate.mock.calls.map((c) => c[0].data.periodo);
    expect(periodos).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('no reabre lo ya cerrado: reanuda DESPUÉS de la última edición', async () => {
    mockCronologia({
      primeraSesion: new Date(2026, 5, 10), // junio (ya cerrado)
      ultimaEdicion: '2026-07', // julio ya tiene ganador
      sesionesPorMes: { '2026-08': [fila('a', 90, 90, 1)] },
      usuarios: [usuario('a', 'Ana')],
    });
    mocks.editionCreate.mockResolvedValue({});

    await cerrarEdicionesPendientes('tenant-1');

    const periodos = mocks.editionCreate.mock.calls.map((c) => c[0].data.periodo);
    expect(periodos).toEqual(['2026-08']); // junio y julio NO se re-cierran
  });

  it('el MES EN CURSO nunca se cierra — aún se está jugando', async () => {
    // Sesiones solo del mes en curso (septiembre): no hay nada que cerrar.
    mockCronologia({
      primeraSesion: new Date(2026, 8, 3),
      sesionesPorMes: {}, // el barrido del hueco no encuentra nada
      usuarios: [usuario('a', 'Ana')],
    });

    const cerradas = await cerrarEdicionesPendientes('tenant-1');

    expect(cerradas).toBe(0);
    expect(mocks.editionCreate).not.toHaveBeenCalled();
  });

  it('un mes sin práctica no se corona: se salta y no crea fila', async () => {
    mockCronologia({
      primeraSesion: new Date(2026, 5, 10), // junio
      sesionesPorMes: {
        '2026-06': [fila('a', 80, 90, 2)],
        '2026-07': [], // julio: nadie practicó
        '2026-08': [fila('b', 85, 95, 1)],
      },
      usuarios: [usuario('a', 'Ana'), usuario('b', 'Bruno')],
    });
    mocks.editionCreate.mockResolvedValue({});

    const cerradas = await cerrarEdicionesPendientes('tenant-1');

    expect(cerradas).toBe(2);
    const periodos = mocks.editionCreate.mock.calls.map((c) => c[0].data.periodo);
    expect(periodos).toEqual(['2026-06', '2026-08']); // julio, sin ganador
  });

  it('la carrera entre dos lecturas la arbitra el unique: el create fallido no rompe ni duplica', async () => {
    mockCronologia({
      primeraSesion: new Date(2026, 7, 10),
      sesionesPorMes: { '2026-08': [fila('a', 90, 95, 1)] },
      usuarios: [usuario('a', 'Ana')],
    });
    mocks.editionCreate.mockRejectedValueOnce(new Error('P2002: Unique constraint failed'));

    const cerradas = await cerrarEdicionesPendientes('tenant-1');

    expect(cerradas).toBe(0); // la edición la cerró la OTRA lectura
  });

  it('sin sesiones no hay concurso: ni una consulta de ediciones', async () => {
    mocks.sessionFindFirst.mockResolvedValue(null);

    const cerradas = await cerrarEdicionesPendientes('tenant-1');

    expect(cerradas).toBe(0);
    expect(mocks.editionFindFirst).not.toHaveBeenCalled();
  });
});

describe('C5 · concurso: estadoConcurso', () => {
  it('cierra lo pendiente y devuelve el periodo en curso con las cerradas ordenadas de la más reciente', async () => {
    mocks.sessionFindFirst.mockResolvedValue(null); // nada pendiente
    mocks.editionFindMany.mockResolvedValue([
      {
        periodo: '2026-08',
        ganadorId: 'b',
        ganadorNombre: 'Bruno',
        mediaGanador: 92,
        sesionesGanador: 4,
        cerradoEn: new Date(2026, 8, 1),
      },
      {
        periodo: '2026-07',
        ganadorId: 'a',
        ganadorNombre: 'Ana',
        mediaGanador: 88,
        sesionesGanador: 6,
        cerradoEn: new Date(2026, 7, 1),
      },
    ]);

    const estado = await estadoConcurso('tenant-1');

    expect(estado.tipo).toBe('mensual');
    expect(estado.periodoActual.clave).toMatch(/^\d{4}-\d{2}$/);
    expect(estado.cerradas[0]).toEqual({
      periodo: '2026-08',
      nombre: 'agosto 2026',
      ganadorId: 'b',
      ganadorNombre: 'Bruno',
      mediaGanador: 92,
      sesionesGanador: 4,
      cerradoEn: new Date(2026, 8, 1),
    });
    expect(estado.cerradas[1].nombre).toBe('julio 2026');
  });

  it('si el cierre on-read revienta, se degrada elegante: la lectura de ediciones sigue y la pantalla no se queda sin concurso', async () => {
    mocks.sessionFindFirst.mockRejectedValue(new Error('db down'));
    mocks.editionFindMany.mockResolvedValue([]);

    const estado = await estadoConcurso('tenant-1');

    expect(estado.cerradas).toEqual([]);
    expect(estado.periodoActual.clave).toMatch(/^\d{4}-\d{2}$/);
  });

  it('rangoPeriodoActual es el rango del MES NATURAL en curso', () => {
    const ahora = new Date(2026, 8, 15);
    const { desde, hasta } = rangoPeriodoActual(ahora);

    expect(desde).toEqual(new Date(2026, 8, 1));
    expect(hasta).toEqual(new Date(2026, 9, 1));
  });
});

// ── 3. API: solo el mes en curso, por tenant, con el concurso dentro ────────

describe('C5 · API: GET /api/analytics/training/leaderboard', () => {
  it('agrupa por usuario FILTRADO POR TENANT y entrega el contrato del módulo', async () => {
    mocks.sessionGroupBy.mockResolvedValue([fila('a', 90, 95, 3)]);
    mocks.userFindMany.mockResolvedValue([usuario('a', 'Ana')]);

    const res = await llamarAPI();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      { userId: 'a', name: 'Ana', avatar: null, averageScore: 90, maxScore: 95, totalSessions: 3 },
    ]);

    expect(mocks.sessionGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['userId'],
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          createdAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      })
    );
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
      select: { id: true, name: true, image: true },
    });
  });

  it('EL REINICIO: la consulta filtra por el MES EN CURSO (createdAt dentro del rango del periodo)', async () => {
    await llamarAPI();

    const where = mocks.sessionGroupBy.mock.calls[0][0].where;
    expect(where.createdAt).toBeDefined();
    const { desde, hasta } = rangoPeriodo(clavePeriodo(new Date()));
    expect(where.createdAt.gte).toEqual(desde);
    expect(where.createdAt.lt).toEqual(hasta);
  });

  it('la respuesta lleva el ESTADO DEL CONCURSO junto al ranking', async () => {
    mocks.sessionGroupBy.mockResolvedValue([fila('a', 90, 95, 3)]);
    mocks.userFindMany.mockResolvedValue([usuario('a', 'Ana')]);
    mocks.editionFindMany.mockResolvedValue([
      {
        periodo: '2026-08',
        ganadorId: 'b',
        ganadorNombre: 'Bruno',
        mediaGanador: 92,
        sesionesGanador: 4,
        cerradoEn: new Date(2026, 8, 1),
      },
    ]);

    const json = await (await llamarAPI()).json();

    expect(json.concurso.tipo).toBe('mensual');
    expect(json.concurso.cerradas).toHaveLength(1);
    expect(json.concurso.cerradas[0].ganadorNombre).toBe('Bruno');
  });

  it('la consulta NO trunca con take: el corte lo decide el desempate del módulo, no la BD', async () => {
    await llamarAPI();

    const args = mocks.sessionGroupBy.mock.calls[0][0];
    expect(args).not.toHaveProperty('take');
  });

  it('si la agregación revienta → 500 con mensaje, sin filtrar el error al cliente', async () => {
    mocks.sessionGroupBy.mockRejectedValue(new Error('db down'));

    const res = await llamarAPI();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Error al cargar el ranking');
  });
});

// ── 4. PANTALLA: el contrato que consume y que el dato SE VEA ───────────────

import { TrainingLeaderboard } from '@/components/analytics/TrainingLeaderboard';

const entrada = (extra: Record<string, unknown>) => ({
  userId: 'u1',
  name: 'Ana García',
  avatar: null,
  averageScore: 95,
  maxScore: 100,
  totalSessions: 12,
  ...extra,
});

const montarConcurso = (cerradas: unknown[] = []) => ({
  tipo: 'mensual',
  periodoActual: { clave: '2026-09', nombre: 'septiembre 2026' },
  cerradas,
});

describe('C5 · pantalla: TrainingLeaderboard consume el contrato y está montada', () => {
  it('pide LA RUTA del leaderboard y pinta nombre, sesiones y media en orden', async () => {
    mocks.useSWR.mockReturnValue({
      data: { success: true, data: [entrada({}), entrada({ userId: 'u2', name: 'Bruno', averageScore: 80, totalSessions: 5 })] },
      isLoading: false,
    });

    render(<TrainingLeaderboard />);

    expect(mocks.useSWR.mock.calls[0][0]).toBe('/api/analytics/training/leaderboard');
    expect(await screen.findByText('Ana García')).toBeTruthy();
    expect(screen.getByText('Bruno')).toBeTruthy();
    expect(screen.getByText('12 sesiones completadas')).toBeTruthy();
    expect(screen.getByText('5 sesiones completadas')).toBeTruthy();
    // La etiqueta de media aparece UNA POR FILA.
    expect(screen.getAllByText('Promedio Cierre')).toHaveLength(2);
  });

  it('anuncia la EDICIÓN en curso con su mes: el ranking se reinicia cada mes', async () => {
    mocks.useSWR.mockReturnValue({
      data: { success: true, data: [entrada({})], concurso: montarConcurso() },
      isLoading: false,
    });

    render(<TrainingLeaderboard />);

    expect(await screen.findByText(/Edición de septiembre 2026/)).toBeTruthy();
    expect(screen.getByText(/el ranking se reinicia cada mes/)).toBeTruthy();
  });

  it('los GANADORES de ediciones cerradas se ven con corona, mes y sus números', async () => {
    mocks.useSWR.mockReturnValue({
      data: {
        success: true,
        data: [entrada({})],
        concurso: montarConcurso([
          { periodo: '2026-08', nombre: 'agosto 2026', ganadorId: 'b', ganadorNombre: 'Bruno', mediaGanador: 92, sesionesGanador: 4 },
        ]),
      },
      isLoading: false,
    });

    render(<TrainingLeaderboard />);

    expect(await screen.findByText('Bruno')).toBeTruthy();
    expect(screen.getByText('ganó agosto 2026')).toBeTruthy();
    expect(screen.getByText(/media 92 · 4 sesiones/)).toBeTruthy();
    expect(screen.getByText('Ediciones cerradas')).toBeTruthy();
  });

  it('sin prácticas este mes: la edición abierta se explica — el concurso no parece roto', async () => {
    mocks.useSWR.mockReturnValue({
      data: { success: true, data: [], concurso: montarConcurso() },
      isLoading: false,
    });

    render(<TrainingLeaderboard />);

    expect(
      await screen.findByText(/La edición de septiembre 2026 está abierta: sin prácticas este mes/)
    ).toBeTruthy();
    expect(screen.getByText(/Cada mes arranca una edición nueva/)).toBeTruthy();
  });

  it('sin datos ni concurso: estado vacío clásico visible', async () => {
    mocks.useSWR.mockReturnValue({ data: { success: true, data: [] }, isLoading: false });

    render(<TrainingLeaderboard />);

    expect(await screen.findByText('Aún no hay datos de entrenamiento.')).toBeTruthy();
  });

  it('respuesta rota (success falso) → estado vacío, no crash', async () => {
    mocks.useSWR.mockReturnValue({ data: { error: 'x' }, isLoading: false });

    render(<TrainingLeaderboard />);

    expect(await screen.findByText('Aún no hay datos de entrenamiento.')).toBeTruthy();
  });

  it('ESTÁ MONTADO en el dashboard de la Academia (antes: API viva, componente que nadie importaba)', () => {
    const fuente = readFileSync('components/hubs/AcademiaDashboard.tsx', 'utf8');
    expect(fuente).toContain("import { TrainingLeaderboard } from '@/components/analytics/TrainingLeaderboard'");
    expect(fuente).toContain('<TrainingLeaderboard />');
  });
});

// ── 5. FUENTE: la ruta delega y el modelo respalda la idempotencia ──────────

describe('C5 · fuente: la ruta delega y el esquema respalda el concurso', () => {
  it('la ruta llama a construirRanking y ya no trunca la consulta con take', () => {
    const fuente = readFileSync('app/api/analytics/training/leaderboard/route.ts', 'utf8');
    expect(fuente).toContain('construirRanking(rankingData, users)');
    expect(fuente).not.toMatch(/take:/);
    expect(fuente).not.toContain('Math.round');
  });

  it('la ruta usa el rango del periodo en curso: el reinicio no puede desactivarse sin tocar la prueba', () => {
    const fuente = readFileSync('app/api/analytics/training/leaderboard/route.ts', 'utf8');
    expect(fuente).toContain('rangoPeriodoActual()');
    expect(fuente).toContain('createdAt: { gte: desde, lt: hasta }');
  });

  it('el esquema tiene el unique (tenantId, periodo): una edición, un ganador, sin duplicados', () => {
    const esquema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(esquema).toMatch(/model SalesContestEdition \{[\s\S]*@@unique\(\[tenantId, periodo\]\)/);
  });
});
