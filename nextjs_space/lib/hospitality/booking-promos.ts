/**
 * Códigos promocionales del canal directo — módulo PURO.
 *
 * Reglas que este módulo hace cumplir, y por qué:
 * - **Solo se descuenta el alojamiento.** Ni extras ni tarifas adicionales: un
 *   código no puede abaratar la limpieza ni regalar un traslado.
 * - **El descuento lo calcula el servidor.** La web manda el texto del código y
 *   nada más; el importe sale de aquí, nunca del navegador.
 * - **Nunca deja el alojamiento en negativo.** Un importe fijo mayor que la
 *   estancia descuenta como mucho la estancia, y un porcentaje se acota a 100.
 * - **Las fechas se comparan por día de calendario**, sobre la fecha de ENTRADA:
 *   «válido del 1 de junio al 30 de septiembre» es una promoción de temporada, no
 *   una ventana de compra.
 * - **`maxUsos` se comprueba también al reservar**, dentro de la transacción: el
 *   contador que ve el huésped puede haber cambiado entre la cotización y el
 *   cobro.
 */

const LARGO_CODIGO_MAX = 40;

/** Día de calendario en hora local, sin horas: las fechas de promoción son días. */
function dia(valor: Date): number {
  const d = new Date(valor);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Redondeo a céntimo, con el mismo criterio que el resto del dinero. */
function aCentimo(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Normaliza el código tal y como lo escribe el huésped: mayúsculas, sin
 * espacios en los extremos y sin espacios interiores. `verano 2027` y
 * `VERANO2027` son el mismo código; no lo son `VERANO-2027` y `VERANO2027`.
 */
export function normalizarCodigo(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().toUpperCase().replace(/\s+/g, '').slice(0, LARGO_CODIGO_MAX);
}

/** Solo letras, números, guion y guion bajo: un código se dicta por teléfono. */
export function codigoValido(codigo: string): boolean {
  return /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(codigo);
}

export type TipoPromocion = 'porcentaje' | 'importe';

/** Código tal como vive en la base. */
export interface Promocion {
  codigo: string;
  tipo: string;
  valor: number;
  moneda: string;
  desde: Date | null;
  hasta: Date | null;
  minNoches: number;
  maxUsos: number | null;
  usos: number;
  activo: boolean;
}

export interface ContextoPromocion {
  /** Fecha de entrada de la estancia: contra ella se juzga la vigencia. */
  checkIn: Date;
  noches: number;
  /** Importe del alojamiento ANTES de descuento (base del cálculo). */
  alojamiento: number;
  /** Hoy, para poder congelarlo en pruebas. */
  hoy?: Date;
}

export type MotivoPromocionInvalida =
  | 'inactiva'
  | 'fuera_de_fecha'
  | 'min_noches'
  | 'agotada'
  | 'sin_alojamiento';

export type ResultadoPromocion =
  | { ok: true; descuento: number; tipo: TipoPromocion; valor: number }
  | { ok: false; motivo: MotivoPromocionInvalida; mensaje: string };

/**
 * Importe del descuento para un alojamiento concreto.
 *
 * Devuelve 0 si la base no es positiva: sin alojamiento no hay nada que
 * descontar, y un descuento suelto sería un saldo a favor.
 */
export function descuentoDePromocion(
  promo: Pick<Promocion, 'tipo' | 'valor'>,
  alojamiento: number
): number {
  const base = Math.max(0, Number(alojamiento) || 0);
  if (base <= 0) return 0;
  const valor = Math.max(0, Number(promo.valor) || 0);
  const bruto = promo.tipo === 'importe' ? valor : (base * Math.min(valor, 100)) / 100;
  return aCentimo(Math.min(base, Math.max(0, bruto)));
}

/**
 * ¿Se puede aplicar este código a esta estancia, y cuánto descuenta?
 *
 * Devuelve el motivo exacto cuando no: el huésped tiene que poder leer por qué
 * un código no le funciona («válido solo desde 3 noches», «ya no está
 * disponible»). Un código inexistente no llega aquí: la ruta responde «no
 * existe» sin revelar si el código es de otro hotel.
 */
export function evaluarPromocion(promo: Promocion, ctx: ContextoPromocion): ResultadoPromocion {
  if (!promo.activo) {
    return { ok: false, motivo: 'inactiva', mensaje: 'Ese código ya no está disponible.' };
  }

  const entrada = dia(ctx.checkIn);
  if (promo.desde && entrada < dia(promo.desde)) {
    return {
      ok: false,
      motivo: 'fuera_de_fecha',
      mensaje: 'Ese código todavía no está vigente para esas fechas.',
    };
  }
  if (promo.hasta && entrada > dia(promo.hasta)) {
    return {
      ok: false,
      motivo: 'fuera_de_fecha',
      mensaje: 'Ese código ya no está vigente para esas fechas.',
    };
  }

  const noches = Math.max(0, Math.round(Number(ctx.noches) || 0));
  const minimo = Math.max(1, Math.round(Number(promo.minNoches) || 1));
  if (noches < minimo) {
    return {
      ok: false,
      motivo: 'min_noches',
      mensaje: `Ese código necesita al menos ${minimo} ${minimo === 1 ? 'noche' : 'noches'}.`,
    };
  }

  if (promo.maxUsos != null && (Number(promo.usos) || 0) >= promo.maxUsos) {
    return { ok: false, motivo: 'agotada', mensaje: 'Ese código ya se ha agotado.' };
  }

  const descuento = descuentoDePromocion(promo, ctx.alojamiento);
  if (descuento <= 0) {
    return {
      ok: false,
      motivo: 'sin_alojamiento',
      mensaje: 'Ese código no se puede aplicar a esta estancia.',
    };
  }

  return {
    ok: true,
    descuento,
    tipo: promo.tipo === 'importe' ? 'importe' : 'porcentaje',
    valor: Math.max(0, Number(promo.valor) || 0),
  };
}

/** Filas de desglose de la reserva: el descuento es una línea EN NEGATIVO. */
export function filaDeDescuento(params: {
  codigo: string;
  descuento: number;
  moneda: string;
  tenantId: string;
  reservationId: string;
  propertyId: string;
  unitId: string | null;
}) {
  const importe = aCentimo(Math.max(0, params.descuento));
  return {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    propertyId: params.propertyId,
    unitId: params.unitId,
    // Tipo propio: el descuento no es un extra ni un cargo. Finanzas lo suma
    // como cualquier línea (en negativo), así que el bruto sigue siendo la suma
    // del desglose.
    tipo: 'descuento',
    concepto: `Descuento ${params.codigo}`,
    cantidad: 1,
    importeUnitario: -importe,
    importeTotal: -importe,
    moneda: params.moneda,
  };
}
