/**
 * Rendimiento de los códigos promocionales — módulo PURO.
 *
 * Responde a la pregunta que el contador `usos` no contesta: «¿qué me ha dado
 * cada código?». El hotel ve cuántas veces se usó, cuánto descuento concedió y
 * cuánto ingreso neto trajo, para poder comparar códigos entre sí y decidir cuál
 * repetir y cuál apagar.
 *
 * Reglas que este módulo hace cumplir, y por qué:
 * - **El código se atribuye por dato, no por adivinanza.** La reserva guarda su
 *   promoción en `payload.promocion.codigo`; cuando ese payload no existe (datos
 *   viejos o líneas cargadas a mano), se lee del concepto de la línea de
 *   descuento, que es lo que escribe `filaDeDescuento`. Una línea de descuento
 *   cuyo código no se puede leer no se atribuye a nadie: se cuenta aparte
 *   (`sinCodigo`) en lugar de repartirla entre códigos a ciegas.
 * - **«Otorgado» y «aprovechado» no son lo mismo.** Un código concede descuento
 *   en cuanto se usa; si esa reserva luego se cancela, el descuento se concedió
 *   pero no compró nada. `descuentoOtorgado` cuenta todo y `descuentoAprovechado`
 *   solo lo que acabó en venta (misma regla que Finanzas: cancelada y no-show no
 *   son ingreso).
 * - **El neto sale de `calcularRentabilidad`.** No hay una segunda fórmula de
 *   dinero en la vertical; el ingreso de un código es el de sus reservas.
 * - **Las comparaciones se hacen contra el alojamiento a tarifa plena**, que es
 *   la base sobre la que el código descontó. La cotización guarda ese importe
 *   ANTES del descuento (`cotizacion.alojamiento`, en `pricing.ts`) y el
 *   descuento va en su propia línea en negativo, así que la base es la línea de
 *   alojamiento sin sumarle nada.
 * - **La conversión sale de la consulta, no de la reserva.** `reservas` dice
 *   cuántas ventas llevan el código; `consultas` dice cuánta gente lo aplicó. La
 *   diferencia es el intento que se quedó en nada, que es lo que mide si la
 *   promoción convence. Sin consultas registradas la conversión es 0, no 100 %:
 *   no se puede afirmar que convirtió lo que nadie midió.
 */

import {
  calcularRentabilidad,
  redondear,
  type LineaReserva,
  type PagoReserva,
} from './finance';
import { normalizarCodigo } from './booking-promos';
import {
  porcentajeConversion,
  resumirConsultas,
  type ConsultaPromocion,
} from './promos-consultas';

/**
 * Prefijo con el que `filaDeDescuento` escribe la línea:
 * «Descuento VERANO2027». El grupo captura el código.
 */
const CONCEPTO_DESCUENTO = /^\s*descuento\s+(.+?)\s*$/i;

/** Reserva tal como la necesita el informe de promociones. */
export interface ReservaConPromocion {
  id: string;
  estado: string;
  checkIn: Date | string;
  /** Noches de la estancia (la reserva ya las tiene calculadas). */
  noches: number;
  moneda: string;
  lineas: LineaReserva[];
  pagos?: PagoReserva[];
  comisionOta?: number | null;
  /** Código según `payload.promocion.codigo` de la reserva, si lo tiene. */
  codigo?: string | null;
}

/** Código del catálogo: entra en la comparativa aunque nadie lo haya usado. */
export interface CodigoDelCatalogo {
  codigo: string;
  moneda?: string | null;
  /** Contador de usos del código (lo incrementa la reserva directa). */
  usos?: number | null;
  activo?: boolean;
  maxUsos?: number | null;
}

export interface RendimientoPromocion {
  codigo: string;
  moneda: string;
  activo: boolean;
  maxUsos: number | null;
  /** Reservas que son venta: excluye canceladas y no-show, como Finanzas. */
  reservas: number;
  /** Reservas con el código que no son venta (canceladas y no-show). */
  reservasSinVenta: number;
  noches: number;
  /** Descuento concedido con el código en TODAS sus reservas (positivo). */
  descuentoOtorgado: number;
  /** Parte de ese descuento que acabó en reservas que sí son venta. */
  descuentoAprovechado: number;
  /** Alojamiento a tarifa plena de las reservas con venta (base del descuento). */
  alojamientoSinDescuento: number;
  /** Ingreso del código, ya neto del descuento (reservas con venta). */
  bruto: number;
  comisionOta: number;
  /** Bruto menos comisión OTA: lo que el código deja de verdad. */
  neto: number;
  ticketMedio: number;
  /** `descuentoAprovechado / alojamientoSinDescuento`, en porcentaje. */
  descuentoPct: number;
  /**
   * Ingreso neto por cada unidad monetaria descontada. Es la cifra con la que se
   * comparan dos códigos de valor distinto: un 10 % que trae reservas de 5
   * noches rinde más que un 20 % que trae una noche.
   */
  netoPorDescontado: number;
  /** Usos que dice el contador del código (puede incluir otro periodo). */
  usosDelContador: number;
  /** Usos del contador sin reserva medida: o son de otro periodo, o se borraron. */
  usosSinReservaMedida: number;
  /** Consultas con el código aplicable: el denominador de la conversión. */
  consultas: number;
  /** Consultas que constan convertidas en una reserva de la misma sesión. */
  consultasConvertidas: number;
  /** Consultas aplicadas que no acabaron en reserva. */
  consultasSinReserva: number;
  /** Intentos rechazados por las condiciones del código (no convierten). */
  intentosRechazados: number;
  /** `consultasConvertidas / consultas`, en porcentaje. */
  conversionPct: number;
}

export interface InformePromociones {
  filas: RendimientoPromocion[];
  /** Reservas con descuento cuyo código no se pudo leer: no se atribuyen. */
  sinCodigo: number;
  totales: {
    reservas: number;
    descuentoOtorgado: number;
    descuentoAprovechado: number;
    bruto: number;
    neto: number;
    consultas: number;
    consultasConvertidas: number;
    intentosRechazados: number;
    conversionPct: number;
  };
  /**
   * Intentos con códigos que no existen en el catálogo (erratas o campañas sin
   * dar de alta). Se declaran aparte: no son rendimiento de ningún código real.
   */
  deCodigosDesconocidos: Array<{ codigo: string; intentos: number }>;
}

/** Suma (en positivo) de las líneas de descuento de una reserva. */
export function descuentoDeLineas(lineas: LineaReserva[]): number {
  return redondear(
    lineas
      .filter((linea) => linea.tipo === 'descuento')
      .reduce((total, linea) => total + Math.abs(linea.importeTotal || 0), 0)
  );
}

/** Código que declara el concepto de una línea, si es una línea de descuento. */
export function codigoDeConcepto(concepto: string): string | null {
  const coincidencia = CONCEPTO_DESCUENTO.exec(concepto || '');
  if (!coincidencia) return null;
  const codigo = normalizarCodigo(coincidencia[1]);
  return codigo || null;
}

/**
 * Código que se puede atribuir a la reserva. El payload manda (es el dato que el
 * motor escribió al vender); el concepto es el respaldo para datos que no lo
 * traen. Devuelve `null` cuando no hay ninguno legible.
 */
export function codigoDeReserva(reserva: Pick<ReservaConPromocion, 'codigo' | 'lineas'>): string | null {
  const delPayload = normalizarCodigo(reserva.codigo);
  if (delPayload) return delPayload;
  for (const linea of reserva.lineas) {
    if (linea.tipo !== 'descuento') continue;
    const codigo = codigoDeConcepto(linea.concepto);
    if (codigo) return codigo;
  }
  return null;
}

/**
 * Día de calendario `YYYY-MM-DD` en hora LOCAL.
 *
 * No se usa `toISOString()`: la ventana del informe es de días de entrada, y en
 * un huso al oeste de UTC la conversión a UTC devolvería el día anterior (una
 * estancia que entra el 1 de julio se leería como el 30 de junio).
 */
export function diaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * Ventana del informe a partir de los parámetros del panel.
 *
 * Por defecto, los ÚLTIMOS 12 MESES: una promoción de temporada se juzga con su
 * temporada entera y con el mes en curso la comparativa saldría casi vacía. El
 * límite es la fecha de ENTRADA, como en el resto de Hospitality, y `hasta` se
 * devuelve EXCLUSIVO (el día siguiente al elegido) para que la estancia que
 * entra el último día del rango cuente.
 *
 * Un valor que no sea `YYYY-MM-DD` se ignora en vez de inventar una fecha.
 */
export function resolverVentanaPromos(
  params: { desde?: string | null; hasta?: string | null },
  hoy: Date = new Date()
): { desde: Date; hasta: Date } {
  const fechaSolo = (valor?: string | null): Date | null => {
    if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
    const fecha = new Date(`${valor}T00:00:00`);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  };

  const desdeParam = fechaSolo(params.desde);
  const hastaParam = fechaSolo(params.hasta);

  let desde: Date;
  if (desdeParam) {
    desde = desdeParam;
  } else {
    desde = new Date(hoy);
    desde.setHours(0, 0, 0, 0);
    desde.setDate(desde.getDate() - 365);
  }

  let hasta: Date;
  if (hastaParam) {
    hasta = new Date(hastaParam);
    hasta.setDate(hasta.getDate() + 1);
  } else {
    hasta = new Date(hoy);
    hasta.setHours(0, 0, 0, 0);
    hasta.setDate(hasta.getDate() + 1);
  }

  return { desde, hasta };
}

/** Acumulador interno por código (antes de cerrar los ratios). */
interface Acumulado {
  codigo: string;
  moneda: string;
  activo: boolean;
  maxUsos: number | null;
  usosDelContador: number;
  reservas: number;
  reservasSinVenta: number;
  noches: number;
  descuentoOtorgado: number;
  descuentoAprovechado: number;
  alojamientoSinDescuento: number;
  bruto: number;
  comisionOta: number;
  neto: number;
  consultasAplicadas: number;
  consultasConvertidas: number;
  intentosRechazados: number;
}

function nuevoAcumulado(codigo: string, catalogo?: CodigoDelCatalogo): Acumulado {
  return {
    codigo,
    moneda: '',
    activo: catalogo?.activo ?? true,
    maxUsos: catalogo?.maxUsos ?? null,
    usosDelContador: Math.max(0, Math.round(Number(catalogo?.usos) || 0)),
    reservas: 0,
    reservasSinVenta: 0,
    noches: 0,
    descuentoOtorgado: 0,
    descuentoAprovechado: 0,
    alojamientoSinDescuento: 0,
    bruto: 0,
    comisionOta: 0,
    neto: 0,
    consultasAplicadas: 0,
    consultasConvertidas: 0,
    intentosRechazados: 0,
  };
}

/**
 * Compara los códigos entre sí a partir de las reservas del periodo.
 *
 * `codigos` es el catálogo (opcional pero recomendable): un código que nadie usó
 * también es un resultado —salió gratis y no trajo nada— y sin él no aparecería
 * en la tabla. Las reservas sin código legible se cuentan en `sinCodigo`, nunca
 * se reparten.
 *
 * `consultas` son los intentos registrados por la web pública. Un código que se
 * aplicó pero no reservó **sí aparece** aunque no esté en el catálogo (se borró
 * después): el intento ocurrió. Los rechazos de un código que nunca existió no
 * crean fila; se agrupan en `deCodigosDesconocidos`.
 */
export function rendimientoPromociones(
  reservas: ReservaConPromocion[],
  codigos: CodigoDelCatalogo[] = [],
  consultas: ConsultaPromocion[] = []
): InformePromociones {
  const porCodigo = new Map<string, Acumulado>();

  for (const definicion of codigos) {
    const codigo = normalizarCodigo(definicion.codigo);
    if (!codigo) continue;
    if (!porCodigo.has(codigo)) porCodigo.set(codigo, nuevoAcumulado(codigo, definicion));
  }

  // Las consultas se cruzan contra el catálogo para distinguir un código real
  // que se probó de una errata. Se aplican al acumulador que ya existe (o se
  // crea si el código se aplicó de verdad).
  const resumenConsultas = resumirConsultas(consultas, porCodigo.keys());
  for (const [codigo, datos] of resumenConsultas.porCodigo) {
    const existente = porCodigo.get(codigo);
    if (!existente && datos.aplicadas === 0) continue;
    const acumulado = existente || nuevoAcumulado(codigo);
    porCodigo.set(codigo, acumulado);
    acumulado.consultasAplicadas += datos.aplicadas;
    acumulado.consultasConvertidas += datos.convertidas;
    acumulado.intentosRechazados += datos.rechazadas;
  }

  let sinCodigo = 0;

  for (const reserva of reservas) {
    const codigo = codigoDeReserva(reserva);
    if (!codigo) {
      sinCodigo += 1;
      continue;
    }

    const acumulado = porCodigo.get(codigo) || nuevoAcumulado(codigo);
    porCodigo.set(codigo, acumulado);

    const descuento = descuentoDeLineas(reserva.lineas);
    const rentabilidad = calcularRentabilidad({
      lineas: reserva.lineas,
      pagos: reserva.pagos || [],
      comisionOta: reserva.comisionOta || 0,
      moneda: reserva.moneda,
    });
    const alojamiento = redondear(
      reserva.lineas
        .filter((linea) => linea.tipo === 'alojamiento')
        .reduce((total, linea) => total + (linea.importeTotal || 0), 0)
    );

    if (!acumulado.moneda) acumulado.moneda = rentabilidad.moneda;

    // El descuento se concede en cualquier reserva, aunque después se cancele.
    acumulado.descuentoOtorgado = redondear(acumulado.descuentoOtorgado + descuento);

    // Cancelada y no-show no son venta: no aportan ingreso ni cuentan el código
    // como conversión (misma regla que Finanzas y Reportes).
    if (reserva.estado === 'cancelled' || reserva.estado === 'no_show') {
      acumulado.reservasSinVenta += 1;
      continue;
    }

    acumulado.reservas += 1;
    acumulado.noches += Math.max(0, Math.round(Number(reserva.noches) || 0));
    acumulado.descuentoAprovechado = redondear(acumulado.descuentoAprovechado + descuento);
    // La línea de alojamiento es la tarifa plena (el descuento viaja aparte, en
    // negativo): es exactamente la base sobre la que el código descontó.
    acumulado.alojamientoSinDescuento = redondear(acumulado.alojamientoSinDescuento + alojamiento);
    acumulado.bruto = redondear(acumulado.bruto + rentabilidad.bruto);
    acumulado.comisionOta = redondear(acumulado.comisionOta + rentabilidad.comisionOta);
    acumulado.neto = redondear(acumulado.neto + rentabilidad.neto);
  }

  const filas: RendimientoPromocion[] = Array.from(porCodigo.values())
    .map((acumulado) => ({
      codigo: acumulado.codigo,
      moneda: acumulado.moneda,
      activo: acumulado.activo,
      maxUsos: acumulado.maxUsos,
      reservas: acumulado.reservas,
      reservasSinVenta: acumulado.reservasSinVenta,
      noches: acumulado.noches,
      descuentoOtorgado: acumulado.descuentoOtorgado,
      descuentoAprovechado: acumulado.descuentoAprovechado,
      alojamientoSinDescuento: acumulado.alojamientoSinDescuento,
      bruto: acumulado.bruto,
      comisionOta: acumulado.comisionOta,
      neto: acumulado.neto,
      ticketMedio: acumulado.reservas > 0 ? redondear(acumulado.bruto / acumulado.reservas) : 0,
      descuentoPct:
        acumulado.alojamientoSinDescuento > 0
          ? redondear((acumulado.descuentoAprovechado / acumulado.alojamientoSinDescuento) * 100)
          : 0,
      netoPorDescontado:
        acumulado.descuentoAprovechado > 0
          ? redondear(acumulado.neto / acumulado.descuentoAprovechado)
          : 0,
      usosDelContador: acumulado.usosDelContador,
      usosSinReservaMedida: Math.max(
        0,
        acumulado.usosDelContador - (acumulado.reservas + acumulado.reservasSinVenta)
      ),
      consultas: acumulado.consultasAplicadas,
      consultasConvertidas: acumulado.consultasConvertidas,
      consultasSinReserva: Math.max(
        0,
        acumulado.consultasAplicadas - acumulado.consultasConvertidas
      ),
      intentosRechazados: acumulado.intentosRechazados,
      conversionPct: porcentajeConversion(
        acumulado.consultasConvertidas,
        acumulado.consultasAplicadas
      ),
    }))
    // Se ordena por lo que se dejó el código: es el dato con el que se decide.
    .sort((a, b) => b.descuentoOtorgado - a.descuentoOtorgado || a.codigo.localeCompare(b.codigo));

  const consultasTotales = filas.reduce((total, fila) => total + fila.consultas, 0);
  const convertidasTotales = filas.reduce((total, fila) => total + fila.consultasConvertidas, 0);

  return {
    filas,
    sinCodigo,
    totales: {
      reservas: filas.reduce((total, fila) => total + fila.reservas, 0),
      descuentoOtorgado: redondear(filas.reduce((total, fila) => total + fila.descuentoOtorgado, 0)),
      descuentoAprovechado: redondear(
        filas.reduce((total, fila) => total + fila.descuentoAprovechado, 0)
      ),
      bruto: redondear(filas.reduce((total, fila) => total + fila.bruto, 0)),
      neto: redondear(filas.reduce((total, fila) => total + fila.neto, 0)),
      consultas: consultasTotales,
      consultasConvertidas: convertidasTotales,
      intentosRechazados: filas.reduce((total, fila) => total + fila.intentosRechazados, 0),
      conversionPct: porcentajeConversion(convertidasTotales, consultasTotales),
    },
    deCodigosDesconocidos: resumenConsultas.deCodigosDesconocidos,
  };
}
