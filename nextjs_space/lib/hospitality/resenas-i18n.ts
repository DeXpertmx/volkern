import { IDIOMAS, IDIOMA_POR_DEFECTO, interpolar, type Idioma } from './booking-i18n';

/**
 * Textos bilingües de las RESEÑAS (formulario público y sección de la web).
 *
 * El defecto es SIEMPRE español (misma regla que el booking y el check-in):
 * servidor y primer render pintan español y un efecto isomórfico aplica
 * `?lang=` antes del primer paint, sin destello ni mismatch de hidratación.
 * Las dos claves de cada texto y las dos entradas del registro existen
 * SIEMPRE: un texto nuevo no compila hasta que sabe decirse en los dos
 * idiomas — el huésped que reservó en inglés no lee español.
 */

export interface ResenaTextos {
  titulo: string;
  /** Con {unidad} interpolada. */
  intro: string;
  puntuacion: string;
  /** Etiquetas de las estrellas para lectores de pantalla. */
  estrellasAria: string;
  comentario: string;
  comentarioPlaceholder: string;
  nombre: string;
  nombrePlaceholder: string;
  nombreAviso: string;
  enviar: string;
  enviando: string;
  gracias: string;
  graciasDetalle: string;
  /** Reseña ya publicada o rechazada: la palabra ya pasó por el hotel. */
  cerrada: string;
  /** Con {email} interpolado. */
  cerradaContacto: string;
  /** Reseña pendiente: el huésped puede corregirla. */
  editando: string;
  cargando: string;
  noEncontrado: string;
  error: string;
  /** Sección pública del motor: media, total y respuesta del hotel. */
  resenasTitulo: string;
  /** Con {media} y {total} interpolados. */
  resenasResumen: string;
  respuestaHotel: string;
  sinResenas: string;
}

export const RESENA_TEXTOS: Record<Idioma, ResenaTextos> = {
  es: {
    titulo: '¿Cómo fue tu estancia?',
    intro: 'Tu opinión ayuda a otros viajeros y nos ayuda a mejorar. Valora tu estancia en {unidad}.',
    puntuacion: 'Tu puntuación',
    estrellasAria: 'Puntuación: {n} de 5',
    comentario: 'Tu comentario (opcional)',
    comentarioPlaceholder: 'Cuéntanos cómo fue…',
    nombre: 'Nombre que se mostrará',
    nombrePlaceholder: 'P. ej. María G.',
    nombreAviso: 'Nunca publicaremos tu email ni tu teléfono.',
    enviar: 'Enviar reseña',
    enviando: 'Enviando…',
    gracias: '¡Gracias por tu reseña!',
    graciasDetalle: 'La revisará el hotel antes de publicarse en la web.',
    cerrada: 'Tu reseña ya fue revisada por el hotel y no se puede cambiar',
    cerradaContacto: '¿Algo que corregir? Escríbenos a {email}.',
    editando: 'Ya escribiste una reseña. Puedes corregirla hasta que el hotel la revise.',
    cargando: 'Cargando…',
    noEncontrado: 'Este enlace de reseña no es válido',
    error: 'No se pudo guardar la reseña. Inténtalo de nuevo.',
    resenasTitulo: 'Lo que dicen nuestros huéspedes',
    resenasResumen: '{media} de 5 · {total} reseñas',
    respuestaHotel: 'Respuesta del anfitrión',
    sinResenas: 'Aún no hay reseñas publicadas',
  },
  en: {
    titulo: 'How was your stay?',
    intro: 'Your opinion helps other travellers and helps us improve. Rate your stay at {unidad}.',
    puntuacion: 'Your rating',
    estrellasAria: 'Rating: {n} out of 5',
    comentario: 'Your comment (optional)',
    comentarioPlaceholder: 'Tell us how it went…',
    nombre: 'Name to display',
    nombrePlaceholder: 'E.g. María G.',
    nombreAviso: 'We will never publish your email or phone number.',
    enviar: 'Submit review',
    enviando: 'Submitting…',
    gracias: 'Thanks for your review!',
    graciasDetalle: 'The hotel will review it before it goes live on the website.',
    cerrada: 'Your review has already been reviewed by the hotel and cannot be changed',
    cerradaContacto: 'Anything to correct? Email us at {email}.',
    editando: 'You already wrote a review. You can edit it until the hotel reviews it.',
    cargando: 'Loading…',
    noEncontrado: 'This review link is not valid',
    error: 'The review could not be saved. Please try again.',
    resenasTitulo: 'What our guests say',
    resenasResumen: '{media} out of 5 · {total} reviews',
    respuestaHotel: 'Host response',
    sinResenas: 'No published reviews yet',
  },
};

export function textosResena(idioma: Idioma): ResenaTextos {
  return RESENA_TEXTOS[idioma] ?? RESENA_TEXTOS[IDIOMA_POR_DEFECTO];
}

export { IDIOMAS, IDIOMA_POR_DEFECTO, interpolar };
export type { Idioma };
