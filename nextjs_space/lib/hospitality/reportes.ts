/**
 * Reportes de Hospitality (plan maestro §23 y FASE 3.E).
 *
 * Módulo PURO: recibe reservas, unidades y propiedades ya leídos y devuelve las
 * métricas. No toca base de datos ni servicios externos.
 *
 * Reglas heredadas (no se reinterpretan aquí):
 * - La estancia ocupa la noche del día D si `checkIn <= D < checkOut` (§8). Se
 *   usa la primitiva `coversNight` del módulo de analíticas: una sola
 *   definición de "noche ocupada" en todo el proyecto.
 * - Canceladas y no_show no aportan ocupación ni ingresos; sí se cuentan como
 *   cancelaciones y no-shows, que es justo lo que el informe quiere mostrar.
 * - El dinero sale de `finance-summary`, que a su vez delega en `finance.ts`.
 *   Este módulo no tiene aritmética de importes propia.
 */

import { coversNight } from './analytics';
import { nightsBetween, toIsoDate } from './calendar';
import { redondear } from './finance';
import {
  desglosePorCanal,
  esReservaConVenta,
  filasFinancieras,
  resumenFinanciero,
  type FilaFinanciera,
  type ReservaFinanciera,
  type TotalesFinancieros,
} from './finance-summary';

/**
 * Reserva del informe. Es la financiera tal cual: ya incluye la fecha de
 * reserva (`bookedOn`), que es lo único que el informe añade a su cálculo.
 * Se mantiene el nombre porque es el que usan los consumidores del informe.
 */
export type ReporteReserva = ReservaFinanciera;

interface ReservaNormalizada extends ReporteReserva {
  checkInDate: Date;
  checkOutDate: Date;
}

export interface ReporteUnidad {
  id: string;
  propertyId: string;
}

export interface ReportePropiedad {
  id: string;
  nombre: string;
}

export interface ReporteRango {
  desde: Date;
  hasta: Date;
}

/**
 * Ratio con 4 decimales. Se guarda con esta precisión a propósito: redondear a
 * dos decimales aquí y volver a multiplicar por 100 al exportar convertía un
 * 66,67 % en un 67 %, que es un dato equivocado en el CSV.
 */
function redondearRatio(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.round(valor * 10000) / 10000;
}

function normalizar(reservas: ReporteReserva[]): ReservaNormalizada[] {
  return reservas
    .map((reserva) => {
      const checkInDate = new Date(reserva.checkIn);
      const checkOutDate = new Date(reserva.checkOut);
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) return null;
      return { ...reserva, checkInDate, checkOutDate };
    })
    .filter((r): r is ReservaNormalizada => r !== null);
}

/** Unidad de negocio directa: la web propia, no un canal de distribución. */
export function esCanalDirecto(channel: string): boolean {
  return /direct|volkern|web|landing/i.test(channel || '');
}

/** Noches de un rango [desde, hasta): la noche del día `hasta` no cuenta. */
export function nochesDelRango(desde: Date, hasta: Date): number {
  return nightsBetween(desde, hasta);
}

/**
 * Si la reserva ocupa la noche indicada. Se le pasan fechas ya convertidas a
 * `Date` porque la primitiva compara instantes, no cadenas.
 */
function cubreNoche(reserva: ReservaNormalizada, dayStartMs: number): boolean {
  return coversNight(
    { checkIn: reserva.checkInDate, checkOut: reserva.checkOutDate, estado: reserva.estado },
    dayStartMs
  );
}

/** Unidades ocupadas por día dentro del rango, con la primitiva del proyecto. */
function nochesOcupadas(
  reservas: ReservaNormalizada[],
  desde: Date,
  hasta: Date
): { noches: number; porDia: Array<{ fecha: string; ocupadas: number }> } {
  const porDia: Array<{ fecha: string; ocupadas: number }> = [];
  let noches = 0;

  const dia = new Date(desde);
  dia.setHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(0, 0, 0, 0);

  for (let cursor = dia.getTime(); cursor < fin.getTime(); cursor += 86_400_000) {
    const ocupadas = new Set<string>();
    for (const reserva of reservas) {
      if (!reserva.unitId) continue;
      if (cubreNoche(reserva, cursor)) {
        ocupadas.add(reserva.unitId);
      }
    }
    noches += ocupadas.size;
    porDia.push({ fecha: toIsoDate(new Date(cursor)), ocupadas: ocupadas.size });
  }

  return { noches, porDia };
}

export interface ReporteOperacion {
  nochesDisponibles: number;
  nochesOcupadas: number;
  ocupacion: number; // 0..1
  unidades: number;
  reservas: number;
  reservasConVenta: number;
  llegadas: number;
  salidas: number;
  cancelaciones: number;
  noShows: number;
  estanciaMedia: number;
  adr: number | null;
  revpar: number | null;
  ingresos: number;
  diario: Array<{ fecha: string; ocupadas: number; ocupacion: number }>;
}

/**
 * Reporte de operación del rango: ocupación, ADR, RevPAR, estancia media,
 * llegadas, salidas, cancelaciones y no-shows.
 *
 * ADR y RevPAR solo se devuelven cuando hay base para calcularlos: sin noches
 * vendidas o sin unidades, devolver un número sería inventarlo.
 */
export function reporteOperacion(params: {
  reservas: ReporteReserva[];
  unidades: ReporteUnidad[];
  desde: Date;
  hasta: Date;
  /** Unidades del inventario activas; por defecto todas las recibidas. */
  unidadesActivas?: string[];
}): ReporteOperacion {
  const { desde, hasta } = params;
  const reservas = normalizar(params.reservas);
  const activas = params.unidadesActivas
    ? params.unidades.filter((u) => params.unidadesActivas!.includes(u.id))
    : params.unidades;

  const noches = nochesDelRango(desde, hasta);
  const nochesDisponibles = activas.length * noches;

  const { noches: ocupadas, porDia } = nochesOcupadas(reservas, desde, hasta);

  const conVenta = reservas.filter((r) => esReservaConVenta(r.estado));
  const totales = resumenFinanciero(filasFinancieras(conVenta));
  const ingresos = totales.bruto;

  const desdeMs = desde.getTime();
  const hastaMs = hasta.getTime();
  const enRango = (fecha: Date) => fecha.getTime() >= desdeMs && fecha.getTime() < hastaMs;

  return {
    nochesDisponibles,
    nochesOcupadas: ocupadas,
    ocupacion: nochesDisponibles > 0 ? redondearRatio(ocupadas / nochesDisponibles) : 0,
    unidades: activas.length,
    reservas: reservas.length,
    reservasConVenta: conVenta.length,
    llegadas: reservas.filter((r) => enRango(r.checkInDate)).length,
    salidas: reservas.filter((r) => enRango(r.checkOutDate)).length,
    cancelaciones: reservas.filter((r) => r.estado === 'cancelled').length,
    noShows: reservas.filter((r) => r.estado === 'no_show').length,
    estanciaMedia: conVenta.length > 0 ? redondear(ocupadas / conVenta.length) : 0,
    adr: ocupadas > 0 ? redondear(ingresos / ocupadas) : null,
    revpar: nochesDisponibles > 0 ? redondear(ingresos / nochesDisponibles) : null,
    ingresos,
    diario: porDia.map((punto) => ({
      ...punto,
      ocupacion: activas.length > 0 ? redondearRatio(punto.ocupadas / activas.length) : 0,
    })),
  };
}

export interface CanalVentas {
  canal: string;
  reservas: number;
  noches: number;
  ingresos: number;
  neto: number;
  ticketMedio: number;
  pctReservas: number;
  pctIngresos: number;
  directo: boolean;
}

export interface ReporteVentas {
  canales: CanalVentas[];
  directas: { reservas: number; ingresos: number; pctReservas: number; pctIngresos: number };
  antelacionMedia: number | null;
  masAnticipada: number | null;
  masTardia: number | null;
}

/** Días entre la reserva y la llegada. Negativo si la reserva es de última hora. */
function antelacionDias(reserva: ReservaNormalizada): number | null {
  if (!reserva.bookedOn) return null;
  const booked = new Date(reserva.bookedOn);
  if (isNaN(booked.getTime())) return null;
  const llegada = new Date(reserva.checkInDate);
  llegada.setHours(0, 0, 0, 0);
  booked.setHours(0, 0, 0, 0);
  return Math.round((llegada.getTime() - booked.getTime()) / 86_400_000);
}

/**
 * Reporte de ventas: mix de canales, peso de la reserva directa y antelación
 * media con la que reservan los huéspedes.
 */
export function reporteVentas(params: { reservas: ReporteReserva[] }): ReporteVentas {
  const reservas = normalizar(params.reservas);
  const conVenta = reservas.filter((r) => esReservaConVenta(r.estado));
  const filas = filasFinancieras(conVenta);
  const totalBruto = redondear(filas.reduce((t, f) => t + f.bruto, 0));

  const nochesPorReserva = new Map(
    conVenta.map((r) => [r.id, nightsBetween(r.checkInDate, r.checkOutDate)] as const)
  );

  const canales = desglosePorCanal(filas).map((grupo) => {
    const ids = new Set(
      filas.filter((f) => (f.channel || 'sin_asignar') === grupo.clave).map((f) => f.id)
    );
    const noches = conVenta
      .filter((r) => ids.has(r.id))
      .reduce((t, r) => t + (nochesPorReserva.get(r.id) || 0), 0);

    return {
      canal: grupo.etiqueta,
      reservas: grupo.totales.reservasConVenta,
      noches,
      ingresos: grupo.totales.bruto,
      neto: grupo.totales.neto,
      ticketMedio: grupo.totales.ticketMedio,
      pctReservas:
        conVenta.length > 0 ? redondear((grupo.totales.reservasConVenta / conVenta.length) * 100) : 0,
      pctIngresos: totalBruto > 0 ? redondear((grupo.totales.bruto / totalBruto) * 100) : 0,
      directo: esCanalDirecto(grupo.etiqueta),
    };
  });

  const filasDirectas = filas.filter((f) => esCanalDirecto(f.channel));
  const antelaciones = conVenta
    .map(antelacionDias)
    .filter((dias): dias is number => dias !== null);

  return {
    canales,
    directas: {
      reservas: filasDirectas.length,
      ingresos: redondear(filasDirectas.reduce((t, f) => t + f.bruto, 0)),
      pctReservas:
        conVenta.length > 0 ? redondear((filasDirectas.length / conVenta.length) * 100) : 0,
      pctIngresos:
        totalBruto > 0
          ? redondear(
              (filasDirectas.reduce((t, f) => t + f.bruto, 0) / totalBruto) * 100
            )
          : 0,
    },
    antelacionMedia:
      antelaciones.length > 0
        ? redondear(antelaciones.reduce((t, d) => t + d, 0) / antelaciones.length)
        : null,
    masAnticipada: antelaciones.length > 0 ? Math.max(...antelaciones) : null,
    masTardia: antelaciones.length > 0 ? Math.min(...antelaciones) : null,
  };
}

export interface PropiedadReporte {
  propertyId: string;
  nombre: string;
  unidades: number;
  nochesDisponibles: number;
  nochesOcupadas: number;
  ocupacion: number;
  reservas: number;
  ingresos: number;
  neto: number;
  margenPct: number;
  adr: number | null;
}

/**
 * Reporte por propiedad: responde qué apartamento está dando más dinero, que
 * no siempre es el que más vende (§Reportes del plan).
 */
export function reportePropiedades(params: {
  propiedades: ReportePropiedad[];
  unidades: ReporteUnidad[];
  reservas: ReporteReserva[];
  desde: Date;
  hasta: Date;
}): PropiedadReporte[] {
  const { desde, hasta, propiedades, unidades } = params;
  const reservas = normalizar(params.reservas);
  const noches = nochesDelRango(desde, hasta);

  return propiedades
    .map((propiedad) => {
      const unidadesPropiedad = unidades.filter((u) => u.propertyId === propiedad.id);
      const reservasPropiedad = reservas.filter((r) => r.propertyId === propiedad.id);

      const { noches: ocupadas } = nochesOcupadas(reservasPropiedad, desde, hasta);
      const conVenta = reservasPropiedad.filter((r) => esReservaConVenta(r.estado));
      const totales = resumenFinanciero(filasFinancieras(conVenta));
      const nochesDisponibles = unidadesPropiedad.length * noches;

      return {
        propertyId: propiedad.id,
        nombre: propiedad.nombre,
        unidades: unidadesPropiedad.length,
        nochesDisponibles,
        nochesOcupadas: ocupadas,
        ocupacion: nochesDisponibles > 0 ? redondearRatio(ocupadas / nochesDisponibles) : 0,
        reservas: conVenta.length,
        ingresos: totales.bruto,
        neto: totales.neto,
        margenPct: totales.margenPct,
        adr: ocupadas > 0 ? redondear(totales.bruto / ocupadas) : null,
      };
    })
    // Ordenado por ingreso neto, no por venta: la pregunta del propietario es
    // cuál de sus apartamentos le está dejando más dinero.
    .sort((a, b) => b.neto - a.neto);
}

/** Totales financieros del período, para la pestaña de finanzas del informe. */
export function reporteFinanciero(params: { reservas: ReporteReserva[] }): {
  totales: TotalesFinancieros;
  porCanal: ReturnType<typeof desglosePorCanal>;
  filas: FilaFinanciera[];
} {
  const filas = filasFinancieras(normalizar(params.reservas));
  return {
    totales: resumenFinanciero(filas),
    porCanal: desglosePorCanal(filas),
    filas,
  };
}

/** CSV del reporte por propiedad. */
export function csvPropiedades(filas: PropiedadReporte[], separador = ','): string {
  const cabecera = [
    'propiedad',
    'unidades',
    'noches_disponibles',
    'noches_ocupadas',
    'ocupacion_pct',
    'reservas',
    'ingresos',
    'ingreso_neto',
    'margen_pct',
    'adr',
  ];
  const escapar = (valor: unknown): string => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = filas.map((fila) =>
    [
      fila.nombre,
      fila.unidades,
      fila.nochesDisponibles,
      fila.nochesOcupadas,
      redondear(fila.ocupacion * 100),
      fila.reservas,
      fila.ingresos,
      fila.neto,
      fila.margenPct,
      fila.adr ?? '',
    ]
      .map(escapar)
      .join(separador)
  );
  return [cabecera.join(separador), ...lineas].join('\n');
}

/** CSV del reporte de ventas por canal. */
export function csvCanales(filas: CanalVentas[], separador = ','): string {
  const cabecera = [
    'canal',
    'reservas',
    'noches',
    'ingresos',
    'ingreso_neto',
    'ticket_medio',
    'pct_reservas',
    'pct_ingresos',
    'directo',
  ];
  const escapar = (valor: unknown): string => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = filas.map((fila) =>
    [
      fila.canal,
      fila.reservas,
      fila.noches,
      fila.ingresos,
      fila.neto,
      fila.ticketMedio,
      fila.pctReservas,
      fila.pctIngresos,
      fila.directo ? 'sí' : 'no',
    ]
      .map(escapar)
      .join(separador)
  );
  return [cabecera.join(separador), ...lineas].join('\n');
}
