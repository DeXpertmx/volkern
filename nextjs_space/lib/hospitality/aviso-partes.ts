/**
 * lib/hospitality/aviso-partes.ts
 *
 * El email que avisa al hotel de sus partes de viajeros SIN REINTENTAR.
 *
 * La pantalla lo enseña, pero solo lo ve quien entra a mirar: un parte que el
 * barrido abandonó es una estancia que el Ministerio no va a recibir hasta que
 * una persona lo corrija o lo reenvíe, y eso no puede depender de que alguien
 * abra el panel. Este módulo construye el mensaje; el envío (a quién, cuándo,
 * con qué deduplicación) vive en el barrido, que es quien sabe cuándo un parte
 * acaba de agotar sus intentos.
 *
 * Módulo PURO: sin base de datos, sin envío, sin reloj (la fecha entra por
 * parámetro). Así el cuerpo que llega al email es exactamente el que prueban
 * los tests, y el barrido no puede desviarse del texto guardado.
 */

import {
  ESTADO_RECHAZADO,
  ESTADO_SIN_ENTREGAR,
  MAX_INTENTOS_PARTE,
} from './parte-rechazo';

/** Tipo de log con el que el aviso deja su marca de envío (y su auditoría). */
export const TIPO_AVISO_PARTES = 'aviso_partes_sin_reintentar';

/**
 * Partes que se detallan con su línea propia. Un hotel con quince partes
 * abandonadas no lee quince líneas: el resto se cuenta («… y N más») y el
 * listado completo sigue en la pantalla, que es donde se puede actuar.
 */
export const MAX_PARTES_EN_EMAIL = 5;

/** La fecha de la última edición, en texto corto (UTC, determinista). */
function formatoFechaCorta(fecha: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return (
    `${p2(fecha.getUTCDate())}/${p2(fecha.getUTCMonth() + 1)}` +
    ` ${p2(fecha.getUTCHours())}:${p2(fecha.getUTCMinutes())}`
  );
}

/** Referencia de la reserva, con la id como último recurso para no dejar un hueco. */
function referenciaDe(parte: ParteParaAviso): string {
  return parte.referencia?.trim() || parte.id;
}

/** La causa, con el verbo que distingue arreglar el dato de mirar el servicio. */
function causaDe(estado: string): string {
  return estado === ESTADO_SIN_ENTREGAR
    ? 'sin respuesta del servicio'
    : estado === ESTADO_RECHAZADO
      ? 'rechazado por el Ministerio'
      : estado; // Un estado nuevo no debe romper el aviso: se muestra tal cual.
}

/** Lo que dijo el servicio, recortado para que una traza larga no rompa el email. */
function descripcionDe(descripcion: string | null | undefined): string {
  const texto = (descripcion ?? '').replace(/\s+/g, ' ').trim();
  if (!texto) return '';
  return texto.length > 140 ? `${texto.slice(0, 139)}…` : texto;
}

/** Datos mínimos de un parte para construir su línea del aviso. */
export interface ParteParaAviso {
  id: string;
  referencia: string | null;
  estado: string;
  descripcion: string | null;
  intentos: number | null;
  fechaEdicion: Date | string;
}

/** Una línea por parte: qué reserva, por qué paró, cuántas veces lo intentó el sistema. */
export function lineasDePartes(partes: ParteParaAviso[]): string[] {
  return partes.slice(0, MAX_PARTES_EN_EMAIL).map((parte) => {
    const fecha =
      parte.fechaEdicion instanceof Date
        ? parte.fechaEdicion
        : new Date(parte.fechaEdicion);
    const lineas = [
      `• ${referenciaDe(parte)}`,
      causaDe(parte.estado),
      `${parte.intentos ?? 0}/${MAX_INTENTOS_PARTE} intentos`,
      `último ${formatoFechaCorta(fecha)} UTC`,
    ];
    const descripcion = descripcionDe(parte.descripcion);
    if (descripcion) lineas.push(descripcion);
    return lineas.join(' · ');
  });
}

/** Asunto del email: el total real, para que se pueda filtrar sin abrirlo. */
export function asuntoAvisoPartes(total: number): string {
  return `Partes de viajeros sin comunicar (${total})`;
}

/**
 * Cuerpo del aviso en texto plano. Vacío si no hay partes: un email «en vacío»
 * entrenaría al hotel a ignorarlo.
 *
 * `total` cuenta los partes que el email DETALLA (los nuevos); `yaAvisados`
 * suma los que el hotel ya recibió en un aviso anterior, para que el email no
 * disimule el tamaño real del problema ni repita lo que ya se contó.
 */
export function cuerpoAvisoPartes(params: {
  tenant: string;
  partes: ParteParaAviso[];
  /** Total de partes nuevos que detalla el email. */
  total?: number;
  /** Partes sin reintentar que ya constaban en el último aviso del hotel. */
  yaAvisados?: number;
}): string {
  const { tenant, partes } = params;
  const total = params.total ?? partes.length;
  const yaAvisados = params.yaAvisados ?? 0;
  if (partes.length === 0 || total <= 0) return '';

  const resto = Math.max(0, total - Math.min(partes.length, MAX_PARTES_EN_EMAIL));
  return (
    `El sistema de registro de viajeros de "${tenant}" dejó de reintentar ` +
    `${total} parte(s) tras ${MAX_INTENTOS_PARTE} intentos: esas estancias ` +
    'NO están comunicadas al Ministerio y seguirán así hasta que alguien las ' +
    'corrija o las reenvíe.\n\n' +
    lineasDePartes(partes).join('\n') +
    (resto > 0 ? `\n… y ${resto} más.` : '') +
    (yaAvisados > 0
      ? `\n(En total hay ${total + yaAvisados} partes sin reintentar: los demás ya constaban en tu último aviso.)`
      : '') +
    '\n\nRevísalos en Hospitalidad → Registro de viajeros, tarjeta ' +
    '«Partes sin reintentar»: ' +
    'allí tienes «Corregir los datos» (rechazos de datos) o «Reenviar el parte».'
  );
}

/** Escapa el texto que va dentro del HTML (referencias y motivos vienen del servicio). */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** El mismo aviso en HTML, a partir del mismo texto (una sola fuente de verdad). */
export function htmlAvisoPartes(params: {
  tenant: string;
  partes: ParteParaAviso[];
  total?: number;
  /** Partes sin reintentar que ya constaban en el último aviso del hotel. */
  yaAvisados?: number;
  /** Base para el enlace al panel (p. ej. https://volkern.app). */
  baseUrl?: string;
}): string {
  const texto = cuerpoAvisoPartes(params);
  if (!texto) return '';

  const base = (params.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app')
    .replace(/\/+$/, '');
  const url = `${base}/dashboard/hospitality/registro-viajeros`;

  const parrafos = texto.split('\n\n').map((parrafo) => {
    const seguro = escapar(parrafo);
    // La explicación inicial va en negrita: es la que dice «no están comunicadas».
    if (parrafo.startsWith('El sistema de registro de viajeros')) {
      return `<p><strong>${seguro}</strong></p>`;
    }
    if (parrafo.startsWith('• ') || parrafo.startsWith('… y ')) {
      // Las líneas del detalle conservan su salto de línea para que se lean como lista.
      return `<p style="white-space:pre-line">${seguro}</p>`;
    }
    return `<p>${seguro}</p>`;
  });

  return (
    parrafos.join('\n') +
    `\n<p><a href="${escapar(url)}">Abrir Registro de viajeros</a></p>`
  );
}
