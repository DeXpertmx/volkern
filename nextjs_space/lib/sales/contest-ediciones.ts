import { prisma } from '@/lib/db';
import {
  construirRanking,
  clavePeriodo,
  ganadorDe,
  nombrePeriodo,
  rangoPeriodo,
  TIPO_EDICION,
  TOP_RANKING,
} from './leaderboard';

/**
 * Servicio del CONCURSO de cerradores (C5): ediciones mensuales con ganador.
 *
 * El módulo puro (`leaderboard.ts`) decide qué es un periodo (`AAAA-MM`), cómo
 * se ordena y quién gana; este servicio es la única vía de escritura de
 * ediciones y la única lectura que la ruta necesita.
 *
 * El cierre es ON-READ e IDEMPOTENTE: la primera lectura del ranking tras
 * terminar un mes congela su ganador con las sesiones de ESE mes. El unique
 * `(tenantId, periodo)` respalda la carrera: dos lecturas simultáneas
 * compiten, el perdedor entra por el catch y el estado queda bien igual. Si
 * un mes no tuvo práctica, no se cierra edición — no se corona a nadie.
 */

/** El ganador congelado de una edición cerrada (lo que consume la pantalla). */
export interface EdicionCerrada {
  periodo: string;
  nombre: string;
  ganadorId: string;
  ganadorNombre: string;
  mediaGanador: number;
  sesionesGanador: number;
  cerradoEn: Date;
}

/** Estado completo del concurso para la pantalla. */
export interface EstadoConcurso {
  tipo: typeof TIPO_EDICION;
  /** La edición EN CURSO: el mes natural en curso, aún sin ganador. */
  periodoActual: { clave: string; nombre: string };
  /** Ediciones cerradas, de la más reciente a la más antigua. */
  cerradas: EdicionCerrada[];
}

const estadoCerrada = (
  fila: { periodo: string; ganadorId: string; ganadorNombre: string; mediaGanador: number; sesionesGanador: number; cerradoEn: Date }
): EdicionCerrada => ({
  periodo: fila.periodo,
  nombre: nombrePeriodo(fila.periodo),
  ganadorId: fila.ganadorId,
  ganadorNombre: fila.ganadorNombre,
  mediaGanador: fila.mediaGanador,
  sesionesGanador: fila.sesionesGanador,
  cerradoEn: fila.cerradoEn,
});

/**
 * Cierra todas las ediciones pendientes del tenant: desde la última cerrada
 * (o el primer mes con sesiones) hasta el mes ANTERIOR al actual. El mes en
 * curso NUNCA se cierra — aún se está jugando.
 */
export async function cerrarEdicionesPendientes(tenantId: string): Promise<number> {
  const ahora = new Date();
  const periodoActual = clavePeriodo(ahora);
  const { hasta: finDelMesAnterior } = rangoPeriodo(periodoActual);

  // 1. El primer mes con sesiones del tenant: antes no hay nada que cerrar.
  const primera = await prisma.trainingSession.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (!primera) return 0;

  // 2. La última edición ya cerrada: de ahí hacia adelante hay huecos.
  const ultima = await prisma.salesContestEdition.findFirst({
    where: { tenantId },
    orderBy: { periodo: 'desc' },
    select: { periodo: true },
  });

  let cursor = primera.createdAt;
  if (ultima) {
    const { hasta: finDeLaUltima } = rangoPeriodo(ultima.periodo);
    if (finDeLaUltima > cursor) cursor = finDeLaUltima;
  }
  if (cursor >= finDelMesAnterior) return 0; // nada pendiente: solo el mes en curso

  // 3. Agregación por usuario de las sesiones del hueco (meses pendientes).
  const rankingData = await prisma.trainingSession.groupBy({
    by: ['userId'],
    where: { tenantId, createdAt: { gte: cursor, lt: finDelMesAnterior } },
    _avg: { score: true },
    _count: { id: true },
    _max: { score: true },
  });
  if (rankingData.length === 0) return 0;

  const userIds = rankingData.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, image: true },
  });

  // 4. Sin el ranking global de la vista: por MES. Se recorren los meses del
  // hueco y se cierra cada uno con las sesiones de ESE mes (el ganador de una
  // edición no depende de sesiones de otros meses).
  const cerradas: number[] = [];
  let cursorMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  while (cursorMes < finDelMesAnterior) {
    const clave = clavePeriodo(cursorMes);
    const { desde, hasta } = rangoPeriodo(clave);

    const dataMes = await prisma.trainingSession.groupBy({
      by: ['userId'],
      where: { tenantId, createdAt: { gte: desde, lt: hasta } },
      _avg: { score: true },
      _count: { id: true },
      _max: { score: true },
    });

    if (dataMes.length > 0) {
      const userIdsMes = dataMes.map((r) => r.userId);
      const usersMes = await prisma.user.findMany({
        where: { id: { in: userIdsMes } },
        select: { id: true, name: true, image: true },
      });

      const ranking = construirRanking(dataMes, usersMes);
      const ganador = ganadorDe(ranking);

      if (ganador) {
        try {
          await prisma.salesContestEdition.create({
            data: {
              tenantId,
              periodo: clave,
              ganadorId: ganador.userId,
              ganadorNombre: ganador.name,
              mediaGanador: ganador.averageScore,
              sesionesGanador: ganador.totalSessions,
            },
          });
          cerradas.push(1);
        } catch {
          // Carrera perdida contra otra lectura: la edición ya está cerrada.
          // El estado sigue siendo correcto — se lee en el paso 5.
        }
      }
    }
    cursorMes = new Date(cursorMes.getFullYear(), cursorMes.getMonth() + 1, 1);
  }

  return cerradas.length;
}

/**
 * Estado del concurso para la pantalla: cierra lo pendiente y devuelve el
 * periodo en curso con las ediciones cerradas (de la más reciente a la más
 * antigua). Si el cierre falla, se degrada elegante: la pantalla sigue viendo
 * lo ya cerrado y el ranking del mes en curso.
 */
export async function estadoConcurso(tenantId: string): Promise<EstadoConcurso> {
  try {
    await cerrarEdicionesPendientes(tenantId);
  } catch (e) {
    console.error('[Concurso] El cierre on-read falló; se sirve el estado sin cerrar:', e);
  }

  const ahora = new Date();
  const claveActual = clavePeriodo(ahora);

  const filas = await prisma.salesContestEdition.findMany({
    where: { tenantId },
    orderBy: [{ periodo: 'desc' }],
    take: TOP_RANKING * 2, // la historia reciente basta para la pantalla
  });

  return {
    tipo: TIPO_EDICION,
    periodoActual: { clave: claveActual, nombre: nombrePeriodo(claveActual) },
    cerradas: filas.map(estadoCerrada),
  };
}

/**
 * El rango del periodo EN CURSO: para el where del ranking de la ruta (el
 * ranking de pantalla es el de ESTE MES, no el histórico).
 */
export function rangoPeriodoActual(now: Date = new Date()) {
  return rangoPeriodo(clavePeriodo(now));
}
