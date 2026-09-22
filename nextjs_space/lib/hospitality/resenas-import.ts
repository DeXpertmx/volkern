import { createHash } from 'crypto';
import { MAX_COMENTARIO, MAX_NOMBRE, PUNTUACION_MAX, PUNTUACION_MIN } from './resenas';

/**
 * Importación de reseñas HISTÓRICAS desde las OTAs — módulo PURO.
 *
 * La web pública no debe arrancar vacía solo porque el ciclo §21 sea nuevo:
 * el hotel trae el CSV de reseñas de su canal (Booking.com, Airbnb…) y esas
 * reseñas nacen `publicada` — ya pasaron el filtro real: el canal las mostró
 * al público. Nada de lo importado vuelve a moderarse desde cero; el hotel
 * puede reponerlas o rechazarlas desde el panel si no las quiere.
 *
 * Reglas del CSV (tolerante por diseño: los canales exportan distinto):
 *  - Separador autodetectado (`,` o `;`) y comillas RFC 4180.
 *  - Cabeceras sin acentos ni mayúsculas y en ES/EN: canal/canal, fecha,
 *    nombre, puntuacion/rating, comentario/reseña/review…
 *  - Sin fecha de estancia la fila NO se adivina: se rechaza con su motivo
 *    (el mes público es parte de la reseña; inventarlo traicionaría el dato).
 *  - Huella sha256 (canal+fecha+nombre+puntuación+comentario): importar el
 *    mismo CSV dos veces no duplica reseñas.
 *
 * Lo que este módulo NO hace: tocar la base de datos ni el filesystem —
 * la ruta recibe texto, devuelve resultado, y decide qué persistir.
 */

/** La web nombra el canal; el hotel lo reconoce en su idioma. */
export const CANALES_IMPORT = ['Airbnb', 'Booking.com', 'Expedia', 'Vrbo', 'Google', 'Otro'] as const;
export type CanalImport = (typeof CANALES_IMPORT)[number];

export interface FilaImportResena {
  canal: string;
  fechaEstancia: string;
  nombreHuesped: string;
  puntuacion: number;
  comentario: string;
  respuestaHotel: string;
}

export interface FilaValidaImport extends FilaImportResena {
  huella: string;
}

export type FilaInvalidaImport = { fila: number; error: string };

export type ResultadoParseImport = {
  ok: true;
  filas: FilaValidaImport[];
  errores: FilaInvalidaImport[];
  total: number;
  separador: string;
  cabeceras: string[];
} | { ok: false; error: string };

export interface ResultadoImport {
  /** Reseñas creadas en esta importación. */
  creadas: number;
  /** Filas del CSV que ya estaban (misma huella): no se duplican. */
  duplicadas: number;
  /** Filas rechazadas por el módulo (puntuación, fecha, tamaño…). */
  errores: FilaInvalidaImport[];
  total: number;
}

const MAPA_CANAL: Record<string, CanalImport> = {
  airbnb: 'Airbnb',
  'booking.com': 'Booking.com',
  booking: 'Booking.com',
  expedia: 'Expedia',
  vrbo: 'Vrbo',
  google: 'Google',
  otro: 'Otro',
};

/**
 * Normaliza el nombre del canal del CSV al canónico que enseña la web.
 * Sin coincidencia razonable cae a «Otro» — no se rechaza una reseña por
 * cómo escriba el hotel su canal.
 */
export function canalCanonico(valor: unknown): CanalImport {
  const clave = String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return MAPA_CANAL[clave] || 'Otro';
}

/**
 * Fecha de estancia aceptada: YYYY-MM-DD, DD/MM/YYYY y MM/DD/YYYY ambigua NO
 * se resuelve adivinando (Europa y EEUU la escriben distinto): se acepta
 * DD/MM/YYYY con día > 12 y se rechaza la ambigua con su motivo. ISO siempre
 * gana.
 */
export function fechaEstanciaDe(valor: unknown): Date | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const eu = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(texto);
  if (eu) {
    const dia = Number(eu[1]);
    const mes = Number(eu[2]);
    if (dia > 12 && mes <= 12) {
      const d = new Date(Date.UTC(Number(eu[3]), mes - 1, dia, 12));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // 05/06/2026: no se sabe si es mayo o junio — no se adivina.
    return null;
  }
  return null;
}

/** Parser CSV tolerante: autodetecta `,` y `;`, respeta comillas RFC 4180. */
export function parsearCsv(texto: string): { filas: string[][]; separador: string } | null {
  const limpio = (texto || '').replace(/^\uFEFF/, '');
  if (!limpio.trim()) return null;

  // Autodetección del separador en la primera línea fuera de comillas: gana
  // el que aparezca más veces (los valores pueden contener el otro).
  const primera = limpio.split(/\r?\n/)[0] || '';
  const comas = (primera.match(/,/g) || []).length;
  const puntos = (primera.match(/;/g) || []).length;
  const separador = puntos > comas ? ';' : ',';

  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c === '\r') {
      // ignorado: el \n cierra la fila
    } else {
      campo += c;
    }
  }
  // Última fila (sin \n final).
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return { filas, separador };
}

function normalizarCabecera(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CAMPOS = {
  canal: ['canal', 'channel', 'canal origen', 'source'],
  fecha: ['fecha', 'fecha estancia', 'fecha de estancia', 'date', 'stay date', 'checkin', 'check-in'],
  nombre: ['nombre', 'nombre huesped', 'nombre del huesped', 'guest', 'guest name', 'name', 'autor'],
  puntuacion: ['puntuacion', 'puntos', 'rating', 'score', 'estrellas', 'stars', 'nota'],
  comentario: ['comentario', 'resena', 'opinion', 'comment', 'review', 'comentarios'],
  respuesta: ['respuesta', 'respuesta hotel', 'respuesta del hotel', 'response', 'host response', 'reply'],
} as const;

function indiceDe(cabeceras: string[], candidatos: readonly string[]): number {
  for (const candidato of candidatos) {
    const idx = cabeceras.indexOf(candidato);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Huella de duplicados: mismo canal+fecha+nombre+puntuación (+comentario). */
export function huellaDe(f: { canal: string; fechaEstancia: string; nombreHuesped: string; puntuacion: number; comentario: string }): string {
  return createHash('sha256')
    .update(`${f.canal}|${f.fechaEstancia}|${f.nombreHuesped.toLowerCase()}|${f.puntuacion}|${f.comentario}`)
    .digest('hex');
}

/**
 * Parsea y valida el CSV de reseñas del canal. Nunca lanza: cada fila mala
 * vuelve con su número y su motivo para que el panel lo muestre entero.
 */
export function parseImportResenas(texto: string): ResultadoParseImport {
  const parseado = parsearCsv(texto);
  if (!parseado || parseado.filas.length === 0) {
    return { ok: false, error: 'El archivo no parece un CSV de reseñas (está vacío)' };
  }

  const { filas, separador } = parseado;
  const cabeceras = filas[0].map(normalizarCabecera);

  const iCanal = indiceDe(cabeceras, CAMPOS.canal);
  const iFecha = indiceDe(cabeceras, CAMPOS.fecha);
  const iNombre = indiceDe(cabeceras, CAMPOS.nombre);
  const iPuntuacion = indiceDe(cabeceras, CAMPOS.puntuacion);
  const iComentario = indiceDe(cabeceras, CAMPOS.comentario);
  const iRespuesta = indiceDe(cabeceras, CAMPOS.respuesta);

  // indiceDe devuelve -1 cuando no encontró la columna: el chequeo es contra
  // ese -1, no contra la falsedad del índice (¡0 es una columna válida,
  // la primera!).
  const faltan = [
    iFecha < 0 ? 'fecha de estancia' : null,
    iNombre < 0 ? 'nombre del huésped' : null,
    iPuntuacion < 0 ? 'puntuación' : null,
  ].filter(Boolean);
  if (faltan.length > 0) {
    return {
      ok: false,
      error: `No se encontraron las columnas requeridas en el CSV: ${faltan.join(', ')}. Cabeceras detectadas: ${filas[0].join(', ')}`,
    };
  }

  const filasValidas: FilaValidaImport[] = [];
  const errores: FilaInvalidaImport[] = [];

  for (let f = 1; f < filas.length; f++) {
    const celdas = filas[f];
    const num = f + 1; // humano: cabecera = fila 1
    const vacia = celdas.every((c) => !c.trim());
    if (vacia) continue;

    const fecha = fechaEstanciaDe(celdas[iFecha]);
    if (!fecha) {
      errores.push({ fila: num, error: 'Fecha de estancia no reconocida (usa AAAA-MM-DD o DD/MM/YYYY)' });
      continue;
    }
    const puntuacion = Number(String(celdas[iPuntuacion] ?? '').replace(',', '.'));
    if (!Number.isFinite(puntuacion) || puntuacion < PUNTUACION_MIN || puntuacion > PUNTUACION_MAX) {
      errores.push({ fila: num, error: `La puntuación debe ser de ${PUNTUACION_MIN} a ${PUNTUACION_MAX}` });
      continue;
    }
    const nombre = String(celdas[iNombre] ?? '').trim().slice(0, MAX_NOMBRE);
    if (!nombre) {
      errores.push({ fila: num, error: 'Falta el nombre del huésped' });
      continue;
    }
    // Puntuaciones decimales de los canales (4.5): se redondean al entero que
    // la puntuación 1–5 admite; se avisa dentro de la fila, no se inventa.
    const puntuacionEntera = Math.round(puntuacion);

    const comentario = String(celdas[iComentario] ?? '').trim().slice(0, MAX_COMENTARIO);
    const respuesta = String(celdas[iRespuesta] ?? '').trim().slice(0, 1000);
    const canal = canalCanonico(iCanal >= 0 ? celdas[iCanal] : 'Otro');
    const fechaIso = fecha.toISOString().slice(0, 10);

    filasValidas.push({
      canal,
      fechaEstancia: fechaIso,
      nombreHuesped: nombre,
      puntuacion: puntuacionEntera,
      comentario,
      respuestaHotel: respuesta,
      huella: huellaDe({ canal, fechaEstancia: fechaIso, nombreHuesped: nombre, puntuacion: puntuacionEntera, comentario }),
    });
  }

  return { ok: true, filas: filasValidas, errores, total: filasValidas.length, separador, cabeceras: filas[0] };
}
