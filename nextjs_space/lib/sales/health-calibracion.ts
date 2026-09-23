/**
 * Calibración del health score (C6) — módulo PURO (sin BD, sin HTTP).
 *
 * El score 100 − estancamiento 40 − actividad 40 − SLA 20 y los cortes
 * 75/50/30 son hipótesis de arranque. Los pesos "se congelaron" con la
 * guardia de C6 para que nadie los mueva sin querer; esta pieza es el otro
 * lado: con el DATASET de instantáneas (`HealthSnapshot` — score, entradas y
 * desenlace del deal) se puede empezar a responder si el score ordena bien
 * y, con datos, proponer cortes en vez de defender los de siempre.
 *
 * Definiciones (las únicas del sistema):
 *  - Snapshot ÚTIL: el último de un deal con desenlace conocido. La muestra
 *    es 1 por deal cerrado — contar instantáneas inflaría la confianza con
 *    deals que fueron recalculados más veces.
 *  - "Perdido con señal" (verdadero positivo): el último snapshot del deal
 *    cayó por debajo del corte. "Ganado sin señal" (verdadero negativo):
 *    se mantuvo en o por encima del corte.
 *  - Precisión: de lo que el score marcó en riesgo, cuánto se perdió de
 *    verdad. Recall: de lo que se perdió, cuánto había marcado.
 *
 * La regla de fondo: esta pieza NO decide nada — evalúa. Cambiar pesos o
 * cortes sigue siendo una decisión de producto que pasa por la guardia de
 * C6, que congela el comportamiento actual hasta que se cambie a propósito.
 */

export const CORTE_ALERTA = 50; // el corte CRITICAL del health score

/** Instantánea mínima que consume el módulo (la forma de HealthSnapshot en BD). */
export interface SnapshotCalibracion {
  dealId: string;
  healthScore: number;
  healthStatus: string;
  diasSinMovimiento: number;
  diasSinActividad: number;
  slaVencido: boolean;
  desenlace: string | null;
  createdAt: Date;
}

export type Desenlace = 'ganado' | 'perdido';

export interface ResumenDesenlace {
  desenlace: Desenlace;
  deals: number;
  /** Media aritmética del último snapshot de cada deal; null sin muestra. */
  scoreMedio: number | null;
  /** Último snapshot bajo el corte CRITICAL (50), en deals cerrados. */
  bajoElCorte: number;
}

/** Deja el ÚLTIMO snapshot por deal (el dataset es 1 fila por deal cerrado). */
export function ultimosPorDeal(snapshots: SnapshotCalibracion[]): Map<string, SnapshotCalibracion> {
  const ultimos = new Map<string, SnapshotCalibracion>();
  for (const s of snapshots) {
    const previo = ultimos.get(s.dealId);
    if (!previo || previo.createdAt <= s.createdAt) {
      ultimos.set(s.dealId, s);
    }
  }
  return ultimos;
}

/** Resumen por desenlace: cuántos deals cerrados, su score medio y cuántos bajaron del corte. */
export function resumenPorDesenlace(snapshots: SnapshotCalibracion[]): ResumenDesenlace[] {
  const cerrados = [...ultimosPorDeal(snapshots).values()].filter(
    (s): s is SnapshotCalibracion & { desenlace: Desenlace } =>
      s.desenlace === 'ganado' || s.desenlace === 'perdido'
  );

  const construir = (desenlace: Desenlace): ResumenDesenlace => {
    const filas = cerrados.filter(s => s.desenlace === desenlace);
    const scoreMedio =
      filas.length > 0
        ? Math.round(filas.reduce((acc, s) => acc + s.healthScore, 0) / filas.length)
        : null;
    return {
      desenlace,
      deals: filas.length,
      scoreMedio,
      bajoElCorte: filas.filter(s => s.healthScore < CORTE_ALERTA).length,
    };
  };

  return [construir('ganado'), construir('perdido')];
}

export interface EvaluacionCorte {
  corte: number;
  verdaderosPositivos: number;
  falsosPositivos: number;
  verdaderosNegativos: number;
  falsosNegativos: number;
  precision: number | null; // de lo marcado en riesgo, cuánto se perdió
  recall: number | null; // de lo perdido, cuánto estaba marcado
}

/** ¿Qué pasaría con otro corte? Evalúa el corte dado sobre el dataset cerrado. */
export function evaluarCorte(snapshots: SnapshotCalibracion[], corte: number = CORTE_ALERTA): EvaluacionCorte {
  const cerrados = [...ultimosPorDeal(snapshots).values()].filter(
    (s): s is SnapshotCalibracion & { desenlace: Desenlace } =>
      s.desenlace === 'ganado' || s.desenlace === 'perdido'
  );

  const vp = cerrados.filter(s => s.desenlace === 'perdido' && s.healthScore < corte).length;
  const fp = cerrados.filter(s => s.desenlace === 'ganado' && s.healthScore < corte).length;
  const vn = cerrados.filter(s => s.desenlace === 'ganado' && s.healthScore >= corte).length;
  const fn = cerrados.filter(s => s.desenlace === 'perdido' && s.healthScore >= corte).length;

  return {
    corte,
    verdaderosPositivos: vp,
    falsosPositivos: fp,
    verdaderosNegativos: vn,
    falsosNegativos: fn,
    precision: vp + fp > 0 ? Math.round((vp / (vp + fp)) * 100) : null,
    recall: vp + fn > 0 ? Math.round((vp / (vp + fn)) * 100) : null,
  };
}

/** El score separa los desenlaces: la media de perdidos debe caer por debajo de la de ganados. */
export function elScoreSepara(snapshots: SnapshotCalibracion[]): boolean | null {
  const [ganados, perdidos] = resumenPorDesenlace(snapshots);
  if (!ganados.scoreMedio || !perdidos.scoreMedio) return null; // sin muestra no hay veredicto
  return perdidos.scoreMedio < ganados.scoreMedio;
}

/** Color de la muestra en la UI de calibración (semáforo de confianza estadística). */
export function colorDeMuestra(deals: number): string {
  if (deals === 0) return 'gris'; // sin datos: nada que calibrar
  if (deals < 20) return 'rojo'; // muestra insuficiente: el número engaña
  if (deals < 100) return 'ambar'; // señal orientativa, no conclusión
  return 'verde'; // suficiente para mover pesos con argumento
}
