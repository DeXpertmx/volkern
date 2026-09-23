/**
 * Ranking de cerradores (C5) — módulo PURO.
 *
 * La ruta (`/api/analytics/training/leaderboard`) agrega con Prisma
 * (`groupBy` por usuario: media, máximo y número de sesiones) y este módulo
 * construye las entradas EXACTAS que consume la pantalla
 * (`components/analytics/TrainingLeaderboard.tsx`): cruce con User para
 * nombre y avatar, media redondeada, orden determinista y truncado al top.
 *
 * El desempate es una DECISIÓN, no un accidente: a igual media gana quien
 * MÁS SESIONES completó (la práctica constante vale tanto como el golpe de
 * suerte). El orden de llegada solo decide el empate total.
 */

/** Cuántos cerradores entran en el ranking (la consulta y el módulo: una sola definición). */
export const TOP_RANKING = 10;

/** Sin nombre en User, la fila no se cae: entra con el nombre genérico. */
const NOMBRE_GENERICO = 'Agente de Ventas';

/** Fila tal cual la devuelve el `groupBy` de Prisma (lo que lee el módulo). */
export interface FilaRanking {
  userId: string;
  _avg: { score: number | null };
  _max: { score: number | null };
  _count: { id: number };
}

/** Usuario mínimo necesario para el cruce (lo que lee el módulo). */
export interface UsuarioRanking {
  id: string;
  name: string | null;
  image: string | null;
}

/** Entrada EXACTA que consume la pantalla (su `LeaderboardEntry` es el espejo). */
export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatar: string | null;
  averageScore: number;
  maxScore: number | null;
  totalSessions: number;
}

/**
 * Construye el ranking ordenado (media desc; desempate por sesiones desc;
 * empate total, orden de llegada) y truncado a TOP_RANKING.
 */
export function construirRanking(rankingData: FilaRanking[], users: UsuarioRanking[]): LeaderboardEntry[] {
  const porId = new Map(users.map((u) => [u.id, u]));

  const entradas: LeaderboardEntry[] = rankingData.map((group) => {
    const userData = porId.get(group.userId);
    return {
      userId: group.userId,
      name: userData?.name || NOMBRE_GENERICO,
      avatar: userData?.image || null,
      averageScore: Math.round(group._avg.score || 0),
      maxScore: group._max.score,
      totalSessions: group._count.id,
    };
  });

  entradas.sort(
    (a, b) => b.averageScore - a.averageScore || b.totalSessions - a.totalSessions
  );

  return entradas.slice(0, TOP_RANKING);
}

// ── El concurso: ediciones MENSUALES (C5) ───────────────────────────────────

/** Cada edición cubre un MES NATURAL completo, en hora local del servidor — la misma regla de las ventanas de recepción de Hospitality. */
export const TIPO_EDICION = 'mensual' as const;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Clave del periodo de una fecha: `AAAA-MM` del mes NATURAL local. La misma
 * fecha siempre produce la misma clave — el cierre de una edición es
 * reproducible y el unique (tenantId, periodo) hace el resto.
 */
export function clavePeriodo(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * El rango [desde, hasta) del periodo `AAAA-MM`: el mes natural completo.
 * Sirve para el where de las sesiones del periodo — la edición es el mes
 * entero, no «los últimos 30 días».
 */
export function rangoPeriodo(clave: string): { desde: Date; hasta: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(clave);
  if (!m) throw new Error(`Periodo inválido: ${clave}`);
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) throw new Error(`Periodo inválido: ${clave}`);
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 1) };
}

/** Nombre legible del periodo para la pantalla: «septiembre 2026». */
export function nombrePeriodo(clave: string): string {
  const { desde } = rangoPeriodo(clave);
  return `${MESES[desde.getMonth()]} ${desde.getFullYear()}`;
}

/**
 * El ganador de una edición: la PRIMERA entrada del ranking del periodo (el
 * orden — media desc, desempate por sesiones — ya lo decidió
 * construirRanking). Sin ranking, no hay ganador: se devuelve null y la
 * edición no se cierra (un mes sin práctica no corona a nadie).
 */
export function ganadorDe(ranking: LeaderboardEntry[]): LeaderboardEntry | null {
  return ranking[0] ?? null;
}
