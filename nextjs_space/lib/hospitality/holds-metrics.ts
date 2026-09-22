/**
 * Métricas de holds caducados — módulo PURO, sin BD.
 *
 * Cada caducidad del barrido `lib/cron/hospitality-holds.ts` deja un `AuditLog`
 * (`accion: 'hospitality_hold_expirado'`, `entidad: 'reservation'`) con la
 * ventana aplicada en `metadata`. Este módulo convierte esas filas en las
 * métricas que el operador de plataforma necesita ver **sin leer los logs**:
 * cuántos holds caducaron, en qué tenants y propiedades, cuándo fue el último
 * y con qué ventana media.
 *
 * La invariante de la vertical se respeta igual que en la analítica: el cálculo
 * vive aquí y las rutas solo cargan filas y delegan.
 *
 * Lectura de las métricas: un goteo de holds caducados es el sistema
 * funcionando (retenciones que nadie confirmó). Un pico sostenido en un tenant
 * suele significar una de dos cosas: su ventana `holdHoras` es demasiado corta
 * para su operación, o los canales están confirmando tarde — ambas se arreglan
 * con configuración, no con código.
 */

/** Evento ya normalizado, listo para agregar. */
export interface EventoHoldCaducado {
  tenantId: string;
  propertyId: string | null;
  /** Cuándo caducó (fecha de la auditoría). */
  fecha: Date;
  /** Ventana aplicada en horas; `null` si no es legible. */
  horasRetencion: number | null;
}

/** Fila de `AuditLog` tal como llega de la BD (`metadata` es JSON libre). */
export interface FilaAuditHold {
  tenantId: string | null;
  metadata: unknown;
  fechaCreacion: Date;
}

/**
 * Normaliza una fila de auditoría al evento. Devuelve `null` si no hay tenant
 * (una métrica sin tenant no es accionable) o si la fecha no es válida.
 * Un `metadata` corrupto no descarta el evento: cuenta, sin ventana.
 */
export function eventoDesdeAudit(fila: FilaAuditHold): EventoHoldCaducado | null {
  if (!fila.tenantId) return null;
  if (!(fila.fechaCreacion instanceof Date) || Number.isNaN(fila.fechaCreacion.getTime())) {
    return null;
  }

  const meta = (fila.metadata ?? {}) as Record<string, unknown>;
  const propertyId = typeof meta.propertyId === 'string' ? meta.propertyId : null;
  const horas = Number(meta.horasRetencion);

  return {
    tenantId: fila.tenantId,
    propertyId,
    fecha: fila.fechaCreacion,
    horasRetencion: Number.isFinite(horas) && horas > 0 ? horas : null,
  };
}

/** Ventana por defecto de las métricas: 30 días. */
export const HOLD_METRICAS_VENTANA_POR_DEFECTO = 30;

/** Tope de la ventana: un año (más allá no aporta y encarece la consulta). */
export const HOLD_METRICAS_VENTANA_MAXIMA = 365;

/** Ventana efectiva a partir de un valor de query: entero 1..365, o el defecto. */
export function ventanaHoldDias(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(n)) return HOLD_METRICAS_VENTANA_POR_DEFECTO;
  const dias = Math.trunc(n);
  if (dias < 1 || dias > HOLD_METRICAS_VENTANA_MAXIMA) {
    return HOLD_METRICAS_VENTANA_POR_DEFECTO;
  }
  return dias;
}

export interface MetricasHoldsAbandonados {
  /** Holds que murieron sin confirmar en la ventana. */
  caducados: number;
  /** Holds que SÍ se confirmaron en la ventana. */
  confirmados: number;
  /** Holds cerrados = caducados + confirmados (el denominador de la tasa). */
  cerrados: number;
  /** Tasa de abandono (0..1) o `null` si no hubo ningún hold cerrado. */
  tasaAbandono: number | null;
}

/**
 * Tasa de abandono de holds: `caducados / (caducados + confirmados)`.
 *
 * Es el par exacto del ciclo de un hold: uno que caducó (nadie lo confirmó a
 * tiempo) frente a uno que se confirmó. Ambos lados salen de la auditoría
 * (`hospitality_hold_expirado` del barrido y `hospitality_hold_confirmado` de
 * la confirmación), así que la tasa no depende de contadores que puedan
 * desviarse.
 *
 * **Cómo leerla:** con pocos holds (2-3) la tasa es ruido; con volumen, una
 * tasa alta sostenida significa una de dos cosas — la ventana de retención de
 * la propiedad es más corta que el tiempo que tardan en decidir, o los canales
 * están confirmando tarde. Las dos se arreglan en configuración.
 */
export function metricasHoldsAbandonados(input: {
  caducados: number;
  confirmados: number;
}): MetricasHoldsAbandonados {
  const caducados = Math.max(0, Math.trunc(Number(input.caducados) || 0));
  const confirmados = Math.max(0, Math.trunc(Number(input.confirmados) || 0));
  const cerrados = caducados + confirmados;
  return {
    caducados,
    confirmados,
    cerrados,
    tasaAbandono: cerrados > 0 ? caducados / cerrados : null,
  };
}

/** Umbral de tasa de abandono a partir del cual merece un aviso. */
export const HOLD_ABANDONO_UMBRAL_ALERTA = 0.5;

/** Volumen mínimo de holds cerrados para que la tasa no sea ruido. */
export const HOLD_ABANDONO_MINIMO_PARA_ALERTA = 3;

/**
 * Aviso accionable cuando el abandono de holds es alto, o `null` si no lo es.
 * Las dos causas posibles (ventana corta o canales que confirman tarde) son de
 * configuración, no de código: el aviso las nombra en vez de alarmar.
 */
export function alertaHoldsAbandonados(
  metricas: MetricasHoldsAbandonados,
  opts?: { umbral?: number; minimoHolds?: number }
): string | null {
  const umbral = opts?.umbral ?? HOLD_ABANDONO_UMBRAL_ALERTA;
  const minimo = opts?.minimoHolds ?? HOLD_ABANDONO_MINIMO_PARA_ALERTA;
  if (metricas.cerrados < minimo) return null;
  if (metricas.tasaAbandono === null || metricas.tasaAbandono < umbral) return null;
  return (
    `${metricas.caducados} de ${metricas.cerrados} holds caducaron sin confirmar. ` +
    'Revisa la ventana de retención de tus propiedades: o es más corta que el ' +
    'tiempo que tardan en decidir, o tus canales están confirmando tarde.'
  );
}

export interface MetricasHoldsTenant {
  tenantId: string;
  caducados: number;
  /** Propiedades distintas afectadas (los `null` no cuentan). */
  propiedadesAfectadas: number;
  ultimoCaducado: Date | null;
  /** Media de la ventana aplicada, a un decimal (null si ninguna legible). */
  horasRetencionMedia: number | null;
}

export interface ResumenHoldsCaducados {
  ventanaDias: number;
  /** Inicio inclusive de la ventana aplicada. */
  desde: Date;
  /** Total de holds caducados en la ventana (todos los tenants). */
  total: number;
  /** Un registro por tenant con actividad, ordenado por caducados desc. */
  tenants: MetricasHoldsTenant[];
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Agrega los eventos por tenant dentro de la ventana.
 *
 * - La ventana es `fecha >= ahora - dias`. **Sin cota superior**: una fila con
 *   fecha unos milisegundos por delante de `ahora` es lo normal (la BD escribe
 *   `now()` después de calcular la ventana, y los relojes de app y BD derivan).
 *   Descartarla dejaría el panel sin la caducidad más reciente de forma
 *   sistemática, así que todo lo que ya ocurrió cuenta.
 * - `null` en `horasRetencion` no rompe la media: cuenta el hold, se salta el valor.
 * - Orden estable: caducados desc y, a igualdad, `tenantId` asc.
 */
export function agregarHoldsCaducados(
  eventos: EventoHoldCaducado[],
  opts: { ahora: Date; dias: number }
): ResumenHoldsCaducados {
  const dias = ventanaHoldDias(opts.dias);
  const desde = new Date(opts.ahora.getTime() - dias * MS_POR_DIA);

  const acumulado = new Map<
    string,
    {
      caducados: number;
      propiedades: Set<string>;
      ultimo: Date | null;
      sumaHoras: number;
      conHoras: number;
    }
  >();

  for (const evento of eventos) {
    const t = evento.fecha.getTime();
    if (Number.isNaN(t) || t < desde.getTime()) continue;

    const actual =
      acumulado.get(evento.tenantId) ?? {
        caducados: 0,
        propiedades: new Set<string>(),
        ultimo: null,
        sumaHoras: 0,
        conHoras: 0,
      };

    actual.caducados += 1;
    if (evento.propertyId) actual.propiedades.add(evento.propertyId);
    if (!actual.ultimo || t > actual.ultimo.getTime()) actual.ultimo = evento.fecha;
    if (evento.horasRetencion !== null) {
      actual.sumaHoras += evento.horasRetencion;
      actual.conHoras += 1;
    }

    acumulado.set(evento.tenantId, actual);
  }

  const tenants: MetricasHoldsTenant[] = Array.from(acumulado.entries()).map(
    ([tenantId, a]) => ({
      tenantId,
      caducados: a.caducados,
      propiedadesAfectadas: a.propiedades.size,
      ultimoCaducado: a.ultimo,
      horasRetencionMedia:
        a.conHoras > 0 ? Math.round((a.sumaHoras / a.conHoras) * 10) / 10 : null,
    })
  );

  tenants.sort((a, b) => b.caducados - a.caducados || a.tenantId.localeCompare(b.tenantId));

  const total = tenants.reduce((acc, t) => acc + t.caducados, 0);

  return { ventanaDias: dias, desde, total, tenants };
}
