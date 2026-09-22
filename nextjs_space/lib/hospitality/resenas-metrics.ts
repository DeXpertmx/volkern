import { mediaDeResenas } from './resenas';

/**
 * Métricas de RESEÑAS para Reportes — módulo PURO.
 *
 * El hotel ya recibe reseñas por dos vías (ciclo §21 por token e histórico
 * importado de OTAs): aquí se cruzan para responder tres preguntas — ¿cómo
 * puntuán los huéspedes?, ¿dónde?, ¿mejora con el tiempo? La página de
 * Reportes no calcula nada: la lectura accionable se decide aquí, una sola
 * vez, como en preguntas-metrics e idiomas.
 *
 * Lo que este módulo NO decide: el período (lo da la ruta con su ventana de
 * días) ni qué es «publicada» (la BD ya viene filtrada por estado).
 */

/** Reseña ya publicada, tal como la consume el resumen público. */
export interface ResenaMetrica {
  propertyId: string | null;
  canal: string | null;
  puntuacion: number;
  fechaEstancia: Date | string | null;
  reservation?: { checkIn?: Date | string | null } | null;
}

export interface ResenasPorPropiedad {
  propertyId: string;
  nombre: string;
  total: number;
  media: number | null;
}

export interface ResenasPorCanal {
  canal: string;
  total: number;
  media: number | null;
}

export interface ResenasPorMes {
  /** Clave YYYY-MM para el gráfico/orden; la página la etiqueta. */
  mes: string;
  total: number;
  media: number | null;
}

export interface MetricasResenas {
  total: number;
  media: number | null;
  porPropiedad: ResenasPorPropiedad[];
  porCanal: ResenasPorCanal[];
  /** Últimos meses con actividad, del más antiguo al más reciente. */
  porMes: ResenasPorMes[];
  /** Lectura accionable (1–2 frases), ya redactada para la página. */
  lectura: string;
}

/** Etiqueta del mes para la página: «sep 2026» (no depende del locale). */
export function etiquetaMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  const ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${ABREV[idx]} ${m[1]}` : mes;
}

/** Fecha de estancia de la reseña: su columna, o la reserva si faltara. */
function fechaDe(r: ResenaMetrica): Date | null {
  const propia = r.fechaEstancia ? new Date(r.fechaEstancia) : null;
  if (propia && !Number.isNaN(propia.getTime())) return propia;
  const deReserva = r.reservation?.checkIn ? new Date(r.reservation.checkIn) : null;
  return deReserva && !Number.isNaN(deReserva.getTime()) ? deReserva : null;
}

/**
 * Métricas de reseñas publicadas del período. El orden de porMes es del más
 * antiguo al más reciente (una evolución se lee de izquierda a derecha) y los
 * meses sin reseñas no se inventan: si el hotel pasó 3 meses sin reseñas, la
 * línea no finge actividad.
 */
export function metricasResenas(
  resenas: ResenaMetrica[],
  propiedades: Array<{ id: string; nombre: string }>,
): MetricasResenas {
  const lista = Array.isArray(resenas) ? resenas : [];

  // Por propiedad: TODAS las del tenant, también las sin reseñas (la media
  // «—» de una propiedad silenciosa también es información para el operador).
  const porPropiedad: ResenasPorPropiedad[] = propiedades.map((p) => {
    const propias = lista.filter((r) => r.propertyId === p.id);
    return {
      propertyId: p.id,
      nombre: p.nombre,
      total: propias.length,
      media: mediaDeResenas(propias),
    };
  });

  // Por canal: solo los que tienen reseñas (un canal sin reseñas no es una
  // fila: es que el canal no reseña). «Nativa» es el canal de las §21.
  const conteoCanal = new Map<string, number[]>();
  for (const r of lista) {
    const canal = (r.canal || '').trim() || 'Nativa';
    const puntuaciones = conteoCanal.get(canal) || [];
    puntuaciones.push(r.puntuacion);
    conteoCanal.set(canal, puntuaciones);
  }
  const porCanal: ResenasPorCanal[] = [...conteoCanal.entries()]
    .map(([canal, puntuaciones]) => ({
      canal,
      total: puntuaciones.length,
      media: mediaDeResenas(puntuaciones.map((p) => ({ puntuacion: p }))),
    }))
    .sort((a, b) => b.total - a.total);

  // Evolución mensual por fecha de ESTANCIA (no de importación): importa
  // cuándo se vivió la estancia, no cuándo llegó el CSV.
  const conteoMes = new Map<string, number[]>();
  for (const r of lista) {
    const fecha = fechaDe(r);
    if (!fecha) continue;
    const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const puntuaciones = conteoMes.get(clave) || [];
    puntuaciones.push(r.puntuacion);
    conteoMes.set(clave, puntuaciones);
  }
  const porMes: ResenasPorMes[] = [...conteoMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, puntuaciones]) => ({
      mes,
      total: puntuaciones.length,
      media: mediaDeResenas(puntuaciones.map((p) => ({ puntuacion: p }))),
    }));

  const total = lista.length;
  const media = mediaDeResenas(lista);
  const lectura = lecturaDe({ total, media, porPropiedad, porCanal, porMes });

  return { total, media, porPropiedad, porCanal, porMes, lectura };
}

/** Lectura accionable: qué mirar, sin adornos. */
function lecturaDe(m: Omit<MetricasResenas, 'lectura'>): string {
  if (m.total === 0) {
    return 'Sin reseñas publicadas en el período: pide reseñas a los huéspedes que ya salieron o importa el histórico de tu canal.';
  }

  const partes: string[] = [];
  partes.push(
    m.media !== null
      ? `${m.total} reseñas publicadas con una media de ${m.media.toFixed(1)} sobre 5.`
      : `${m.total} reseñas publicadas.`,
  );

  if (m.porCanal.length > 1) {
    const mejor = m.porCanal.reduce((a, b) => ((b.media ?? 0) > (a.media ?? 0) ? b : a));
    if (mejor.media != null && mejor.media >= (m.media ?? 0) + 0.3) {
      partes.push(`El canal más generoso es ${mejor.canal} (${mejor.media.toFixed(1)}).`);
    }
    const peor = m.porCanal.reduce((a, b) => ((b.media ?? 5) < (a.media ?? 5) ? b : a));
    if (peor.media != null && peor.media <= (m.media ?? 5) - 0.3) {
      partes.push(`${peor.canal} va por detrás (${peor.media.toFixed(1)}): revisa qué falla en esas estancias.`);
    }
  }

  if (m.porMes.length >= 2) {
    const ultimo = m.porMes[m.porMes.length - 1];
    const anterior = m.porMes[m.porMes.length - 2];
    if (ultimo.media != null && anterior.media != null && ultimo.media !== anterior.media) {
      const delta = ultimo.media - anterior.media;
      partes.push(
        delta > 0
          ? `La media del último mes (${etiquetaMes(ultimo.mes)}, ${ultimo.media.toFixed(1)}) sube ${delta.toFixed(1)} respecto al anterior: las mejoras están calando.`
          : `La media del último mes (${etiquetaMes(ultimo.mes)}, ${ultimo.media.toFixed(1)}) baja ${Math.abs(delta).toFixed(1)} respecto al anterior: merece una mirada.`,
      );
    }
  }

  return partes.join(' ');
}
