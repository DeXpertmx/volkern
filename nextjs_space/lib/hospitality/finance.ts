/**
 * Finanzas de la reserva (FASE 3: Booking Engine + Payments).
 *
 * Módulo PURO: no toca base de datos ni servicios externos. Recibe las líneas
 * y los pagos ya leídos y devuelve el desglose que ve el propietario.
 *
 * Reglas del plan:
 * - El **ingreso bruto** es la suma de las líneas de la reserva.
 * - El **ingreso neto** es el bruto menos comisiones y gastos imputados.
 *   A propósito NO se usa la expresión "ingreso bruto después de gastos".
 * - El estado de cobro se **deriva** de la suma real de los pagos; nunca se
 *   guarda un valor que pueda quedar desincronizado con ellos.
 *
 * **La penalización por no-show no es ingreso de alojamiento.** Es un cargo de
 * cancelación: se emite y se cobra, pero no es ADR, no es RevPAR ni son noches
 * vendidas (el no-show no ocupa: `aportaProduccion`). Por eso `calcularBruto`
 * la EXCLUYE y viaja en su propio campo del desglose; sí suma al neto, a lo
 * pendiente de cobro y al objetivo del estado de cobro, porque es dinero que
 * hay que cobrar. Ver `lib/hospitality/no-show.ts`.
 */

import { monedaEscritura } from '@/lib/moneda';

/**
 * Tipos de línea del desglose. `fianza` es la garantía registrada del huésped
 * (módulo `./fianza`): es un depósito, no un ingreso — `calcularBruto` la
 * aparta igual que la penalización y su retención real se lee con
 * `calcularFianzaRetenida`.
 */
export type LineaTipo = 'alojamiento' | 'limpieza' | 'extra' | 'otro' | 'penalizacion' | 'fianza';

export type PagoMetodo = 'stripe' | 'transferencia' | 'efectivo' | 'manual' | 'otro';

export type PagoEstado = 'pendiente' | 'pagado' | 'parcial' | 'reembolsado' | 'fallido';

export type EstadoCobro = 'pendiente' | 'parcial' | 'pagado' | 'sobrepagado' | 'reembolsado';

/** Línea de desglose tal como se guarda en `hospitality_reservation_items`. */
export interface LineaReserva {
  tipo: LineaTipo | string;
  concepto: string;
  cantidad: number;
  importeUnitario: number;
  importeTotal: number;
}

/** Pago tal como se guarda en `hospitality_payments`. */
export interface PagoReserva {
  importe: number;
  estado: PagoEstado | string;
  metodo?: PagoMetodo | string;
}

export interface GastoImputado {
  concepto: string;
  importe: number;
}

export interface RentabilidadReserva {
  moneda: string;
  /**
   * Ingreso de alojamiento y servicios: suma de las líneas MENOS la
   * penalización por no-show (que no es ingreso de alojamiento).
   */
  bruto: number;
  /** Desglose por tipo de línea (para pintar el detalle). */
  desglose: {
    alojamiento: number;
    limpieza: number;
    extra: number;
    otro: number;
    /** Cargo de cancelación por no-show (no es ingreso de alojamiento). */
    penalizacion: number;
  };
  /** Cargo por no-show emitido en esta reserva (0 si no hay). */
  penalizacion: number;
  comisionOta: number;
  comisionPasarela: number;
  otrosGastos: number;
  /** (bruto + penalizacion) - comisionOta - comisionPasarela - otrosGastos */
  neto: number;
  /** neto / (bruto + penalizacion), en porcentaje (0 si no hay nada). */
  margenPct: number;
  /** Suma de pagos netos (pagado - reembolsado). */
  cobrado: number;
  /** Cuánto falta por cobrar (nunca negativo). */
  pendiente: number;
  estadoCobro: EstadoCobro;
}

/** Redondeo a 2 decimales evitando el arrastre de coma flotante. */
export function redondear(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Importe total de una línea. Se calcula, no se confía en el valor recibido:
 * así cantidad x importe unitario nunca se contradice con el total.
 */
export function importeLinea(cantidad: number, importeUnitario: number): number {
  return redondear((cantidad || 0) * (importeUnitario || 0));
}

/** Normaliza una línea asegurando que el total corresponda a cantidad x precio. */
export function normalizarLinea(linea: {
  tipo?: string;
  concepto?: string;
  cantidad?: number;
  importeUnitario?: number;
  importeTotal?: number;
}): LineaReserva {
  const cantidad = linea.cantidad ?? 1;
  const importeUnitario = linea.importeUnitario ?? linea.importeTotal ?? 0;
  return {
    tipo: linea.tipo || 'otro',
    concepto: linea.concepto || 'Concepto',
    cantidad,
    importeUnitario: redondear(importeUnitario),
    importeTotal: importeLinea(cantidad, importeUnitario),
  };
}

/**
 * Ingreso bruto de la reserva: suma de las líneas **menos la penalización por
 * no-show**, que es un cargo de cancelación y no ingreso de alojamiento. Si se
 * sumara aquí, la reserva de un no-show «produciría» en Finanzas y el ADR/RevPAR
 * del período dejarían de cuadrar con la ocupación.
 */
export function calcularBruto(lineas: LineaReserva[]): number {
  return redondear(
    lineas
      .filter((linea) => linea.tipo !== 'penalizacion' && linea.tipo !== 'fianza')
      .reduce((total, linea) => total + (linea.importeTotal || 0), 0)
  );
}

/**
 * Suma de **todas** las líneas de la reserva, penalizaciones incluidas.
 *
 * Es el total que necesita la pantalla de cobros —«por qué importe está la
 * reserva»—, no el ingreso: para el ingreso está `calcularBruto`, que aparta la
 * penalización por el motivo que explica su comentario. La agregación vive aquí
 * y no en la ruta porque la analítica de la vertical se lee en un solo sitio
 * (`tests/hospitality-analitica-invariants.test.ts`).
 */
export function totalDeLineas(lineas: LineaReserva[]): number {
  return redondear(
    lineas.reduce((total, linea) => total + (linea.importeTotal || 0), 0)
  );
}

/**
 * Garantía registrada del huésped (líneas `tipo: 'fianza'`), tal como está:
 * pendiente, cobrada o devuelta. Es la cifra del DEPÓSITO — lo que el hotel
 * tiene en manos del huésped o le debe devolver. Nunca entra al bruto: es
 * dinero del huésped, no ingreso de la estancia.
 */
export function calcularFianza(lineas: LineaReserva[]): number {
  return redondear(
    lineas
      .filter((linea) => linea.tipo === 'fianza')
      .reduce((total, linea) => total + (linea.importeTotal || 0), 0)
  );
}

/**
 * Fianza RETENIDA por daños: la línea cuyo concepto dice "aplicada a daños",
 * con el importe ya reducido a lo efectivamente retenido. Esa parte sí es
 * ingreso — la factura el ERP — y por eso se lee aparte del depósito: el
 * informe puede mostrar "retenido 120 de 200" sin que el bruto del período
 * se mueva hasta que la factura exista.
 */
export function calcularFianzaRetenida(lineas: LineaReserva[]): number {
  return redondear(
    lineas
      .filter((linea) => linea.tipo === 'fianza' && linea.concepto.includes('aplicada a daños'))
      .reduce((total, linea) => total + (linea.importeTotal || 0), 0)
  );
}

/** Suma de las penalizaciones por no-show emitidas en la reserva. */
export function calcularPenalizacion(lineas: LineaReserva[]): number {
  return redondear(
    lineas
      .filter((linea) => linea.tipo === 'penalizacion')
      .reduce((total, linea) => total + (linea.importeTotal || 0), 0)
  );
}

/** Desglose por tipo de línea. */
export function desglosarLineas(lineas: LineaReserva[]): RentabilidadReserva['desglose'] {
  const desglose = { alojamiento: 0, limpieza: 0, extra: 0, otro: 0, penalizacion: 0 };
  for (const linea of lineas) {
    const clave = (['alojamiento', 'limpieza', 'extra', 'penalizacion'] as const).includes(
      linea.tipo as any
    )
      ? (linea.tipo as 'alojamiento' | 'limpieza' | 'extra' | 'penalizacion')
      : 'otro';
    desglose[clave] += linea.importeTotal || 0;
  }
  return {
    alojamiento: redondear(desglose.alojamiento),
    limpieza: redondear(desglose.limpieza),
    extra: redondear(desglose.extra),
    otro: redondear(desglose.otro),
    penalizacion: redondear(desglose.penalizacion),
  };
}

/**
 * Efectivo realmente cobrado: suma los pagos con estado `pagado` o `parcial`
 * y resta los reembolsos. Un pago `pendiente` o `fallido` no cobra nada.
 */
export function calcularCobrado(pagos: PagoReserva[]): number {
  let cobrado = 0;
  for (const pago of pagos) {
    const importe = pago.importe || 0;
    if (pago.estado === 'pagado' || pago.estado === 'parcial') cobrado += importe;
    if (pago.estado === 'reembolsado') cobrado -= Math.abs(importe);
  }
  return redondear(cobrado);
}

/**
 * Dinero devuelto al huésped: suma los pagos con estado `reembolsado`.
 *
 * Va aparte de `calcularCobrado` a propósito: el informe necesita ver por
 * separado lo que se cobró y lo que se devolvió, aunque para el cierre de
 * caja una cosa reste de la otra.
 */
export function calcularReembolsado(pagos: PagoReserva[]): number {
  return redondear(
    pagos.reduce(
      (total, pago) => total + (pago.estado === 'reembolsado' ? Math.abs(pago.importe || 0) : 0),
      0
    )
  );
}

/**
 * Estado de cobro derivado de lo cobrado contra el total de la reserva.
 * `total` es el importe a cobrar (normalmente el ingreso bruto).
 */
export function derivarEstadoCobro(total: number, cobrado: number): EstadoCobro {
  const objetivo = redondear(total);
  const recibido = redondear(cobrado);

  if (objetivo <= 0) return recibido > 0 ? 'sobrepagado' : 'pagado';
  if (recibido <= 0) return 'pendiente';
  if (recibido + 0.01 < objetivo) return 'parcial';
  if (recibido > objetivo + 0.01) return 'sobrepagado';
  return 'pagado';
}

export interface RentabilidadInput {
  lineas: LineaReserva[];
  pagos?: PagoReserva[];
  /** Comisión de la OTA. Ya llega en el webhook (`reservation.commission`). */
  comisionOta?: number;
  /** Comisión de la pasarela de pago del tenant (Stripe Connect). */
  comisionPasarela?: number;
  /** Gastos imputados a esta reserva (limpieza externa, incidencias...). */
  otrosGastos?: GastoImputado[] | number;
  moneda?: string;
}

/**
 * Desglose completo de una reserva:
 *
 * ```
 * Ingreso bruto        €700
 * Comisión OTA         -€105
 * Comisión pasarela     -€20
 * Otros gastos          -€25
 * ───────────────────────────
 * Ingreso neto         €550
 * ```
 *
 * Una reserva no-show con penalización se lee al revés y con sentido: bruto 0
 * (no hubo alojamiento), penalización €150, neto €150 — lo que el hotel ingresa
 * de verdad por esa reserva, y lo que queda pendiente de cobrar si no se ha
 * cobrado todavía.
 */
export function calcularRentabilidad(input: RentabilidadInput): RentabilidadReserva {
  const bruto = calcularBruto(input.lineas);
  const penalizacion = calcularPenalizacion(input.lineas);
  const comisionOta = redondear(Math.abs(input.comisionOta || 0));
  const comisionPasarela = redondear(Math.abs(input.comisionPasarela || 0));

  const otrosGastos = redondear(
    Array.isArray(input.otrosGastos)
      ? input.otrosGastos.reduce((total, gasto) => total + (gasto.importe || 0), 0)
      : Math.abs(input.otrosGastos || 0)
  );

  // Lo que hay que cobrar por esta reserva: alojamiento + penalización.
  const aCobrar = redondear(bruto + penalizacion);

  const neto = redondear(aCobrar - comisionOta - comisionPasarela - otrosGastos);
  const margenPct = aCobrar > 0 ? redondear((neto / aCobrar) * 100) : 0;

  const cobrado = calcularCobrado(input.pagos || []);
  const pendiente = Math.max(0, redondear(aCobrar - cobrado));

  return {
    moneda: monedaEscritura(input.moneda),
    bruto,
    desglose: desglosarLineas(input.lineas),
    penalizacion,
    comisionOta,
    comisionPasarela,
    otrosGastos,
    neto,
    margenPct,
    cobrado,
    pendiente,
    estadoCobro: derivarEstadoCobro(aCobrar, cobrado),
  };
}

/**
 * Construye las líneas de una reserva a partir del importe externo de la OTA
 * cuando no hay desglose. Permite que una reserva de canal siga teniendo
 * rentabilidad sin inventar conceptos: una sola línea de alojamiento.
 */
export function lineasDesdeImporteExterno(importe: number): LineaReserva[] {
  if (!importe || importe <= 0) return [];
  return [
    {
      tipo: 'alojamiento',
      concepto: 'Alojamiento',
      cantidad: 1,
      importeUnitario: redondear(importe),
      importeTotal: redondear(importe),
    },
  ];
}
