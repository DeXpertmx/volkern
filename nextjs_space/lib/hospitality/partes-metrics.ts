/**
 * Partes de viajeros sin reintentar — métricas para el panel del HOTEL.
 * Módulo PURO, sin BD.
 *
 * El operador de plataforma ya ve el abandono de partes en el panel de estado de
 * crons (`lib/cron/hospitality-registro-viajeros.ts`, por tenant). Este módulo
 * lleva el mismo dato a quien puede arreglarlo: el hotel, que es el único que
 * tiene los documentos y las credenciales. Dos superficies lo consumen —la
 * pantalla del registro de viajeros (estado, sin ventana) y Reportes (la
 * ventana de 30/90/180 días)— y las dos tienen que contar lo mismo: por eso la
 * definición vive aquí y ninguna de ellas clasifica por su cuenta.
 *
 * **Cómo se lee.** Un parte abandonado es uno que el producto intentó y no
 * consiguió entregar hasta agotar sus intentos, y hay **dos formas** de llegar
 * ahí — el Ministerio lo RECHAZÓ (el dato del huésped no le valía) o el servicio
 * no llegó a RECIBIRLO (`error`: caída, red, timeout) — con acciones distintas:
 * la primera pide corregir el dato, la segunda solo reintentar. El par que se
 * compara es el del ciclo completo del parte — los que el producto cerró sin
 * ayuda (aceptados) frente a los que dejó fuera (sin reintentar) — porque un
 * fallo con intentos por gastar todavía se está reintentando solo, igual que un
 * hold sin caducar.
 *
 * **Lo que NO es abandono** (y por eso no entra en la tasa): un
 * `datos_incompletos` no gasta intentos —no se llama al Ministerio con un parte
 * incompleto— así que el barrido lo sigue revisando (sin gastar intentos); lo
 * que puede
 * cambiar es que el hotel consiga el documento. Contarlos como abandonados
 * señalaría como perdido un parte que solo está esperando al huésped.
 */

import {
  ESTADO_ACEPTADO,
  ESTADO_RECHAZADO,
  ESTADO_SIN_ENTREGAR,
  MAX_INTENTOS_PARTE,
  parteAbandonado,
} from './parte-rechazo';

/**
 * Mismo valor que `ESTADO_REGISTRO.datosIncompletos` (módulo del servicio).
 * Repetido por lo mismo que los otros dos estados del módulo del rechazo: aquí
 * no se puede importar el servicio (arrastra la base de datos) y una lista de
 * partes que no distingue «esperando al huésped» de «rechazado» diría que el
 * hotel tiene partes rotos donde solo le falta un documento.
 */
export const ESTADO_DATOS_INCOMPLETOS = 'datos_incompletos';

/** Fila mínima que basta para clasificar un parte (tal como sale de Prisma). */
export interface FilaParteDeViajeros {
  estado: string;
  intentos?: number | null;
}

/**
 * Clasificación de un parte en el ciclo: en cuál de los desenlaces cae. Es una
 * función y no un `if` dentro del bucle porque la comparten los dos caminos de
 * entrada (filas en la ventana y conteos agregados del panel), y porque el
 * desenlace es lo que decide **qué acción** ofrece el panel: corregir el dato,
 * reintentar, o esperar al huésped.
 */
export type DesenlaceParte = keyof ConteoPartes;

export function desenlaceDeParte(fila: FilaParteDeViajeros): DesenlaceParte {
  if (fila.estado === ESTADO_ACEPTADO) return 'aceptadas';
  // El orden importa: `parteAbandonado` exige un envío intentado —rechazado o
  // sin entregar— con los intentos agotados, así que un incompleto o un aceptado
  // nunca caen aquí.
  const abandonado = parteAbandonado(fila);
  if (fila.estado === ESTADO_RECHAZADO) {
    return abandonado ? 'sinReintentarRechazados' : 'rechazadasEnCurso';
  }
  if (fila.estado === ESTADO_SIN_ENTREGAR) {
    return abandonado ? 'sinReintentarSinEntregar' : 'sinEntregarEnCurso';
  }
  if (fila.estado === ESTADO_DATOS_INCOMPLETOS) return 'esperandoAlHuesped';
  return 'otras';
}

/** Conteo por desenlace. Es la forma agregada de una lista de partes. */
export interface ConteoPartes {
  /** Aceptados por el Ministerio. */
  aceptadas: number;
  /**
   * Rechazados que agotaron sus intentos: el dato del huésped no le valía al
   * Ministerio y el producto dejó de insistir. Se corrige el dato.
   */
  sinReintentarRechazados: number;
  /**
   * Envíos que el servicio no llegó a recibir y agotaron sus intentos: el
   * Ministerio no ha visto ese parte. Se reintenta (y se mira el servicio).
   */
  sinReintentarSinEntregar: number;
  /** Rechazados con intentos por gastar: el barrido todavía insiste. */
  rechazadasEnCurso: number;
  /**
   * Entregas fallidas con intentos por gastar. No es abandono todavía —el
   * barrido lo reintenta con esperas crecientes— pero es la señal temprana de
   * una caída del servicio: contarla antes de que se agoten los intentos evita
   * que el hotel se entere solo cuando ya está sin comunicar.
   */
  sinEntregarEnCurso: number;
  /** Esperando al huésped (`datos_incompletos`): no gastan intentos. */
  esperandoAlHuesped: number;
  /** En vuelo, pendientes, anuladas y demás. */
  otras: number;
}

export interface MetricasPartesViajeros extends ConteoPartes {
  /** Los dos tipos de abandono juntos: es la cifra que se enseña. */
  sinReintentar: number;
  /** Comunicaciones consideradas. */
  total: number;
  /**
   * Partes que el producto cerró sin intervención humana: aceptados o
   * abandonados. Es el denominador de la tasa — un `datos_incompletos` está
   * esperando a una persona, no cerrado.
   */
  cerradas: number;
  /** Tasa de abandono (0..1) o `null` si no hay ningún parte cerrado. */
  tasaSinReintentar: number | null;
}

/** Normaliza un conteo (negativos o valores raros no rompen la tasa). */
function entero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Métricas a partir del conteo por desenlace.
 *
 * La usa la pantalla del registro de viajeros: allí el estado es agregado (un
 * `groupBy` por estado más el conteo de abandonados) y traer todas las filas
 * del tenant solo para contarlas sería cargar la tabla entera en memoria.
 */
export function resumirPartes(conteo: Partial<ConteoPartes>): MetricasPartesViajeros {
  const aceptadas = entero(conteo.aceptadas);
  const sinReintentarRechazados = entero(conteo.sinReintentarRechazados);
  const sinReintentarSinEntregar = entero(conteo.sinReintentarSinEntregar);
  const rechazadasEnCurso = entero(conteo.rechazadasEnCurso);
  const sinEntregarEnCurso = entero(conteo.sinEntregarEnCurso);
  const esperandoAlHuesped = entero(conteo.esperandoAlHuesped);
  const otras = entero(conteo.otras);

  const sinReintentar = sinReintentarRechazados + sinReintentarSinEntregar;
  const total =
    aceptadas +
    sinReintentar +
    rechazadasEnCurso +
    sinEntregarEnCurso +
    esperandoAlHuesped +
    otras;
  const cerradas = aceptadas + sinReintentar;

  return {
    aceptadas,
    sinReintentarRechazados,
    sinReintentarSinEntregar,
    sinReintentar,
    rechazadasEnCurso,
    sinEntregarEnCurso,
    esperandoAlHuesped,
    otras,
    total,
    cerradas,
    tasaSinReintentar: cerradas > 0 ? sinReintentar / cerradas : null,
  };
}

/** Métricas a partir de las filas de los partes de la ventana (Reportes). */
export function metricasPartesViajeros(
  filas: readonly FilaParteDeViajeros[],
): MetricasPartesViajeros {
  const conteo: ConteoPartes = {
    aceptadas: 0,
    sinReintentarRechazados: 0,
    sinReintentarSinEntregar: 0,
    rechazadasEnCurso: 0,
    sinEntregarEnCurso: 0,
    esperandoAlHuesped: 0,
    otras: 0,
  };
  for (const fila of filas) conteo[desenlaceDeParte(fila)] += 1;
  return resumirPartes(conteo);
}

/** Tasa de abandono a partir de la cual el hotel debería mirar. */
export const PARTES_SIN_REINTENTAR_UMBRAL_ALERTA = 0.25;

/** Volumen mínimo de partes cerrados para que la tasa no sea ruido. */
export const PARTES_SIN_REINTENTAR_MINIMO_PARA_ALERTA = 3;

/**
 * Aviso accionable cuando el abandono de partes es alto, o `null` si no lo es.
 *
 * Las dos causas reales de un parte abandonado son de datos, no de código: un
 * documento que el Ministerio no acepta por su formato, o un dato del huésped
 * que no se recogió bien. El aviso las nombra y manda a la pantalla donde se
 * corrige, en vez de alarmar sin salida.
 */
export function alertaPartesSinReintentar(
  metricas: MetricasPartesViajeros,
  opts?: { umbral?: number; minimoCerradas?: number },
): string | null {
  const umbral = opts?.umbral ?? PARTES_SIN_REINTENTAR_UMBRAL_ALERTA;
  const minimo = opts?.minimoCerradas ?? PARTES_SIN_REINTENTAR_MINIMO_PARA_ALERTA;
  if (metricas.cerradas < minimo) return null;
  if (metricas.tasaSinReintentar === null || metricas.tasaSinReintentar < umbral) return null;
  const causas = causasDelAbandono(metricas);
  return (
    `${metricas.sinReintentar} de ${metricas.cerradas} partes cerrados en el período se quedaron sin reintentar: ` +
    `${causas}. Esas estancias están sin comunicar; en Registro de viajeros está el motivo de cada una y lo que ` +
    'hay que hacer (corregir el dato del huésped, o reenviar si el problema era la entrega).'
  );
}

/**
 * Las dos causas posibles del abandono, en una frase. Se nombran por separado
 * porque no se arreglan igual: un rechazo del Ministerio casi siempre es un dato
 * del huésped, y una no-entrega es el servicio del Ministerio o la red (los
 * datos pueden estar perfectos y seguiría sin salir).
 */
function causasDelAbandono(metricas: MetricasPartesViajeros): string {
  const partes: string[] = [];
  if (metricas.sinReintentarRechazados > 0) {
    partes.push(
      `${metricas.sinReintentarRechazados} rechazado(s) por el Ministerio con los intentos agotados`
    );
  }
  if (metricas.sinReintentarSinEntregar > 0) {
    partes.push(
      `${metricas.sinReintentarSinEntregar} que el servicio no llegó a recibir (caída, red o timeout)`
    );
  }
  return partes.length > 0 ? partes.join(' y ') : 'el sistema agotó sus intentos';
}

/**
 * Lectura de la métrica — la misma voz que `alertaHoldsAbandonados`: el módulo
 * dice qué significa la cifra; la página solo la pinta.
 *
 * Con poco volumen la tasa es ruido y se dice: hace falta más muestra.
 */
export function lecturaPartesSinReintentar(metricas: MetricasPartesViajeros): string {
  if (metricas.total === 0) {
    return 'Sin comunicaciones al Ministerio en el período. La comparación aparece en cuanto el registro de viajeros empiece a enviar partes.';
  }
  // Una entrega en curso se nombra aunque no sea abandono: es la señal temprana
  // de una caída del servicio, y el hotel prefiere verla ahora que cuando el
  // parte lleve cinco intentos sin salir.
  const enCurso =
    metricas.sinEntregarEnCurso > 0
      ? ` ${metricas.sinEntregarEnCurso} envío(s) no llegaron al servicio y se están reintentando.`
      : '';
  if (metricas.sinReintentar === 0) {
    const base =
      metricas.cerradas > 0
        ? `Ningún parte se ha quedado sin reintentar: los ${metricas.cerradas} partes cerrados del período ${metricas.cerradas === 1 ? 'está aceptado' : 'están aceptados'} por el Ministerio.`
        : `Todavía no hay partes cerrados en el período (${metricas.esperandoAlHuesped} esperando datos del huésped y ${metricas.rechazadasEnCurso + metricas.sinEntregarEnCurso} en reintento).`;
    return `${base}${enCurso}`;
  }
  const pct = Math.round((metricas.tasaSinReintentar ?? 0) * 100);
  if (metricas.cerradas < PARTES_SIN_REINTENTAR_MINIMO_PARA_ALERTA) {
    return `Con ${metricas.cerradas} parte${metricas.cerradas === 1 ? '' : 's'} cerrado${metricas.cerradas === 1 ? '' : 's'} la tasa (${pct}%) es todavía ruido: revisa los ${metricas.sinReintentar} sin reintentar, pero no saques conclusiones de la proporción.${enCurso}`;
  }
  const causas = causasDelAbandono(metricas);
  return `${metricas.sinReintentar} de ${metricas.cerradas} partes cerrados (${pct}%) se quedaron sin reintentar, frente a ${metricas.aceptadas} aceptados: ${causas}. Un parte sin comunicar es una estancia que el Ministerio no tiene registrada; el motivo de cada uno y su arreglo están en Registro de viajeros.${enCurso}`;
}

/**
 * Tope de intentos vigente, reexportado para que las pantallas que explican el
 * abandono («el barrido agotó sus 5 intentos») no escriban la cifra a mano.
 */
export const MAX_INTENTOS_DEL_PARTE = MAX_INTENTOS_PARTE;
