/**
 * Exportación CSV de reservas con sus respuestas de check-in — módulo PURO.
 *
 * La lista del día de recepción: llegadas y salidas con el teléfono, el
 * documento y las respuestas a las preguntas del hotel en columnas propias,
 * para trabajar sin entrar reserva a reserva. La recepción trabaja sobre la
 * MISMA lista que ya filtra la pantalla (los filtros viajan en la URL), así
 * que el CSV no inventa un segundo criterio: los convierte en filas.
 *
 * El CSV lleva BOM UTF-8 y separador `;` (el Excel de las recepciones, en
 * locale con coma decimal, separa columnas con `;`).
 */

import { escaparCampoCsv } from '@/lib/hospitality/csv';

/** Fila mínima que la ruta de exportación entrega por cada reserva. */
export interface ReservaExportable {
  referencia: string;
  estado: string;
  huesped: string;
  email: string;
  telefono: string;
  propiedad: string;
  unidad: string;
  checkIn: string; // AAAA-MM-DD (día local de la estancia)
  checkOut: string;
  noches: number;
  canal: string;
  importe: number | null;
  moneda: string;
  parteEstado: string; // estado del parte de viajeros ('' = sin traza)
  respuestas: Record<string, string>; // {preguntaId: valor ya normalizado}
}

/** Columnas fijas del CSV, con su cabecera legible. */
export const COLUMNAS_FIJAS_RESERVAS_CSV: Array<{ clave: keyof Omit<ReservaExportable, 'respuestas'>; cabecera: string }> = [
  { clave: 'referencia', cabecera: 'Referencia' },
  { clave: 'estado', cabecera: 'Estado' },
  { clave: 'huesped', cabecera: 'Huésped' },
  { clave: 'email', cabecera: 'Email' },
  { clave: 'telefono', cabecera: 'Teléfono' },
  { clave: 'propiedad', cabecera: 'Propiedad' },
  { clave: 'unidad', cabecera: 'Unidad' },
  { clave: 'checkIn', cabecera: 'Entrada' },
  { clave: 'checkOut', cabecera: 'Salida' },
  { clave: 'noches', cabecera: 'Noches' },
  { clave: 'canal', cabecera: 'Canal' },
  { clave: 'importe', cabecera: 'Importe' },
  { clave: 'moneda', cabecera: 'Moneda' },
  { clave: 'parteEstado', cabecera: 'Parte de viajeros' },
];

/**
 * Convierte una fecha en su día local AAAA-MM-DD (la estancia vive en días,
 * no en instantes UTC). Es el día local del SERVIDOR, la misma regla con la
 * que el planning pinta los días: una sola definición de «día» en todo el
 * módulo, de modo que el CSV diga el día que la recepción ve en pantalla.
 */
export function diaLocalIso(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/**
 * Las columnas del CSV: las fijas más UNA POR PREGUNTA del hotel, en su orden
 * de formulario. Sin preguntas no hay columnas extra (el CSV sigue sirviendo
 * como lista del día).
 */
export function columnasDeReservasCsv(preguntas: Array<{ id: string; texto: string }>): string[] {
  return [
    ...COLUMNAS_FIJAS_RESERVAS_CSV.map((c) => c.cabecera),
    ...preguntas.map((p) => p.texto),
  ];
}

/**
 * Una reserva → fila del CSV (array de celdas alineado con
 * `columnasDeReservasCsv`). Las respuestas van en las columnas de sus
 * preguntas; si el hotel desactivó una pregunta con respuestas guardadas,
 * la columna ya no existe y el dato no aparece — es lo correcto: la lista
 * del día es del hotel de hoy.
 */
export function filaDeReservaCsv(
  reserva: ReservaExportable,
  preguntas: Array<{ id: string; texto: string }>
): string[] {
  const fijas = COLUMNAS_FIJAS_RESERVAS_CSV.map((c) => {
    const valor = reserva[c.clave];
    return valor == null ? '' : String(valor);
  });
  const dePreguntas = preguntas.map((p) => reserva.respuestas?.[p.id] ?? '');
  return [...fijas, ...dePreguntas];
}

/**
 * Construye el CSV completo (BOM UTF-8, `;`, CRLF, escape RFC 4180 a través
 * de `escaparCampoCsv`). Devuelve cadena vacía si no hay reservas: la ruta
 * decide qué responder (404 razonado en vez de un CSV sin filas).
 */
export function construirReservasCsv(
  reservas: ReservaExportable[],
  preguntas: Array<{ id: string; texto: string }>
): string {
  if (!Array.isArray(reservas) || reservas.length === 0) return '';
  const columnas = columnasDeReservasCsv(preguntas);
  const lineas: string[] = [columnas.map((c) => escaparCampoCsv(c)).join(';')];
  for (const reserva of reservas) {
    lineas.push(filaDeReservaCsv(reserva, preguntas).map((celda) => escaparCampoCsv(celda)).join(';'));
  }
  return `\uFEFF${lineas.join('\r\n')}`;
}

/** Nombre del archivo: reservas-2026-09-21.csv (fecha UTC de la exportación). */
export function nombreArchivoReservasCsv(hasta: Date = new Date()): string {
  return `reservas-${hasta.toISOString().slice(0, 10)}.csv`;
}
