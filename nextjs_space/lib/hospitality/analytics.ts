/**
 * Analíticas de Hospitality (plan maestro §23 y FASE 3.E de Reportes) —
 * módulo puro, sin BD.
 *
 * Drill-downs del dashboard:
 *  - Ocupación por propiedad: % de unidades ocupadas por día (ventana de N días).
 *  - Ocupación global (`ocupacionPorDia`): la usan dashboard, operaciones y
 *    reportes; nadie compara fechas por su cuenta fuera del módulo.
 *  - Tendencia de ingresos por canal: ingresos por día atribuidos por noche
 *    (cada reserva reparte su importe entre las noches que ocupa), que es la
 *    misma base con la que se calcula el ADR.
 *
 * KPIs de reportes (FASE 3.E, `kpisVentana`): ADR, RevPAR, estancia media,
 * no-shows, cancelaciones y antelación media/mediana de la reserva.
 *
 * Reglas heredadas del módulo:
 *  - Estancia: la noche del día D está ocupada si checkIn <= D < checkOut (§8),
 *    comparado POR DÍAS (las reservas se guardan con hora). La noche del
 *    check-out NO cuenta como ocupada.
 *  - Canceladas y no_show no aportan ocupación ni ingresos (`aportaProduccion`).
 *  - La ocupación se calcula SOLO en `ocupacionPorDia`; ninguna ruta ni página
 *    compara fechas por su cuenta.
 *  - Reservas sin unidad no aportan ocupación (no se pueden atribuir).
 */

import { aportaProduccion, esMovimientoDelDia } from './estados';
import { nightsBetween, toIsoDate } from './calendar';
import { finEstanciaReal } from './checkout';
// Multimoneda (H11/H22): los importes de un informe se suman SOLO en su divisa;
// las reservas en otra quedan fuera de los totales y se informan aparte. Se
// aplica aquí, en el cálculo, para que ninguna pantalla pueda sumar divisas
// distintas ni aunque le pase una lista mezclada.
import {
  agruparPorMoneda,
  describirMultimoneda,
  estaEnMonedaDelInforme,
  monedaDelInforme,
  type Multimoneda,
} from './multimoneda';

export interface AnalyticsReservationInput {
  id: string
  propertyId: string
  unitId: string | null
  channel: string
  estado: string
  checkIn: Date
  checkOut: Date
  /** Salida real (check-out anticipado, opción B); null si no hubo. */
  checkOutReal?: Date | null
  amountAfterTax: number | null
  currency: string
}

export interface OccupancyPoint {
  fecha: string
  ocupadas: number
  total: number
  ocupacion: number // 0..1
}

export interface PropertyOccupancySerie {
  propertyId: string
  nombre: string
  totalUnidades: number
  ocupacionMedia: number
  puntos: OccupancyPoint[]
}

export interface MixCanal {
  canal: string
  reservas: number
  ingresos: number
}

/**
 * Mix de canales del período: reservas e ingresos por canal, ordenado por
 * número de reservas.
 *
 * Los ingresos son la suma del importe que reportó cada canal para las reservas
 * del período (no repartidos por noche: para la tendencia diaria está
 * `perChannelRevenueTrend`). Solo cuentan las reservas que produjeron.
 */
export function mixDeCanales(
  reservations: Array<
    Pick<AnalyticsReservationInput, 'channel' | 'estado' | 'amountAfterTax'> & {
      currency?: string | null
    }
  >,
  /** Divisa del informe; sin ella se deriva de las propias filas. */
  monedaInforme?: string | null,
): MixCanal[] {
  const moneda = monedaInforme || monedaDelInforme(reservations.map((r) => r.currency))
  const porCanal = new Map<string, MixCanal>()
  for (const r of reservations) {
    if (!aportaProduccion(r.estado)) continue
    // Los ingresos por canal se suman solo en la divisa del informe.
    if (!estaEnMonedaDelInforme({ moneda: r.currency }, moneda)) continue
    const canal = r.channel || 'Otro'
    const entrada = porCanal.get(canal) || { canal, reservas: 0, ingresos: 0 }
    entrada.reservas += 1
    entrada.ingresos += r.amountAfterTax || 0
    porCanal.set(canal, entrada)
  }
  return Array.from(porCanal.values()).sort((a, b) => b.reservas - a.reservas)
}

export interface ChannelRevenuePoint {
  fecha: string
  ingresos: number
}

/**
 * Totales de una lista de reservas — la que el operador tiene filtrada en
 * pantalla. Misma regla de producción que el resto del módulo: canceladas y
 * no-shows siguen en el historial pero no suman noches ni ingresos.
 *
 * La usa la página de Reservas para su cabecera: una tabla no debe recalcular
 * noches ni sumar importes por su cuenta.
 */
export function resumenReservas(
  reservations: Array<{
    estado: string
    checkIn: Date | string
    checkOut: Date | string
    amountAfterTax?: number | null
  }>,
): { reservas: number; noches: number; ingresos: number } {
  const aFecha = (v: Date | string) => (v instanceof Date ? v : new Date(v))
  let reservas = 0
  let noches = 0
  let ingresos = 0
  for (const r of reservations) {
    if (!aportaProduccion(r.estado)) continue
    reservas += 1
    noches += nightsBetween(aFecha(r.checkIn), aFecha(r.checkOut))
    ingresos += r.amountAfterTax || 0
  }
  return { reservas, noches, ingresos }
}

export interface ChannelRevenueSerie {
  canal: string
  total: number
  puntos: ChannelRevenuePoint[]
}

function startOfDayMs(d: Date): number {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c.getTime()
}

function toFecha(ms: number): string {
  // Fecha LOCAL, no UTC: `toISOString()` corre la serie un día en cualquier
  // huso por delante de UTC (los puntos del dashboard y el CSV salían con la
  // fecha del día anterior). `toIsoDate` es el helper de fechas del módulo.
  return toIsoDate(new Date(ms))
}

/**
 * La reserva cubre la noche del día `dayStartMs` (§8: checkIn <= D < checkOut).
 *
 * La comparación es POR DÍAS, no por instantes: las reservas se guardan con
 * hora (llegada 15:00, salida 11:00) y comparar instantes contra el inicio del
 * día corre la ocupación un día entero — cuenta la noche del check-out y pierde
 * la de la llegada. Es exactamente la regla del motor de disponibilidad
 * (`unitOccupiedOnDay`), y un test exige que las dos coincidan siempre.
 *
 * El fin es el REAL (`min(checkOut, checkOutReal)`, módulo checkout): con
 * salida anticipada la habitación vacía deja de contar como ocupada desde el
 * día de la salida real. Las NOCHES VENDIDAS (`nochesDe`) siguen usando el
 * checkOut previsto — ocupación ≠ producción.
 */
export function coversNight(
  r: Pick<AnalyticsReservationInput, 'checkIn' | 'checkOut' | 'estado'> &
    Pick<Partial<AnalyticsReservationInput>, 'checkOutReal'>,
  dayStartMs: number,
): boolean {
  if (!aportaProduccion(r.estado)) return false
  const fin = finEstanciaReal(r.checkOut, r.checkOutReal)
  return startOfDayMs(r.checkIn) <= dayStartMs && startOfDayMs(fin) > dayStartMs
}

/**
 * Reservas cuya LLEGADA cae en el día indicado (comparado por días: una
 * llegada a las 15:00 pertenece al día de su fecha, no al anterior).
 */
export function llegadasDelDia<T extends { checkIn: Date }>(
  reservations: T[],
  day: Date,
): T[] {
  const dia = startOfDayMs(day)
  return reservations.filter((r) => startOfDayMs(r.checkIn) === dia)
}

/** Reservas cuya SALIDA cae en el día indicado (comparado por días). */
export function salidasDelDia<T extends { checkOut: Date }>(
  reservations: T[],
  day: Date,
): T[] {
  const dia = startOfDayMs(day)
  return reservations.filter((r) => startOfDayMs(r.checkOut) === dia)
}

export interface OcupacionDiaria {
  /** Un punto por día, con las unidades ocupadas y el total del conjunto. */
  puntos: OccupancyPoint[]
  /** Media de la ocupación diaria (0..1). */
  ocupacionMedia: number
  /** Unidades consideradas (denominador de cada día). */
  unidades: number
}

/**
 * Ocupación día a día de un conjunto de unidades, con la regla §8 comparada
 * POR DÍAS (`coversNight`).
 *
 * Es la ÚNICA forma de calcular ocupación fuera del motor de disponibilidad:
 * el dashboard (hoy y próximos 7 días), el panel de operaciones y los reportes
 * la consumen de aquí en vez de reimplementar la comparación de fechas. Esa
 * comparación es justo donde se colaban los errores de un día de desfase.
 *
 * Las unidades bloqueadas o en mantenimiento cuentan como disponibles: es la
 * definición estándar de ocupación (la misma que la de RevPAR).
 */
export function ocupacionPorDia(params: {
  units: Array<{ id: string; propertyId?: string | null }>
  reservations: AnalyticsReservationInput[]
  dias?: number
  /** Primer día de la serie. Por defecto, los `dias` días que terminan en `hasta`. */
  desde?: Date
  hasta?: Date
}): OcupacionDiaria {
  const dias = Math.min(Math.max(params.dias || 30, 1), 365)
  const hastaMs = startOfDayMs(params.hasta || new Date())
  const desdeMs = params.desde ? startOfDayMs(params.desde) : hastaMs - (dias - 1) * 86_400_000

  const total = params.units.length
  const idsValidos = new Set(params.units.map((u) => u.id))
  // Solo las reservas atribuibles a estas unidades; el estado (canceladas y
  // no-show fuera) lo decide la regla, no este filtro.
  const atribuibles = params.reservations.filter((r) => !!r.unitId && idsValidos.has(r.unitId))

  let sumaOcupacion = 0
  const puntos: OccupancyPoint[] = []
  for (let i = 0; i < dias; i++) {
    const dayMs = desdeMs + i * 86_400_000
    const ocupadas = new Set<string>()
    // La regla vive en `coversNight`: aquí no se compara ninguna fecha a mano.
    for (const r of atribuibles) {
      if (coversNight(r, dayMs)) ocupadas.add(r.unitId as string)
    }
    const ocupacion = total > 0 ? ocupadas.size / total : 0
    sumaOcupacion += ocupacion
    puntos.push({ fecha: toFecha(dayMs), ocupadas: ocupadas.size, total, ocupacion })
  }

  return { puntos, ocupacionMedia: sumaOcupacion / dias, unidades: total }
}

/**
 * Ocupación diaria por propiedad durante los últimos `dias` días (incluye hoy).
 * Devuelve una serie por propiedad con al menos una unidad; las propiedades
 * sin unidades se omiten para no ensuciar la gráfica.
 */
export function perPropertyOccupancy(params: {
  properties: Array<{ id: string; nombre: string }>
  units: Array<{ id: string; propertyId: string }>
  reservations: AnalyticsReservationInput[]
  dias?: number
  hasta?: Date
}): PropertyOccupancySerie[] {
  const dias = Math.min(Math.max(params.dias || 30, 1), 365)
  const hasta = params.hasta || new Date()
  // Una sola implementación de la vuelta de días en el módulo: cada propiedad
  // delega en `ocupacionPorDia` con sus unidades y sus reservas.
  const desde = new Date(startOfDayMs(hasta) - (dias - 1) * 86_400_000)

  const series: PropertyOccupancySerie[] = []
  for (const p of params.properties) {
    const units = params.units.filter((u) => u.propertyId === p.id)
    if (units.length === 0) continue

    const { puntos, ocupacionMedia } = ocupacionPorDia({
      units,
      reservations: params.reservations.filter((r) => r.propertyId === p.id),
      dias,
      desde,
      hasta,
    })

    series.push({
      propertyId: p.id,
      nombre: p.nombre,
      totalUnidades: units.length,
      ocupacionMedia,
      puntos,
    })
  }
  return series
}

/**
 * Tendencia de ingresos por canal durante los últimos `dias` días (incluye
 * hoy). Cada reserva activa con importe reparte `amountAfterTax` de forma
 * equitativa entre las noches que ocupa; las noches fuera de la ventana no
 * aportan. Reservas sin noches (día completo) atribuyen todo al día de llegada.
 */
export function perChannelRevenueTrend(params: {
  reservations: AnalyticsReservationInput[]
  dias?: number
  hasta?: Date
  /** Divisa del informe; sin ella se deriva de las propias reservas. */
  monedaInforme?: string | null
}): ChannelRevenueSerie[] {
  const moneda = params.monedaInforme || monedaDelInforme(params.reservations.map((r) => r.currency))
  const dias = Math.min(Math.max(params.dias || 30, 1), 365)
  const hasta = params.hasta || new Date()
  const hoyMs = startOfDayMs(hasta)
  const diasSet = new Set<number>()
  const diasOrden: number[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const ms = hoyMs - i * 86_400_000
    diasSet.add(ms)
    diasOrden.push(ms)
  }

  // canal -> día -> ingresos
  const buckets = new Map<string, Map<number, number>>()

  for (const r of params.reservations) {
    if (!aportaProduccion(r.estado)) continue
    if (r.amountAfterTax == null || r.amountAfterTax <= 0) continue
    // La tendencia diaria es dinero: solo la divisa del informe.
    if (!estaEnMonedaDelInforme({ moneda: r.currency }, moneda)) continue
    const canal = r.channel || 'Otro'

    const noches = Math.max(0, Math.round((startOfDayMs(r.checkOut) - startOfDayMs(r.checkIn)) / 86_400_000))
    const porNoche = noches > 0 ? r.amountAfterTax / noches : r.amountAfterTax

    let bucket = buckets.get(canal)
    if (!bucket) {
      bucket = new Map<number, number>()
      buckets.set(canal, bucket)
    }

    if (noches === 0) {
      const diaMs = startOfDayMs(r.checkIn)
      if (diasSet.has(diaMs)) bucket.set(diaMs, (bucket.get(diaMs) || 0) + porNoche)
      continue
    }

    for (let n = 0; n < noches; n++) {
      const diaMs = startOfDayMs(r.checkIn) + n * 86_400_000
      if (!diasSet.has(diaMs)) continue
      bucket.set(diaMs, (bucket.get(diaMs) || 0) + porNoche)
    }
  }

  const series: ChannelRevenueSerie[] = []
  for (const [canal, bucket] of buckets) {
    let total = 0
    const puntos: ChannelRevenuePoint[] = diasOrden.map((ms) => {
      const v = Math.round((bucket.get(ms) || 0) * 100) / 100
      total += v
      return { fecha: toFecha(ms), ingresos: v }
    })
    series.push({ canal, total: Math.round(total * 100) / 100, puntos })
  }
  return series.sort((a, b) => b.total - a.total)
}

// ─── KPIs operativos y de ventas (FASE 3.E — Reportes) ─────────────────

export interface KpisVentana {
  /** Días de la ventana analizada. */
  dias: number
  /** Ingresos del período (suma de amountAfterTax de las reservas con ingreso). */
  ingresos: number
  /** Noches vendidas: las de las MISMAS reservas que producen los ingresos,
   *  para que ADR sea coherente con sus numeradores (ingresos / nochesVendidas). */
  nochesVendidas: number
  /** Noches disponibles de la ventana: unidades × días (denominador de RevPAR). */
  nochesDisponibles: number
  /** Ingreso por noche disponible: ingresos / noches disponibles. */
  adr: number | null
  /** Ingreso por unidad disponible: ingresos / (unidades × días). Igual que
   *  ADR × ocupación; se calcula por su cuenta para verificar el cruce. */
  revpar: number | null
  /** Noches de estancia / número de reservas (solo estancias con noches). */
  estanciaMedia: number | null
  /** Reservas que se presentaron y no cancelaron (base de no-shows). */
  llegadas: number
  /** Reservas marcadas no_show. Tasa = noShows / llegadas. */
  noShows: number
  tasaNoShow: number | null
  /** Reservas canceladas en la ventana (por fecha de llegada). */
  cancelaciones: number
  /** Días entre reserva y llegada, promediado sobre reservas con bookedOn. */
  antelacionMediaDias: number | null
  /** Mediana de la antelación, en días (más robusta que la media). */
  antelacionMedianaDias: number | null
  /** Divisa en la que están escritos los importes del informe. */
  moneda: string
  /** Aviso de mezcla de divisas: cuántas reservas quedan fuera de los totales. */
  multimoneda: Multimoneda
  /** Ingresos y noches de cada divisa, para no perder de vista las demás. */
  porMoneda: ResumenMonedaKpis[]
}

/** Ingresos del período en UNA divisa (las demás van en su propia entrada). */
export interface ResumenMonedaKpis {
  moneda: string
  reservas: number
  ingresos: number
  nochesVendidas: number
  adr: number | null
}

function nochesDe(r: Pick<AnalyticsReservationInput, 'checkIn' | 'checkOut'>): number {
  return Math.max(0, Math.round((startOfDayMs(r.checkOut) - startOfDayMs(r.checkIn)) / 86_400_000))
}

/** Antelación de una reserva en días (fecha de reserva → llegada). */
export function antelacionDias(
  r: Pick<AnalyticsReservationInput, 'checkIn'> & { bookedOn?: Date | null },
): number | null {
  if (!r.bookedOn) return null
  const reservaMs = startOfDayMs(r.bookedOn)
  const llegadaMs = startOfDayMs(r.checkIn)
  // Una reserva hecha hoy para hoy no es negativa: es cero días de antelación.
  return Math.max(0, Math.round((llegadaMs - reservaMs) / 86_400_000))
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2
}

/**
 * KPIs de la ventana (`dias` días que terminan en `hasta`, incluido hoy),
 * FASE 3.E del plan de Reportes.
 *
 * Definiciones (las noches siguen §8: checkIn <= D < checkOut):
 *  - Noches disponibles = unidades × días. La unidad cuenta disponible aunque
 *    haya bloqueos o mantenimiento: es la definición estándar de RevPAR y la
 *    que hace comparables propiedades con distinto tamaño.
 *  - Ingresos = suma de `amountAfterTax` de reservas no canceladas/no-show
 *    cuya LLEGADA cae dentro de la ventana (la reserva entera entra en el
 *    período de su llegada, no noche a noche; es la convención de los
 *    reportes de producción).
 *  - ADR = ingresos / noches vendidas (noches de esas mismas reservas).
 *  - Estancia media = noches vendidas / reservas con estancia.
 *  - Antelación = días entre `bookedOn` y check-in; la mediana acompaña a la
 *    media porque un par de reservas hechas con un año de margen la disparan.
 */
export function kpisVentana(params: {
  reservations: Array<
    AnalyticsReservationInput & { bookedOn?: Date | null; createdAt?: Date | null }
  >
  totalUnidades: number
  dias?: number
  hasta?: Date
  /** Moneda de reporte del tenant, usada cuando no hay dato de divisa. */
  monedaTenant?: string | null
}): KpisVentana {
  const dias = Math.min(Math.max(params.dias || 30, 1), 365)
  const hasta = params.hasta || new Date()
  const hoyMs = startOfDayMs(hasta)
  const inicioMs = hoyMs - (dias - 1) * 86_400_000
  const finMs = hoyMs + 86_400_000 // exclusiva: la ventana incluye `hasta`

  const enVentana = params.reservations.filter((r) => {
    const llegada = startOfDayMs(r.checkIn)
    return llegada >= inicioMs && llegada < finMs
  })

  // Multimoneda: el informe se escribe en UNA divisa (la de los datos del
  // período y, si no hay, la del tenant). Los importes de las otras NO se suman
  // aquí —se informan en `porMoneda`—, porque sumar divisas distintas da un
  // número que no es dinero de ningún sitio.
  const moneda = monedaDelInforme(
    enVentana.map((r) => r.currency),
    params.monedaTenant,
  )
  // Ojo con el nombre del campo: estas reservas traen la divisa en `currency`.
  const grupos = agruparPorMoneda(enVentana, moneda, (r) => r.currency)

  const conIngreso = enVentana.filter(
    (r) =>
      aportaProduccion(r.estado) &&
      r.amountAfterTax != null &&
      r.amountAfterTax > 0 &&
      estaEnMonedaDelInforme({ moneda: r.currency }, moneda),
  )
  const ingresos = conIngreso.reduce((total, r) => total + (r.amountAfterTax || 0), 0)
  const nochesVendidas = conIngreso.reduce((total, r) => total + nochesDe(r), 0)

  const porMoneda: ResumenMonedaKpis[] = grupos.map((grupo) => {
    const ventas = grupo.items.filter(
      (r) =>
        aportaProduccion(r.estado) && r.amountAfterTax != null && r.amountAfterTax > 0,
    )
    const bruto = ventas.reduce((total, r) => total + (r.amountAfterTax || 0), 0)
    const noches = ventas.reduce((total, r) => total + nochesDe(r), 0)
    return {
      moneda: grupo.moneda,
      reservas: grupo.items.length,
      ingresos: bruto,
      nochesVendidas: noches,
      adr: noches > 0 ? bruto / noches : null,
    }
  })

  const nochesDisponibles = params.totalUnidades * dias
  const adr = nochesVendidas > 0 ? ingresos / nochesVendidas : null
  const revpar = nochesDisponibles > 0 ? ingresos / nochesDisponibles : null

  const estancias = conIngreso.filter((r) => nochesDe(r) > 0)
  const estanciaMedia =
    estancias.length > 0
      ? estancias.reduce((total, r) => total + nochesDe(r), 0) / estancias.length
      : null

  // «Llegada» = la reserva existió ese día (`esMovimientoDelDia`): un no-show
  // fue un huésped esperado y entra en el denominador de su tasa; la cancelada
  // no llegó nunca. Es distinto de «ocupa» (`aportaProduccion`).
  const llegadas = enVentana.filter((r) => esMovimientoDelDia(r.estado)).length
  const noShows = enVentana.filter((r) => r.estado === 'no_show').length
  const tasaNoShow = llegadas > 0 ? noShows / llegadas : null
  const cancelaciones = enVentana.filter((r) => r.estado === 'cancelled').length

  const antelaciones = enVentana
    .filter((r) => esMovimientoDelDia(r.estado))
    .map((r) => antelacionDias(r))
    .filter((a): a is number => a != null)
  const antelacionMediaDias =
    antelaciones.length > 0
      ? antelaciones.reduce((total, a) => total + a, 0) / antelaciones.length
      : null
  const antelacionMedianaDias = mediana(antelaciones)

  return {
    dias,
    ingresos,
    nochesVendidas,
    nochesDisponibles,
    adr,
    revpar,
    estanciaMedia,
    llegadas,
    noShows,
    tasaNoShow,
    cancelaciones,
    antelacionMediaDias,
    antelacionMedianaDias,
    moneda,
    multimoneda: describirMultimoneda({ monedaInforme: moneda, grupos, totalFilas: enVentana.length }),
    porMoneda,
  }
}
