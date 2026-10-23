/**
 * Agregados financieros de Hospitality (FASE 3.B — Finanzas).
 *
 * Módulo PURO: recibe reservas con sus líneas y pagos ya leídos y devuelve los
 * totales que ve el propietario. No toca base de datos ni servicios externos.
 *
 * Reglas del plan (docs/hospitality-booking-payments-plan.md §3.5):
 * - El **ingreso neto** sale siempre de `calcularRentabilidad`. Aquí no hay una
 *   segunda fórmula de dinero que pueda divergir de la de la reserva.
 * - Una reserva **cancelada o no_show no es venta**: no aporta bruto ni neto.
 *   Pero si tuvo pagos, el dinero sí salió, así que los reembolsos y lo cobrado
 *   se informan aparte en vez de desaparecer del informe.
 * - El estado de cobro se **deriva** de los pagos; nunca se guarda ni se estima.
 */

import {
  calcularReembolsado,
  calcularRentabilidad,
  importeLinea,
  redondear,
  type EstadoCobro,
  type LineaReserva,
  type PagoReserva,
  type RentabilidadReserva,
} from './finance';

/** Reserva tal como la lee la capa de datos para el informe financiero. */
export interface ReservaFinanciera {
  id: string;
  channel: string;
  estado: string;
  checkIn: Date | string;
  checkOut: Date | string;
  /** Fecha en que se hizo la reserva (para la antelación media). */
  bookedOn?: Date | string | null;
  propertyId?: string | null;
  propertyNombre?: string | null;
  unitId?: string | null;
  unidadNombre?: string | null;
  huesped?: string | null;
  moneda?: string | null;
  lineas: LineaReserva[];
  pagos: PagoReserva[];
  /** Comisión de la OTA: ya llega en el webhook (`reservation.commission`). */
  comisionOta?: number | null;
  /** Comisión de la pasarela del tenant (Stripe Connect). */
  comisionPasarela?: number | null;
  /** Gastos imputados a esta reserva. */
  otrosGastos?: number | null;
}

/** Reserva que sí es venta: la cancelada y el no_show no cuentan como ingreso. */
export function esReservaConVenta(estado: string): boolean {
  return estado !== 'cancelled' && estado !== 'no_show';
}

/** Rentabilidad completa de una reserva, delegando el cálculo en `finance.ts`. */
export function rentabilidadDeReserva(reserva: ReservaFinanciera): RentabilidadReserva {
  return calcularRentabilidad({
    lineas: reserva.lineas,
    pagos: reserva.pagos,
    comisionOta: reserva.comisionOta || 0,
    comisionPasarela: reserva.comisionPasarela || 0,
    otrosGastos: reserva.otrosGastos || 0,
    // Se propaga la divisa tal cual: fabricar una aquí haría que el informe la
    // tomara por un dato real y ganara sobre la moneda del tenant.
    moneda: reserva.moneda || '',
  });
}

/** Fila del informe: la reserva con su rentabilidad ya calculada. */
export interface FilaFinanciera {
  id: string;
  channel: string;
  estado: string;
  checkIn: string;
  checkOut: string;
  noches: number;
  propertyId: string | null;
  propertyNombre: string | null;
  unidadNombre: string | null;
  huesped: string | null;
  moneda: string;
  esVenta: boolean;
  bruto: number;
  desglose: RentabilidadReserva['desglose'];
  comisionOta: number;
  comisionPasarela: number;
  otrosGastos: number;
  neto: number;
  margenPct: number;
  cobrado: number;
  pendiente: number;
  /** Dinero devuelto al huésped (leído de los pagos, no del neto). */
  reembolsado: number;
  estadoCobro: EstadoCobro;
}

function aIso(fecha: Date | string): string {
  return typeof fecha === 'string' ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10);
}

function nochesDe(checkIn: Date | string, checkOut: Date | string): number {
  const inicio = new Date(checkIn).getTime();
  const fin = new Date(checkOut).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return 0;
  return Math.round((fin - inicio) / 86_400_000);
}

/** Convierte las reservas en filas del informe, con su rentabilidad resuelta. */
export function filasFinancieras(reservas: ReservaFinanciera[]): FilaFinanciera[] {
  return reservas.map((reserva) => {
    const rentabilidad = rentabilidadDeReserva(reserva);
    return {
      id: reserva.id,
      channel: reserva.channel,
      estado: reserva.estado,
      checkIn: aIso(reserva.checkIn),
      checkOut: aIso(reserva.checkOut),
      noches: nochesDe(reserva.checkIn, reserva.checkOut),
      propertyId: reserva.propertyId ?? null,
      propertyNombre: reserva.propertyNombre ?? null,
      unidadNombre: reserva.unidadNombre ?? null,
      huesped: reserva.huesped ?? null,
      moneda: rentabilidad.moneda,
      esVenta: esReservaConVenta(reserva.estado),
      bruto: rentabilidad.bruto,
      desglose: rentabilidad.desglose,
      comisionOta: rentabilidad.comisionOta,
      comisionPasarela: rentabilidad.comisionPasarela,
      otrosGastos: rentabilidad.otrosGastos,
      neto: rentabilidad.neto,
      margenPct: rentabilidad.margenPct,
      cobrado: rentabilidad.cobrado,
      pendiente: rentabilidad.pendiente,
      reembolsado: calcularReembolsado(reserva.pagos),
      estadoCobro: rentabilidad.estadoCobro,
    };
  });
}

export interface TotalesFinancieros {
  reservas: number;
  /** Reservas que son venta (excluye canceladas y no_show). */
  reservasConVenta: number;
  noches: number;
  bruto: number;
  desglose: RentabilidadReserva['desglose'];
  comisionOta: number;
  comisionPasarela: number;
  comisiones: number;
  otrosGastos: number;
  neto: number;
  margenPct: number;
  cobrado: number;
  pendiente: number;
  /** Dinero devuelto (pagado y luego reembolsado), informado aparte. */
  reembolsado: number;
  ticketMedio: number;
}

/**
 * Totales del período. Solo suman las reservas con venta; los reembolsos se
 * informan aparte porque corresponden a reservas que ya no son venta.
 */
export function resumenFinanciero(filas: FilaFinanciera[]): TotalesFinancieros {
  const conVenta = filas.filter((f) => f.esVenta);

  const acumular = (clave: keyof RentabilidadReserva['desglose']) =>
    redondear(conVenta.reduce((t, f) => t + (f.desglose[clave] || 0), 0));

  const bruto = redondear(conVenta.reduce((t, f) => t + f.bruto, 0));
  const comisionOta = redondear(conVenta.reduce((t, f) => t + f.comisionOta, 0));
  const comisionPasarela = redondear(conVenta.reduce((t, f) => t + f.comisionPasarela, 0));
  const otrosGastos = redondear(conVenta.reduce((t, f) => t + f.otrosGastos, 0));
  const neto = redondear(conVenta.reduce((t, f) => t + f.neto, 0));
  const cobrado = redondear(conVenta.reduce((t, f) => t + f.cobrado, 0));
  const pendiente = redondear(conVenta.reduce((t, f) => t + f.pendiente, 0));
  const noches = conVenta.reduce((t, f) => t + f.noches, 0);

  // Los reembolsos se suman sobre TODAS las filas, no solo las que son venta:
  // una reserva cancelada pudo cobrarse y devolverse, y eso hay que verlo.
  const reembolsado = redondear(filas.reduce((total, fila) => total + fila.reembolsado, 0));

  return {
    reservas: filas.length,
    reservasConVenta: conVenta.length,
    noches,
    bruto,
    desglose: {
      alojamiento: acumular('alojamiento'),
      limpieza: acumular('limpieza'),
      extra: acumular('extra'),
      // Las rebajas se acumulan en negativo: el bruto sigue siendo la suma del
      // desglose, y aun así se ve cuánto se dejó en promociones en el período.
      descuento: acumular('descuento'),
      otro: acumular('otro'),
      // La penalización por no-show es un cargo de cancelación: no es ingreso
      // de alojamiento, así que viaja en su propia línea y no en «alojamiento».
      penalizacion: acumular('penalizacion'),
    },
    comisionOta,
    comisionPasarela,
    comisiones: redondear(comisionOta + comisionPasarela),
    otrosGastos,
    neto,
    margenPct: bruto > 0 ? redondear((neto / bruto) * 100) : 0,
    cobrado,
    pendiente,
    reembolsado,
    ticketMedio: conVenta.length > 0 ? redondear(bruto / conVenta.length) : 0,
  };
}

export interface GrupoFinanciero {
  clave: string;
  etiqueta: string;
  totales: TotalesFinancieros;
}

/**
 * Agrupa por una clave (canal, propiedad...) ordenando por bruto descendente.
 *
 * Solo agrupa reservas que son venta: un canal cuyas reservas se cancelaron no
 * tiene dinero que mostrar, y aparecer con ceros en el informe financiero haría
 * creer que vendió. Las cancelaciones se informan en el reporte de operación.
 */
function agrupar(
  filas: FilaFinanciera[],
  claveDe: (fila: FilaFinanciera) => string,
  etiquetaDe: (fila: FilaFinanciera, clave: string) => string
): GrupoFinanciero[] {
  const grupos = new Map<string, FilaFinanciera[]>();
  for (const fila of filas) {
    if (!fila.esVenta) continue;
    const clave = claveDe(fila) || 'sin_asignar';
    const lista = grupos.get(clave) || [];
    lista.push(fila);
    grupos.set(clave, lista);
  }

  return Array.from(grupos.entries())
    .map(([clave, lista]) => ({
      clave,
      etiqueta: etiquetaDe(lista[0], clave),
      totales: resumenFinanciero(lista),
    }))
    .sort((a, b) => b.totales.bruto - a.totales.bruto);
}

/** Desglose por canal de venta (mix de canales del informe financiero). */
export function desglosePorCanal(filas: FilaFinanciera[]): GrupoFinanciero[] {
  return agrupar(
    filas,
    (fila) => fila.channel,
    (_fila, clave) => (clave === 'sin_asignar' ? 'Sin canal' : clave)
  );
}

/** Desglose por propiedad: responde cuál deja más dinero, no solo cuál vende más. */
export function desglosePorPropiedad(filas: FilaFinanciera[]): GrupoFinanciero[] {
  return agrupar(
    filas,
    (fila) => fila.propertyId || 'sin_asignar',
    (fila, clave) => (clave === 'sin_asignar' ? 'Sin propiedad' : fila.propertyNombre || clave)
  );
}

/** Cuántas reservas hay en cada estado de cobro (pendiente/parcial/pagado...). */
export function conteoPorEstadoCobro(filas: FilaFinanciera[]): Record<EstadoCobro, number> {
  const conteo: Record<EstadoCobro, number> = {
    pendiente: 0,
    parcial: 0,
    pagado: 0,
    sobrepagado: 0,
    reembolsado: 0,
  };
  for (const fila of filas) {
    if (!fila.esVenta) continue;
    conteo[fila.estadoCobro] = (conteo[fila.estadoCobro] || 0) + 1;
  }
  return conteo;
}

/** Comisión de pasarela estimada: el porcentaje se aplica solo a lo cobrado. */
export function comisionPasarelaEstimada(cobrado: number, porcentaje: number): number {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  return redondear((cobrado * porcentaje) / 100);
}

/** Línea de desglose normalizada para guardar (total = cantidad x unitario). */
export function lineaParaGuardar(entrada: {
  tipo?: string;
  concepto?: string;
  cantidad?: number;
  importeUnitario?: number;
}): LineaReserva {
  const cantidad = Number(entrada.cantidad ?? 1) || 1;
  const importeUnitario = Number(entrada.importeUnitario ?? 0) || 0;
  return {
    tipo: entrada.tipo || 'otro',
    concepto: (entrada.concepto || 'Concepto').trim(),
    cantidad,
    importeUnitario: redondear(importeUnitario),
    importeTotal: importeLinea(cantidad, importeUnitario),
  };
}

/** CSV del informe, listo para descargar (una fila por reserva). */
export function csvFinanciero(filas: FilaFinanciera[], separador = ','): string {
  const cabecera = [
    'reserva',
    'canal',
    'propiedad',
    'unidad',
    'huesped',
    'check_in',
    'check_out',
    'noches',
    'estado',
    'moneda',
    'importe_alojamiento',
    'importe_limpieza',
    'importe_extras',
    'importe_descuento',
    'importe_otros',
    'ingreso_bruto',
    'comision_ota',
    'comision_pasarela',
    'otros_gastos',
    'ingreso_neto',
    'margen_pct',
    'cobrado',
    'pendiente',
    'estado_cobro',
  ];

  const escapar = (valor: unknown): string => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const lineas = filas.map((fila) =>
    [
      fila.id,
      fila.channel,
      fila.propertyNombre || '',
      fila.unidadNombre || '',
      fila.huesped || '',
      fila.checkIn,
      fila.checkOut,
      fila.noches,
      fila.estado,
      fila.moneda,
      fila.desglose.alojamiento,
      fila.desglose.limpieza,
      fila.desglose.extra,
      fila.desglose.descuento,
      fila.desglose.otro,
      fila.bruto,
      fila.comisionOta,
      fila.comisionPasarela,
      fila.otrosGastos,
      fila.neto,
      fila.margenPct,
      fila.cobrado,
      fila.pendiente,
      fila.estadoCobro,
    ]
      .map(escapar)
      .join(separador)
  );

  return [cabecera.join(separador), ...lineas].join('\n');
}
