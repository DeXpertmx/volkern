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
 */

export type LineaTipo = 'alojamiento' | 'limpieza' | 'extra' | 'otro';

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
  /** Suma de las líneas de la reserva. */
  bruto: number;
  /** Desglose por tipo de línea (para pintar el detalle). */
  desglose: {
    alojamiento: number;
    limpieza: number;
    extra: number;
    otro: number;
  };
  comisionOta: number;
  comisionPasarela: number;
  otrosGastos: number;
  /** bruto - comisionOta - comisionPasarela - otrosGastos */
  neto: number;
  /** neto / bruto, en porcentaje (0 si no hay bruto). */
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

/** Suma el importe de todas las líneas. Es el ingreso bruto de la reserva. */
export function calcularBruto(lineas: LineaReserva[]): number {
  return redondear(lineas.reduce((total, linea) => total + (linea.importeTotal || 0), 0));
}

/** Desglose por tipo de línea. */
export function desglosarLineas(lineas: LineaReserva[]): RentabilidadReserva['desglose'] {
  const desglose = { alojamiento: 0, limpieza: 0, extra: 0, otro: 0 };
  for (const linea of lineas) {
    const clave = (['alojamiento', 'limpieza', 'extra'] as const).includes(linea.tipo as any)
      ? (linea.tipo as 'alojamiento' | 'limpieza' | 'extra')
      : 'otro';
    desglose[clave] += linea.importeTotal || 0;
  }
  return {
    alojamiento: redondear(desglose.alojamiento),
    limpieza: redondear(desglose.limpieza),
    extra: redondear(desglose.extra),
    otro: redondear(desglose.otro),
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
 * Dinero devuelto al huésped: suma de los pagos marcados como reembolsados.
 *
 * Se calcula sobre los pagos y no sobre el neto cobrado a propósito: una
 * reserva cobrada y devuelta por el mismo importe deja `cobrado = 0`, y mirando
 * solo esa resta el reembolso desaparecería del informe.
 */
export function calcularReembolsado(pagos: PagoReserva[]): number {
  return redondear(
    pagos.reduce(
      (total, pago) =>
        total + (pago.estado === 'reembolsado' ? Math.abs(pago.importe || 0) : 0),
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
 */
export function calcularRentabilidad(input: RentabilidadInput): RentabilidadReserva {
  const bruto = calcularBruto(input.lineas);
  const comisionOta = redondear(Math.abs(input.comisionOta || 0));
  const comisionPasarela = redondear(Math.abs(input.comisionPasarela || 0));

  const otrosGastos = redondear(
    Array.isArray(input.otrosGastos)
      ? input.otrosGastos.reduce((total, gasto) => total + (gasto.importe || 0), 0)
      : Math.abs(input.otrosGastos || 0)
  );

  const neto = redondear(bruto - comisionOta - comisionPasarela - otrosGastos);
  const margenPct = bruto > 0 ? redondear((neto / bruto) * 100) : 0;

  const cobrado = calcularCobrado(input.pagos || []);
  const pendiente = Math.max(0, redondear(bruto - cobrado));

  return {
    moneda: input.moneda || 'MXN',
    bruto,
    desglose: desglosarLineas(input.lineas),
    comisionOta,
    comisionPasarela,
    otrosGastos,
    neto,
    margenPct,
    cobrado,
    pendiente,
    estadoCobro: derivarEstadoCobro(bruto, cobrado),
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
