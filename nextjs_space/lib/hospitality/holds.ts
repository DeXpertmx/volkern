/**
 * Caducidad de holds `pending` — módulo PURO, sin BD.
 *
 * Una reserva `pending` es una **retención**: bloquea la unidad en todas las
 * vistas mientras nadie decide. Eso es correcto mientras la decisión está en
 * curso, pero nada la caducaba — un hold olvidado bloqueaba la unidad
 * indefinidamente (observación abierta de
 * `docs/hospitality-estados-auditoria.md`, ahora cerrada).
 *
 * Reglas:
 *
 *  - **Solo caducan las `pending`.** Cualquier otro estado ya tiene dueño
 *    (confirmada, en curso, terminada, cancelada…): no se toca.
 *  - **Con pagos registrados NO caduca.** Emitir un hold por el que ya entró
 *    dinero destruiría un cobro real; ese caso es una decisión humana (el
 *    operador confirma o cancela), no un barrido automático.
 *  - **La ventana es por propiedad** (`holdHoras`, defecto 24 h): un hotel
 *    puede retener 2 h y otro 48 h. `0` significa **sin caducidad automática**
 *    — el Anfitrión vuelve al comportamiento anterior (el hold decide a mano).
 *  - **Caducar es cancelar**: el hold no produjo nada (no ocupó, no facturó),
 *    así que muere como una cancelada. Así el vocabulario de `estados.ts` no
 *    crece y toda la vertical (motor, analítica, planning, finanzas) ya sabe
 *    qué hacer con una reserva cancelada.
 */

/** Horas de retención por defecto de una propiedad sin configuración. */
export const HOLD_HORAS_POR_DEFECTO = 24;

/** Sin caducidad automática: el hold solo lo cierra una persona. */
export const HOLD_HORAS_MINIMO = 0;

/** Tope razonable (30 días): más que eso no es una retención, es una edición. */
export const HOLD_HORAS_MAXIMO = 24 * 30;

/**
 * Acción de auditoría que deja cada hold caducado. Es la fuente de las
 * métricas por tenant (`holds-metrics.ts`) y del panel de administración:
 * una sola definición, para que el barrido y el panel no se desincronicen.
 */
export const ACCION_AUDIT_HOLD_CADUCADO = 'hospitality_hold_expirado';

/**
 * Acción de auditoría que deja un hold `pending` que se CONFIRMÓ. Es el par
 * del evento de caducidad: con los dos, la tasa de abandono de holds
 * (caducados / cerrados) es exacta, sin contadores paralelos que se desvíen.
 */
export const ACCION_AUDIT_HOLD_CONFIRMADO = 'hospitality_hold_confirmado';

const MS_POR_HORA = 60 * 60 * 1000;

/**
 * Normaliza la entrada a un número, o `null` si no es un valor numérico.
 *
 * `null`, `undefined`, `''` y los booleanos NO son 0: `Number(null)` es 0, y
 * tomarlo por bueno desactivaría la caducidad ante un payload incompleto
 * (justo lo que esta regla prohíbe: un valor ausente no decide nada).
 */
function normalizarHoras(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Ventana efectiva de una propiedad: la suya si es un entero válido en rango,
 * si no el defecto. Un valor corrupto (o ausente) en la BD no cambia el
 * criterio en silencio (mismo patrón que `politicaEfectiva` del no-show).
 */
export function holdHorasEfectivas(valor: unknown): number {
  const n = normalizarHoras(valor);
  if (n === null) return HOLD_HORAS_POR_DEFECTO;
  const horas = Math.trunc(n);
  if (horas < HOLD_HORAS_MINIMO || horas > HOLD_HORAS_MAXIMO) {
    return HOLD_HORAS_POR_DEFECTO;
  }
  return horas;
}

/**
 * ¿Es una ventana configurable válida? (para validar en las APIs)
 * Ausente o no numérico → no válido: «sin caducidad» se pide con un 0 explícito.
 */
export function esHoldHorasValidas(valor: unknown): boolean {
  const n = normalizarHoras(valor);
  return (
    n !== null &&
    Number.isInteger(n) &&
    n >= HOLD_HORAS_MINIMO &&
    n <= HOLD_HORAS_MAXIMO
  );
}

/**
 * Cuándo cumple la ventana un hold creado en `fechaCreacion`.
 * `null` cuando no caduca nunca (`horas <= 0`).
 */
export function fechaCaducidadHold(
  fechaCreacion: Date,
  horas: number
): Date | null {
  if (!Number.isFinite(horas) || horas <= 0) return null;
  return new Date(fechaCreacion.getTime() + horas * MS_POR_HORA);
}

/** Datos mínimos de la reserva que necesita la regla. */
export interface HoldEvaluable {
  estado: string;
  fechaCreacion: Date;
  /** ¿La reserva tiene algún pago registrado? (pendiente, parcial o pagado). */
  tienePagos?: boolean;
}

/** Por qué un hold NO caduca (útil para la UI y para el cron). */
export type MotivoNoCaduca =
  | 'no_es_pending'
  | 'sin_caducidad_configurada'
  | 'tiene_pagos'
  | 'dentro_de_plazo';

export interface EvaluacionHold {
  caduca: boolean;
  motivo: MotivoNoCaduca | null;
  /** Ventana aplicada (la efectiva de la propiedad). */
  horasRetencion: number;
  /** Instante en que cumple la ventana (null si no caduca nunca). */
  caducaEl: Date | null;
}

/**
 * Evalúa la caducidad de un hold. Es la única definición de la regla: el cron
 * solo aporta los datos (estado, creación y si hay pagos).
 */
export function evaluarHold(
  hold: HoldEvaluable,
  ahora: Date,
  horas: number
): EvaluacionHold {
  const horasRetencion = horas;
  const caducaEl = fechaCaducidadHold(hold.fechaCreacion, horasRetencion);

  if (hold.estado !== 'pending') {
    return { caduca: false, motivo: 'no_es_pending', horasRetencion, caducaEl };
  }
  if (caducaEl === null) {
    return {
      caduca: false,
      motivo: 'sin_caducidad_configurada',
      horasRetencion,
      caducaEl,
    };
  }
  if (hold.tienePagos) {
    return { caduca: false, motivo: 'tiene_pagos', horasRetencion, caducaEl };
  }
  if (caducaEl.getTime() > ahora.getTime()) {
    return { caduca: false, motivo: 'dentro_de_plazo', horasRetencion, caducaEl };
  }
  return { caduca: true, motivo: null, horasRetencion, caducaEl };
}

/** Atajo booleano de `evaluarHold`. */
export function caducaHold(
  hold: HoldEvaluable,
  ahora: Date,
  horas: number
): boolean {
  return evaluarHold(hold, ahora, horas).caduca;
}
