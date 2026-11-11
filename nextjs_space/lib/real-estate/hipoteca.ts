/**
 * Cuota hipotecaria de un inmueble en venta.
 *
 * Módulo puro —sin Prisma, sin React y sin divisas— para que la ficha del
 * portal, el listado y el widget embebible calculen lo mismo. La divisa la pone
 * quien pinta el importe con `formatearImporte`: aquí solo hay números.
 *
 * El sistema es el francés (cuota constante, interés compuesto sobre el capital
 * pendiente), que es el que usan las entidades en España y en México. Es una
 * estimación: no incluye gastos, impuestos ni comisiones de apertura, y por eso
 * la interfaz lo dice al lado del resultado.
 */

/** Datos que escribe el visitante en la calculadora. */
export interface DatosHipoteca {
  /** Precio de venta del inmueble. */
  precio: number;
  /** Entrada aportada por el comprador. */
  aportacion: number;
  /** Plazo en años. */
  anios: number;
  /** Tipo de interés nominal anual, en porcentaje (3 = 3 %). */
  interesAnual: number;
  /** Productos vinculados que el banco cobra cada mes. */
  vinculaciones?: number;
  /** Seguros que el banco cobra cada mes. */
  seguros?: number;
}

/** Resultado mensual y totales del préstamo. */
export interface CuotaHipotecaria {
  /** Capital prestado: precio menos aportación. */
  principal: number;
  /** Número de cuotas. */
  meses: number;
  /** Cuota de capital + intereses, sin vinculaciones ni seguros. */
  cuotaCapital: number;
  /** Intereses pagados durante toda la vida del préstamo. */
  interesesTotales: number;
  /** Vinculaciones mensuales. */
  vinculaciones: number;
  /** Seguros mensuales. */
  seguros: number;
  /** Lo que sale cada mes: cuota + vinculaciones + seguros. */
  totalMensual: number;
}

/** Entrada por defecto: una quinta parte del precio. */
export const APORTACION_POR_DEFECTO = 0.2;

/** Plazo por defecto, en años. */
export const ANIOS_POR_DEFECTO = 30;

/**
 * Meses que tiene un año a efectos de cuota.
 *
 * El tipo de interés con el que arranca el formulario no vive aquí: depende de la
 * divisa del inmueble, y una tabla de divisas solo puede estar en
 * `lib/moneda.ts` (`interesHipotecarioOrientativo`). Aquí solo se calcula con el
 * tipo que llegue.
 */
export const MESES_POR_ANIO = 12;

/** Número finito y no negativo; cualquier otra cosa vale cero. */
function importe(valor: number | null | undefined): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/** Redondeo a céntimos, para no arrastrar ruido de coma flotante. */
function centimos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Cuota mensual y totales de una hipoteca.
 *
 * Los datos se sanean antes de calcular: una aportación mayor que el precio deja
 * el préstamo en cero, un plazo de cero años se trata como un año y un interés
 * negativo como cero. Una entrada absurda devuelve una cuota, no `NaN`.
 */
export function calcularHipoteca(datos: DatosHipoteca): CuotaHipotecaria {
  const precio = importe(datos.precio);
  const aportacion = Math.min(importe(datos.aportacion), precio);
  const principal = Math.max(precio - aportacion, 0);
  const anios = Math.max(importe(datos.anios), 1);
  const meses = Math.round(anios * MESES_POR_ANIO);
  const interesAnual = importe(datos.interesAnual);
  const vinculaciones = importe(datos.vinculaciones);
  const seguros = importe(datos.seguros);

  const tipoMensual = interesAnual / 100 / MESES_POR_ANIO;

  let cuotaCapital = 0;
  if (principal > 0) {
    cuotaCapital =
      tipoMensual === 0
        ? principal / meses
        : (principal * tipoMensual) / (1 - Math.pow(1 + tipoMensual, -meses));
  }

  cuotaCapital = centimos(cuotaCapital);

  return {
    principal: centimos(principal),
    meses,
    cuotaCapital,
    interesesTotales: centimos(Math.max(cuotaCapital * meses - principal, 0)),
    vinculaciones,
    seguros,
    totalMensual: centimos(cuotaCapital + vinculaciones + seguros),
  };
}
