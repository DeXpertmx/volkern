/**
 * Tasa de respuesta de las preguntas obligatorias del check-in — Reportes.
 * Módulo PURO, sin BD.
 *
 * Los recordatorios de pre-llegada ya nombran las preguntas obligatorias sin
 * responder (`{{preguntas_pendientes}}`); esta métrica dice si FUNCIONAN. El
 * par que se compara es el par del ciclo completo: cada (reserva, pregunta
 * obligatoria activa) del período está respondida o pendiente, y la tasa de
 * respuesta es respondidas sobre el total. Una tasa baja no acusa al huésped:
 * acusa a las dos causas que el hotel puede arreglar — la plantilla de
 * pre-llegada que ya no lleva la variable o el enlace, y las reservas del
 * canal sin email ni teléfono, a las que ningún recordatorio puede llegar.
 *
 * **Una sola definición de «pendiente».** El conteo no re-implementa la regla:
 * delega en `requeridasPendientes` (el mismo helper que rellena la variable de
 * los recordatorios), así que Reportes y el email al huésped no pueden discrepar
 * sobre qué está sin responder — ni hoy, ni cuando la regla cambie.
 */

import { requeridasPendientes, type PreguntaCheckin } from './checkin-preguntas';

/**
 * Lectura del contacto del huésped dentro del módulo puro. Repetida por lo
 * mismo que `partes-metrics` repite los estados del parte: el original vive en
 * `comunicaciones.ts`, que arrastra la base de datos (y los SDK de envío), y un
 * módulo de métricas no puede depender de eso. La regla es la misma en los dos
 * sitios; si algún día cambia, los tests del módulo la fijan aquí también.
 */
function contactoDeGuestData(guestData: unknown): { email: string; telefono: string } {
  if (!guestData || typeof guestData !== 'object') return { email: '', telefono: '' };
  const gd = guestData as Record<string, unknown>;
  return {
    email: typeof gd.email === 'string' ? gd.email.trim() : '',
    telefono:
      (typeof gd.telefono === 'string' ? gd.telefono.trim() : '') ||
      (typeof gd.phone === 'string' ? gd.phone.trim() : ''),
  };
}

/** Reserva mínima que basta para el conteo (tal como sale de Prisma). */
export interface FilaReservaPreguntas {
  guestData?: unknown;
  respuestasCheckin?: unknown;
}

/** Pregunta mínima: solo la identidad entra en el conteo. */
export interface FilaPreguntaObligatoria {
  id: string;
}

export interface MetricasRespuestaPreguntas {
  /** Pares (reserva del período, pregunta obligatoria activa) ya respondidos. */
  respuestas: number;
  /** El mismo par sin responder: lo que los recordatorios intentan mover. */
  pendientes: number;
  /** Reservas con alguna pendiente y sin email ni teléfono: sin canal posible. */
  sinContacto: number;
  /** respuestas / (respuestas + pendientes); null si no hubo pares que medir. */
  tasaRespuesta: number | null;
  /** Lectura accionable que produce el módulo: la página no interpreta. */
  lectura: string;
}

/**
 * La tasa sobre las reservas del período. Las preguntas activas y requeridas
 * del tenant las trae la ruta; aquí solo se cuentan pares. Una respuesta
 * guardada ya pasó la validación del formulario (solo se guardan valores
 * normalizados), así que `requeridasPendientes` es exactamente «sin responder».
 */
export function metricasRespuestaPreguntas(input: {
  reservas: FilaReservaPreguntas[];
  preguntas: FilaPreguntaObligatoria[];
}): MetricasRespuestaPreguntas {
  const preguntas: PreguntaCheckin[] = input.preguntas.map((p) => ({
    id: p.id,
    tipo: 'texto',
    es: '',
    en: '',
    opciones: null,
    requerida: true,
    orden: 0,
  }));

  let respuestas = 0;
  let pendientes = 0;
  let sinContacto = 0;

  for (const r of input.reservas) {
    const dadas = (r.respuestasCheckin && typeof r.respuestasCheckin === 'object'
      ? r.respuestasCheckin
      : null) as Record<string, string> | null;
    const sinResponder = requeridasPendientes(preguntas, dadas, 'es').length;
    respuestas += preguntas.length - sinResponder;
    pendientes += sinResponder;
    if (sinResponder > 0) {
      const { email, telefono } = contactoDeGuestData(r.guestData);
      if (!email && !telefono) sinContacto += 1;
    }
  }

  const medibles = respuestas + pendientes;
  const tasaRespuesta = medibles > 0 ? respuestas / medibles : null;
  return { respuestas, pendientes, sinContacto, tasaRespuesta, lectura: lecturaRespuestaPreguntas({ respuestas, pendientes, sinContacto, tasaRespuesta }) };
}

function lecturaRespuestaPreguntas(m: {
  respuestas: number;
  pendientes: number;
  sinContacto: number;
  tasaRespuesta: number | null;
}): string {
  if (m.respuestas + m.pendientes === 0) {
    return 'Sin preguntas obligatorias activas en el período: no has definido ninguna, o las reservas del período son anteriores a la primera.';
  }
  if (m.pendientes === 0) {
    return 'Todos los huéspedes del período respondieron sus preguntas obligatorias: los recordatorios están haciendo su trabajo.';
  }
  const pct = Math.round((m.tasaRespuesta ?? 0) * 100);
  return (
    `El ${pct}% de las preguntas obligatorias ya está respondido. Si la tasa es baja, ` +
    'revisa que tu plantilla de pre-llegada lleve {{preguntas_pendientes}} y el enlace del formulario: ' +
    'un recordatorio sin la variable no recuerda nada.'
  );
}

/** La tasa de respuesta a partir de la cual merece un aviso (por debajo). */
export const RESPUESTA_PREGUNTAS_UMBRAL_ALERTA = 0.5;

/** Pares pendientes mínimos para que la tasa no sea ruido. */
export const RESPUESTA_PREGUNTAS_MINIMO_PARA_ALERTA = 3;

/**
 * Aviso accionable cuando la mayoría no responde, o `null` si no lo merece.
 * Las dos causas son de configuración/datos, no de código: la plantilla que
 * perdió la variable, y las reservas sin contacto (que se nombran si existen).
 */
export function alertaRespuestaPreguntas(
  metricas: MetricasRespuestaPreguntas,
  opts?: { umbral?: number; minimoPendientes?: number }
): string | null {
  const umbral = opts?.umbral ?? RESPUESTA_PREGUNTAS_UMBRAL_ALERTA;
  const minimo = opts?.minimoPendientes ?? RESPUESTA_PREGUNTAS_MINIMO_PARA_ALERTA;
  if (metricas.pendientes < minimo) return null;
  if (metricas.tasaRespuesta === null || metricas.tasaRespuesta >= umbral) return null;
  const sinContacto =
    metricas.sinContacto > 0
      ? ` Además, ${metricas.sinContacto} reserva(s) con preguntas pendientes no tienen email ni teléfono: el recordatorio no puede llegarles.`
      : '';
  return (
    `${metricas.pendientes} respuestas obligatorias siguen pendientes. ` +
    'Revisa la plantilla de pre-llegada (evento «Pre-llegada»): debe llevar {{preguntas_pendientes}} ' +
    'y {{enlace_checkin}} para que el huésped sepa qué falta y dónde responderlo.' +
    sinContacto
  );
}
