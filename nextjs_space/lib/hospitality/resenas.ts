/**
 * Reseñas de huésped (hueco nº 1 frente a Lodgify) — módulo PURO.
 *
 * El ciclo: el cron de solicitud (§21) manda al huésped que hizo check-out el
 * enlace con token (`/review/<token>`, ES/EN) → el huésped puntúa y comenta →
 * la reseña nace `pendiente` → el hotel la MODERA (publicar / rechazar) →
 * solo las publicadas salen en la web pública del motor, con su media.
 *
 * Lo que este módulo NO decide: quién recibe el enlace (el cron y la
 * plantilla `resena`) ni dónde se pinta la web (la página pública consulta
 * solo lo publicado). Aquí viven las reglas de VALOR y las TRANSICIONES:
 * qué es una reseña válida, qué puede editar el huésped y qué puede cambiar
 * el hotel sin traicionar la palabra del huésped.
 *
 * La regla de fondo (misma que las preguntas del check-in): la reseña es la
 * palabra del huésped. El hotel puede decidir SI se publica y RESPONDERLA —
 * nunca reescribirla: ni la puntuación ni el comentario se editan desde el
 * dashboard, y la fecha de la estancia es del sistema, no del hotel.
 */

/** Estados de moderación. */
export const ESTADOS_RESENA = ['pendiente', 'publicada', 'rechazada'] as const;
export type EstadoResena = (typeof ESTADOS_RESENA)[number];

/** La puntuación es un 1–5 (el estándar que el huésped reconoce en cualquier OTA). */
export const PUNTUACION_MIN = 1;
export const PUNTUACION_MAX = 5;

/** Longitud máxima del comentario: una reseña no es un contrato. */
export const MAX_COMENTARIO = 2000;
export const MAX_RESPUESTA = 1000;
export const MAX_NOMBRE = 80;

export interface EntradaResena {
  puntuacion: number;
  comentario?: string | null;
  /** Nombre que se mostrará públicamente (por defecto, el del huésped). */
  nombreHuesped?: string | null;
}

export interface ResenaValida {
  puntuacion: number;
  comentario: string;
  nombreHuesped: string;
}

export type ResultadoValidacion =
  | { ok: true; reseña: ResenaValida }
  | { ok: false; error: string };

/**
 * Valida la reseña que envía el huésped desde su enlace. Mensajes pensados
 * para mostrarlos tal cual en el formulario: dicen qué falta, no «error 400».
 */
export function validarResena(entrada: unknown): ResultadoValidacion {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;

  const puntuacion = Number(e.puntuacion);
  if (!Number.isInteger(puntuacion) || puntuacion < PUNTUACION_MIN || puntuacion > PUNTUACION_MAX) {
    return { ok: false, error: `La puntuación debe ser de ${PUNTUACION_MIN} a ${PUNTUACION_MAX}` };
  }

  const comentarioCrudo = typeof e.comentario === 'string' ? e.comentario.trim() : '';
  if (comentarioCrudo.length > MAX_COMENTARIO) {
    return { ok: false, error: `El comentario no puede pasar de ${MAX_COMENTARIO} caracteres` };
  }
  // Saltos sin sentido: el comentario se guarda en una línea limpia (los saltos
  // dobles del huésped se respetan como uno; el resto se normaliza).
  const comentario = comentarioCrudo.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  const nombreCrudo = typeof e.nombreHuesped === 'string' ? e.nombreHuesped.trim() : '';
  if (nombreCrudo.length > MAX_NOMBRE) {
    return { ok: false, error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres` };
  }

  return {
    ok: true,
    reseña: {
      puntuacion,
      comentario,
      nombreHuesped: nombreCrudo,
    },
  };
}

/**
 * La respuesta pública del hotel. Un texto corto, sin guiones ni espacios
 * de más; el hotel puede añadirla o cambiarla — es SU palabra, distinta de
 * la del huésped y por eso vive en su campo.
 */
export function validarRespuestaHotel(respuesta: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  const texto = typeof respuesta === 'string' ? respuesta.trim().slice(0, MAX_RESPUESTA) : '';
  if (respuesta != null && !texto) {
    return { ok: false, error: 'La respuesta no puede quedar vacía (borra del todo para quitarla)' };
  }
  return { ok: true, texto };
}

/**
 * Transiciones de moderación: qué puede hacer el hotel desde cada estado.
 * publicar/rechazar desde pendiente (o reconsiderar la decisión contraria);
 * reponer = volver a `pendiente` — útil si el huésped pide corregir su texto
 * antes de publicarse de nuevo.
 */
export type AccionModeracion = 'publicar' | 'rechazar' | 'reponer';

const TRANSICIONES: Record<AccionModeracion, readonly EstadoResena[]> = {
  publicar: ['pendiente', 'rechazada'],
  rechazar: ['pendiente', 'publicada'],
  reponer: ['publicada', 'rechazada'],
};

export function puedeModerar(estadoActual: string, accion: AccionModeracion): boolean {
  return (TRANSICIONES[accion] || []).includes(estadoActual as EstadoResena);
}

/** El estado al que lleva cada acción (la API lo aplica, el módulo lo decide). */
export function estadoTrasAccion(accion: AccionModeracion): EstadoResena {
  return accion === 'publicar' ? 'publicada' : accion === 'rechazar' ? 'rechazada' : 'pendiente';
}

/**
 * La media pública de una propiedad: la de las RESEÑAS PUBLICADAS, redondeada
 * a un decimal. Sin publicadas no hay media (null): la página no enseña un
 * «0.0» que no significa nada — la ausencia de reseñas es su propia historia.
 */
export function mediaDeResenas(resenas: Array<{ puntuacion: number }>): number | null {
  if (!Array.isArray(resenas) || resenas.length === 0) return null;
  const suma = resenas.reduce((acc, r) => acc + (Number(r.puntuacion) || 0), 0);
  return Math.round((suma / resenas.length) * 10) / 10;
}

/** Lo que la página pública ve de una reseña publicada (nada interno). */
export interface ResenaPublica {
  puntuacion: number;
  comentario: string;
  nombreHuesped: string;
  respuestaHotel: string | null;
  /** Mes y año de la estancia («septiembre 2026»): da contexto sin fechar a nadie. */
  mesEstancia: string;
  /** Canal de origen de la reseña (las importadas lo llevan; las nativas, null). */
  canal: string | null;
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function mesDeEstancia(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Resumen público listo para pintar en la página del motor: media + total +
 * las reseñas (ya filtradas por el caller a `publicada`). La página no
 * calcula nada — la media se decide aquí, una sola vez.
 *
 * La fecha de la estancia sale de la reseña (`fechaEstancia`, columna de las
 * importadas, rellenada por backfill en las nativas) y CAE a la reserva si
 * no estuviera: una sola regla de orden y de «mes» para ambos orígenes.
 */
export function resumenPublicoResenas(
  resenas: Array<{
    puntuacion: number;
    comentario: string | null;
    nombreHuesped: string;
    respuestaHotel: string | null;
    fechaEstancia?: Date | string | null;
    canal?: string | null;
    reservation?: { checkIn?: Date | string | null } | null;
  }>,
  limite = 6
): { media: number | null; total: number; reseñas: ResenaPublica[] } {
  const publicadas = Array.isArray(resenas) ? resenas : [];
  const fechaDe = (r: (typeof publicadas)[number]): Date | null => {
    const propia = r.fechaEstancia ? new Date(r.fechaEstancia) : null;
    if (propia && !Number.isNaN(propia.getTime())) return propia;
    const deReserva = r.reservation?.checkIn ? new Date(r.reservation.checkIn) : null;
    return deReserva && !Number.isNaN(deReserva.getTime()) ? deReserva : null;
  };
  const ordenadas = [...publicadas].sort((a, b) => {
    const fa = fechaDe(a)?.getTime() || 0;
    const fb = fechaDe(b)?.getTime() || 0;
    return fb - fa; // las estancias más recientes primero
  });
  return {
    media: mediaDeResenas(publicadas),
    total: publicadas.length,
    reseñas: ordenadas.slice(0, limite).map((r) => ({
      puntuacion: r.puntuacion,
      comentario: (r.comentario || '').trim(),
      nombreHuesped: (r.nombreHuesped || 'Huésped').trim(),
      respuestaHotel: (r.respuestaHotel || '').trim() || null,
      mesEstancia: mesDeEstancia(fechaDe(r)),
      canal: (r.canal || '').trim() || null,
    })),
  };
}
