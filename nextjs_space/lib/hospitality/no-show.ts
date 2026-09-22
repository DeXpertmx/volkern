/**
 * Penalización por no-show — módulo PURO, sin BD.
 *
 * El no-show **no ocupa** la unidad (regla 7 del plan: la habitación vuelve al
 * inventario vendible). Eso no significa que no cobre: un huésped que no se
 * presenta, habiendo bloqueado la habitación, deja una penalización que el
 * hotel emite y cobra. Son dos hechos distintos y este módulo solo se ocupa
 * del segundo:
 *
 *   - **inventario** → `aportaProduccion` dice que no ocupa (`estados.ts`);
 *   - **cobro**      → aquí se decide cuánto se emite.
 *
 * Ninguna métrica de ocupación o de ingreso por alojamiento debe leer la
 * penalización: no es ADR, no es RevPAR, no son noches vendidas. Es un cargo
 * de cancelación.
 *
 * Reglas:
 *  - **Política** (`ninguna | primera_noche | estancia_completa`): cuánto se
 *    cobra. Por defecto, **la primera noche** — la habitación se retuvo esa
 *    noche y el huésped no llegó—, que es la práctica habitual del sector.
 *    Cobrar la estancia completa es para tarifas garantizadas/no reembolsables.
 *  - **Sin doble cargo**: si la reserva viene de un canal externo (OTA), la
 *    penalización la cobra el canal al huésped y la liquida en la factura del
 *    hotel; emitirla también desde Volkern sería cobrar dos veces. Ante una
 *    duda de canal, **no se emite**: es peor cobrar dos veces que no cobrar.
 *  - **Sin importe no hay cargo**: si la reserva no trae importe, no se inventa
 *    uno (la penalización se emite a mano desde Finanzas si procede).
 */

/** Cuánto se cobra cuando el huésped no se presenta. */
export type PoliticaNoShow = 'ninguna' | 'primera_noche' | 'estancia_completa';

export const POLITICAS_NO_SHOW = ['ninguna', 'primera_noche', 'estancia_completa'] as const;

/** Política por defecto de una propiedad: la primera noche. */
export const POLITICA_NO_SHOW_POR_DEFECTO: PoliticaNoShow = 'primera_noche';

export function esPoliticaNoShow(valor: unknown): valor is PoliticaNoShow {
  return typeof valor === 'string' && (POLITICAS_NO_SHOW as readonly string[]).includes(valor);
}

/** Etiqueta legible de cada política (para la UI y los avisos). */
export const ETIQUETA_POLITICA_NO_SHOW: Record<PoliticaNoShow, string> = {
  ninguna: 'No se cobra penalización',
  primera_noche: 'Una noche',
  estancia_completa: 'La estancia completa',
};

/**
 * Qué implica cada política, para explicarlo donde se elige.
 *
 * La primera noche es el defecto del sector: la habitación se retuvo esa noche
 * y el huésped no llegó. La estancia completa solo es defendible en tarifas
 * garantizadas o no reembolsables.
 */
export const DESCRIPCION_POLITICA_NO_SHOW: Record<PoliticaNoShow, string> = {
  ninguna: 'El no-show libera la unidad y no genera ningún cargo.',
  primera_noche:
    'Se cobra una noche (el importe de la reserva dividido entre sus noches). Es la práctica habitual del sector.',
  estancia_completa:
    'Se cobra el importe completo de la reserva. Solo para tarifas garantizadas o no reembolsables.',
};

/**
 * Canales de venta propia: la reserva la vendió el hotel, así que el cargo lo
 * emite el hotel. Cualquier otro canal se considera del proveedor.
 */
const CANALES_PROPIOS = ['directa', 'volkern', 'booking engine', 'motor propio', 'mostrador'];

/** Normaliza el canal para compararlo (tildes, espacios y mayúsculas fuera). */
function normalizarCanal(canal: string | null | undefined): string {
  return (canal || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * ¿El hotel emite el cargo, o ya lo cobra el canal?
 * Solo los canales de venta propia son responsabilidad del hotel.
 */
export function elHotelEmiteElCargo(canal: string | null | undefined): boolean {
  return CANALES_PROPIOS.includes(normalizarCanal(canal));
}

/** Por qué NO se emite una penalización (null cuando sí se emite). */
export type MotivoSinPenalizacion =
  | 'politica_ninguna'
  | 'canal_del_proveedor'
  | 'sin_importe'
  | 'sin_noches';

export interface EntradaPenalizacion {
  politica: PoliticaNoShow;
  canal: string | null | undefined;
  /** Importe de la reserva (`amountAfterTax`). */
  importeTotal: number | null | undefined;
  /** Noches de la estancia (check-out - check-in). */
  noches: number;
  /** El operador decide emitirla aunque el canal cobre lo suyo. */
  cobrarEnCanal?: boolean;
}

export interface PenalizacionCalculada {
  aplica: boolean;
  politica: PoliticaNoShow;
  /** Noches que se cobran (0 si no aplica). */
  nochesPenalizadas: number;
  /** Importe a emitir, redondeado a 2 decimales (0 si no aplica). */
  importe: number;
  /** Concepto listo para la línea de la reserva. */
  concepto: string;
  motivo: MotivoSinPenalizacion | null;
}

/** Redondeo a 2 decimales (mismo criterio que el módulo de finanzas). */
function redondear(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula la penalización de un no-show: cuánto se cobra y si se emite.
 *
 * La tarifa por noche se deriva del importe de la reserva (`importeTotal /
 * noches`) para que funcione igual en reservas de canal (que traen un importe
 * global) y en directas. No se consulta ninguna tarifa: se cobra lo que la
 * reserva vale.
 */
export function calcularPenalizacionNoShow(entrada: EntradaPenalizacion): PenalizacionCalculada {
  const sinPenalizacion = (motivo: MotivoSinPenalizacion): PenalizacionCalculada => ({
    aplica: false,
    politica: entrada.politica,
    nochesPenalizadas: 0,
    importe: 0,
    concepto: '',
    motivo,
  });

  if (entrada.politica === 'ninguna') return sinPenalizacion('politica_ninguna');

  // El canal externo cobra la suya; solo se emite con override explícito.
  if (!elHotelEmiteElCargo(entrada.canal) && !entrada.cobrarEnCanal) {
    return sinPenalizacion('canal_del_proveedor');
  }

  const noches = Number(entrada.noches);
  if (!Number.isFinite(noches) || noches <= 0) return sinPenalizacion('sin_noches');

  const importeTotal = Number(entrada.importeTotal);
  if (!Number.isFinite(importeTotal) || importeTotal <= 0) return sinPenalizacion('sin_importe');

  const nochesPenalizadas = entrada.politica === 'estancia_completa' ? noches : 1;
  const importe = redondear(
    entrada.politica === 'estancia_completa' ? importeTotal : importeTotal / noches
  );
  if (importe <= 0) return sinPenalizacion('sin_importe');

  const concepto =
    nochesPenalizadas === noches
      ? `Penalización por no-show · estancia completa (${noches} noche${noches === 1 ? '' : 's'})`
      : `Penalización por no-show · ${nochesPenalizadas} noche${nochesPenalizadas === 1 ? '' : 's'}`;

  return {
    aplica: true,
    politica: entrada.politica,
    nochesPenalizadas,
    importe,
    concepto,
    motivo: null,
  };
}

/**
 * Política efectiva de una propiedad: la suya si es válida, si no la de
 * defecto. Evita que un valor corrupto en la BD cambie el criterio en silencio.
 */
export function politicaEfectiva(valor: unknown): PoliticaNoShow {
  return esPoliticaNoShow(valor) ? valor : POLITICA_NO_SHOW_POR_DEFECTO;
}
