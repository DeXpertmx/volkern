/**
 * Estados, conceptos y etiquetas de la fianza — módulo PURO, sin BD.
 *
 * La fianza vive como LÍNEA de reserva (`tipo: 'fianza'`) y su ciclo se
 * reconoce por el `concepto`: pendiente → cobrada → devuelta | aplicada a
 * daños. Esa lectura la necesitan dos mundos que no pueden compartir módulo:
 *
 *  - el SERVIDOR (la API `.../reservations/[id]/fianza`), que sí abre la BD y
 *    por eso vive en `lib/hospitality/fianza.ts`;
 *  - el NAVEGADOR (la ficha de reservas), que pinta la etiqueta del estado y
 *    solo necesita literales.
 *
 * Cuando las etiquetas vivían dentro de `fianza.ts`, el componente cliente
 * importaba ese archivo y —como no marcaba el import de tipo— el bundler
 * arrastraba `lib/db.ts` entero al bundle del navegador: Prisma se construía en
 * el cliente y la página reventaba con «Extensions.defineExtension is unable to
 * run in this browser environment» y, de rebote, con el error de hidratación
 * #423 de React. La regla es la de siempre: si el navegador lo necesita, aquí;
 * si necesita la BD, en `fianza.ts`.
 *
 * `lib/hospitality/fianza.ts` reexporta todo esto, así que la superficie
 * pública del módulo no cambió.
 */

/** Tipo de línea de reserva que representa la fianza. */
export const TIPO_LINEA_FIANZA = 'fianza';

export interface EstadoFianza {
  /** Existe línea de fianza registrada. */
  existe: boolean;
  /** Concepto actual: pendiente | cobrada | devuelta | aplicada_daños | null. */
  estado: 'pendiente' | 'cobrada' | 'devuelta' | 'aplicada_daños' | null;
  /** Importe registrado (o lo que queda tras compensar daños). */
  importe: number | null;
  moneda: string | null;
  itemId: string | null;
  /** Fecha en la que se cambió de estado por última vez (fechaEdicion). */
  actualizadaEn: Date | null;
}

/** Estado de una reserva sin línea de fianza: no hay depósito del huésped. */
export function fianzaAusente(): EstadoFianza {
  return { existe: false, estado: null, importe: null, moneda: null, itemId: null, actualizadaEn: null };
}

/**
 * Traduce el `concepto` de la línea al estado del ciclo. Única definición de la
 * correspondencia: el servidor y cualquier vista futura deben usar esta función
 * en lugar de repetir `concepto.includes(...)`.
 */
export function estadoDesdeConcepto(concepto: string): NonNullable<EstadoFianza['estado']> {
  if (concepto.includes('Cobrada')) return 'cobrada';
  if (concepto.includes('Devuelta')) return 'devuelta';
  if (concepto.includes('Aplicada')) return 'aplicada_daños';
  return 'pendiente';
}

export const CONCEPTOS: Record<NonNullable<EstadoFianza['estado']>, string> = {
  pendiente: 'Fianza (pendiente de cobro)',
  cobrada: 'Fianza (cobrada — devolver a la salida)',
  devuelta: 'Fianza (devuelta a la salida)',
  'aplicada_daños': 'Fianza (aplicada a daños)',
};

/** Etiquetas legibles del estado, para la ficha y los listados. */
export const ETIQUETA_FIANZA: Record<NonNullable<EstadoFianza['estado']>, string> = {
  pendiente: 'Pendiente de cobro',
  cobrada: 'Cobrada — devolver a la salida',
  devuelta: 'Devuelta',
  'aplicada_daños': 'Aplicada a daños',
};

export type ResultadoFianza =
  | { ok: true; accion: 'registrada' | 'cobrada' | 'devuelta' | 'aplicada'; importe: number; moneda: string; itemId: string }
  | { ok: false; motivo: string; error: string };
