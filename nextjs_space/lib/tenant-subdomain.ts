/**
 * Subdominio del tenant (`<subdominio>.volkern.app`).
 *
 * Módulo PURO: lo usan la ruta de admin que lo guarda y sus tests. El alta de
 * un partner lo escribe al crear el tenant; esto es la misma regla, para que
 * corregirlo después no acepte lo que el alta rechazaría.
 */

/** Nombres que ya son de la plataforma (o de una ruta real) y no se ceden. */
export const SUBDOMINIOS_RESERVADOS = [
  'www',
  'app',
  'api',
  'admin',
  'demo',
  'auth',
  'login',
  'register',
  'dashboard',
  'webcreator',
] as const;

export type ResultadoSubdominio =
  | { ok: true; subdominio: string | null }
  | { ok: false; error: string };

/**
 * Normaliza lo que llega del cliente: recorta, pasa a minúsculas y valida.
 *
 * Ausente o vacío (`null`, `undefined`, `''`) = sin subdominio. Un tipo que no
 * sea texto es basura del cliente y se rechaza en vez de borrar en silencio.
 */
export function normalizarSubdominio(valor: unknown): ResultadoSubdominio {
  if (valor === null || valor === undefined) {
    return { ok: true, subdominio: null };
  }
  if (typeof valor !== 'string') {
    return { ok: false, error: 'El subdominio debe ser un texto.' };
  }

  const limpio = valor.trim().toLowerCase();
  if (limpio === '') {
    return { ok: true, subdominio: null };
  }
  if (limpio.length < 3 || limpio.length > 40) {
    return { ok: false, error: 'El subdominio debe tener entre 3 y 40 caracteres.' };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(limpio)) {
    return {
      ok: false,
      error: 'Solo minúsculas, números y guiones: sin empezar ni acabar en guion.',
    };
  }
  if ((SUBDOMINIOS_RESERVADOS as readonly string[]).includes(limpio)) {
    return { ok: false, error: `"${limpio}" está reservado por la plataforma.` };
  }

  return { ok: true, subdominio: limpio };
}
