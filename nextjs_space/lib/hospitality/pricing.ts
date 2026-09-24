/**
 * Tarificación de la reserva directa (FASE 3.D): qué cuesta una estancia y si se
 * puede vender.
 *
 * Módulo puro, sin base de datos y sin HTTP, porque estas dos preguntas las hacen
 * tres sitios distintos (la página pública al cotizar, el motor al crear la
 * reserva y la ficha de la reserva al explicar su desglose). Si cada uno las
 * respondiera por su cuenta, el precio que ve el huésped y el que se guarda
 * podrían discrepar —y ese es justo el defecto que la fase viene a no repetir.
 *
 * Dos reglas que no se toman aquí:
 * - **La disponibilidad no se calcula aquí.** Vive en `availability.ts` y es la
 *   única del proyecto (regla 2 de la FASE 3).
 * - **La divisa no se elige aquí.** Llega resuelta por el llamador desde los
 *   datos (la configuración publicada o la moneda del tenant), nunca de un valor
 *   por defecto del esquema.
 *
 * El desglose que produce es el que el propietario pidió ver:
 *
 *     Alojamiento   5 noches × tarifa
 *     Limpieza      tarifa de la estancia (opcional)
 *     ────────────────────────────────
 *     Total         = ingreso bruto
 */

import { nightsBetween, startOfDay } from './calendar';
import { normalizarEstacionalidad, precioEstancia, serieDeTarifas, tarifaPorNoche } from './estacionalidad';

/** Restricciones de venta del plan de tarifa (las mismas que se empujan al canal). */
export interface RestriccionesEstancia {
  /** Estancia mínima en noches. 1 = sin mínimo real. */
  minNoches?: number | null;
  /** Estancia máxima en noches. Nulo = sin máximo. */
  maxNoches?: number | null;
  /** Días de la semana en los que se permite entrar. 0 = domingo. Vacío = sin restricción. */
  checkInDias?: number[] | null;
  /** Días de la semana en los que se permite salir. 0 = domingo. Vacío = sin restricción. */
  checkOutDias?: number[] | null;
}

export type MotivoRechazo =
  | 'fechas_invalidas'
  | 'en_pasado'
  | 'min_noches'
  | 'max_noches'
  | 'dia_checkin'
  | 'dia_checkout';

export interface EstanciaValida {
  ok: true;
  noches: number;
}

export interface EstanciaInvalida {
  ok: false;
  motivo: MotivoRechazo;
  /** Mensaje para el huésped: dice qué pasa y qué hacer, no un código. */
  mensaje: string;
}

export type ValidacionEstancia = EstanciaValida | EstanciaInvalida;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function listaDias(dias: number[] | null | undefined): number[] {
  if (!Array.isArray(dias)) return [];
  return dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/** Nombres legibles de un conjunto de días: "sábado y domingo". */
function nombrarDias(dias: number[]): string {
  const nombres = [...dias].sort((a, b) => a - b).map((d) => DIAS[d]);
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * ¿Se puede vender esta estancia con estas restricciones?
 *
 * El orden de las comprobaciones es el del huésped: primero si las fechas tienen
 * sentido, luego si están en el pasado y después cada restricción del plan.
 */
export function validarEstancia(params: {
  checkIn: Date;
  checkOut: Date;
  restricciones?: RestriccionesEstancia | null;
  /** Fecha de hoy para poder probar el rechazo de fechas pasadas. */
  hoy?: Date;
}): ValidacionEstancia {
  const { checkIn, checkOut, hoy = new Date() } = params;
  const r = params.restricciones || {};

  if (
    !(checkIn instanceof Date) ||
    !(checkOut instanceof Date) ||
    isNaN(checkIn.getTime()) ||
    isNaN(checkOut.getTime())
  ) {
    return { ok: false, motivo: 'fechas_invalidas', mensaje: 'Las fechas no son válidas.' };
  }

  const noches = nightsBetween(checkIn, checkOut);
  if (noches <= 0) {
    return {
      ok: false,
      motivo: 'fechas_invalidas',
      mensaje: 'La salida tiene que ser posterior a la entrada.',
    };
  }

  if (startOfDay(checkOut).getTime() <= startOfDay(hoy).getTime()) {
    return { ok: false, motivo: 'en_pasado', mensaje: 'Esas fechas ya han pasado.' };
  }

  if (r.minNoches != null && noches < r.minNoches) {
    return {
      ok: false,
      motivo: 'min_noches',
      mensaje:
        r.minNoches === 1
          ? 'La estancia tiene que ser de al menos una noche.'
          : `La estancia mínima es de ${r.minNoches} noches.`,
    };
  }

  if (r.maxNoches != null && noches > r.maxNoches) {
    return {
      ok: false,
      motivo: 'max_noches',
      mensaje: `La estancia máxima es de ${r.maxNoches} noches.`,
    };
  }

  const diasEntrada = listaDias(r.checkInDias);
  if (diasEntrada.length && !diasEntrada.includes(startOfDay(checkIn).getDay())) {
    return {
      ok: false,
      motivo: 'dia_checkin',
      mensaje: `La entrada solo se permite ${nombrarDias(diasEntrada)}.`,
    };
  }

  const diasSalida = listaDias(r.checkOutDias);
  if (diasSalida.length && !diasSalida.includes(startOfDay(checkOut).getDay())) {
    return {
      ok: false,
      motivo: 'dia_checkout',
      mensaje: `La salida solo se permite ${nombrarDias(diasSalida)}.`,
    };
  }

  return { ok: true, noches };
}

export interface EntradaCotizacion {
  checkIn: Date;
  checkOut: Date;
  /** Precio por noche ya resuelto (plan de tarifa activo o tarifa base). */
  tarifaPorNoche: number;
  /** Tarifa de limpieza por estancia. Nula o 0 = no se cobra. */
  limpieza?: number | null;
  /** Porcentaje de anticipo sobre el total (0-100). */
  anticipoPorcentaje?: number | null;
  /**
   * Estacionalidad del plan (temporadas/fin de semana, Json crudo de la base).
   * Presente y utilizable → el precio se suma noche a noche; ausente → el
   * cálculo clásico noches × tarifa, intacto.
   */
  estacionalidad?: unknown;
  /** Divisa con la que se publica; la resuelve el llamador desde los datos. */
  moneda: string;
}

export interface Cotizacion {
  noches: number;
  /**
   * Precio por noche: la tarifa del plan en el cálculo clásico; la MEDIA del
   * rango cuando hay estacionalidad (informativa — el importe real es
   * `alojamiento`, y la noche a noche está en `desgloseNoches`).
   */
  tarifaPorNoche: number;
  /** Noches × tarifa, o la suma por noche con estacionalidad. */
  alojamiento: number;
  limpieza: number;
  /** Ingreso bruto de la reserva: alojamiento + limpieza. */
  total: number;
  /** Anticipo a cobrar en el momento de reservar. 0 = no se pide. */
  anticipo: number;
  /** Lo que queda por cobrar después del anticipo. */
  saldo: number;
  moneda: string;
  /**
   * Precio por noche con su fecha cuando el plan tiene estacionalidad
   * (null en el cálculo clásico: la tarifa plana no necesita desglose).
   */
  desgloseNoches: Array<{ fecha: string; tarifa: number }> | null;
}

/** Redondeo a céntimo, con el mismo criterio que el resto del dinero. */
function aCentimo(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Cotiza una estancia a partir de las noches y la tarifa.
 *
 * Con estacionalidad en el plan, el precio ya no es noches × tarifa: se suma
 * la serie de precios POR NOCHE del rango (la noche cuesta la tarifa de su
 * fecha — la misma regla que empuja el canal; módulo `./estacionalidad`). La
 * `tarifaPorNoche` devuelta pasa a ser la MEDIA del rango (informativa: es lo
 * que la ficha muestra como "desde X/noche"), mientras `alojamiento` es el
 * importe real y `desgloseNoches` trae noche a noche para el desglose visual.
 *
 * Lanza si el rango no tiene noches: una cotización de cero noches no es un
 * precio, es un error de quien llama, y devolverla como 0 acabaría en una reserva
 * sin importe.
 */
export function cotizarEstancia(entrada: EntradaCotizacion): Cotizacion {
  const noches = nightsBetween(entrada.checkIn, entrada.checkOut);
  if (noches <= 0) {
    throw new Error('No se puede cotizar una estancia sin noches');
  }

  const config = normalizarEstacionalidad(entrada.estacionalidad);
  const limpieza = aCentimo(Math.max(0, Number(entrada.limpieza) || 0));

  let alojamiento: number;
  let tarifaEfectiva: number;
  let desgloseNoches: Cotizacion['desgloseNoches'] = null;

  if (config) {
    const serie = serieDeTarifas({
      desde: entrada.checkIn,
      hasta: entrada.checkOut,
      tarifaBase: null,
      plan: { tarifa: Number(entrada.tarifaPorNoche) || 0, estacionalidad: config },
    });
    const totalNoches = serie.reduce((acc, f) => acc + (f.tarifa ?? 0), 0);
    if (!(totalNoches > 0)) {
      throw new Error('No se puede cotizar una estancia sin precio por noche');
    }
    alojamiento = aCentimo(totalNoches);
    tarifaEfectiva = aCentimo(totalNoches / noches);
    desgloseNoches = serie.map((f) => ({
      fecha: f.fecha,
      tarifa: aCentimo(f.tarifa ?? 0),
    }));
  } else {
    tarifaEfectiva = aCentimo(Math.max(0, Number(entrada.tarifaPorNoche) || 0));
    alojamiento = aCentimo(tarifaEfectiva * noches);
  }

  const total = aCentimo(alojamiento + limpieza);

  const porcentaje = Math.min(100, Math.max(0, Math.round(Number(entrada.anticipoPorcentaje) || 0)));
  const anticipo = porcentaje ? aCentimo((total * porcentaje) / 100) : 0;

  return {
    noches,
    tarifaPorNoche: tarifaEfectiva,
    alojamiento,
    limpieza,
    total,
    anticipo,
    saldo: aCentimo(total - anticipo),
    moneda: (entrada.moneda || '').trim().toUpperCase(),
    desgloseNoches,
  };
}

/** ¿La unidad tiene precio con el que cotizar? Sin precio no se puede vender. */
export function tienePrecio(tarifa: number | null | undefined): boolean {
  return typeof tarifa === 'number' && Number.isFinite(tarifa) && tarifa >= 0;
}

/**
 * Precio por noche de una unidad: el plan de tarifa activo manda; si no hay,
 * la tarifa base de la unidad; si no hay ninguna de las dos, no hay precio y la
 * unidad no se publica (vender a cero sería peor que no vender).
 *
 * Es el precio "desde": con estacionalidad el importe real lo suma
 * `cotizarEstancia` noche a noche (módulo `./estacionalidad`).
 */
export function tarifaPorNocheDe(params: {
  plan?: { tarifa: number | null | undefined } | null;
  tarifaBase?: number | null | undefined;
}): number | null {
  if (typeof params.plan?.tarifa === 'number' && Number.isFinite(params.plan.tarifa) && params.plan.tarifa > 0) {
    return params.plan.tarifa;
  }
  if (tienePrecio(params.tarifaBase)) return Number(params.tarifaBase);
  return null;
}
