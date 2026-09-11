/**
 * Analíticas de Hospitality (plan maestro §23) — módulo puro, sin BD.
 *
 * Dos drill-downs del dashboard:
 *  - Ocupación por propiedad: % de unidades ocupadas por día (ventana de N días).
 *  - Tendencia de ingresos por canal: ingresos por día atribuidos por noche
 *    (cada reserva reparte su importe entre las noches que ocupa), que es la
 *    misma base con la que se calcula el ADR.
 *
 * Reglas heredadas del módulo:
 *  - Estancia: la noche del día D está ocupada si checkIn <= D < checkOut (§8).
 *    La noche del check-out NO cuenta como ocupada.
 *  - Canceladas y no_show no aportan ocupación ni ingresos.
 *  - Reservas sin unidad no aportan ocupación (no se pueden atribuir).
 */

export interface AnalyticsReservationInput {
  id: string
  propertyId: string
  unitId: string | null
  channel: string
  estado: string
  checkIn: Date
  checkOut: Date
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

export interface ChannelRevenuePoint {
  fecha: string
  ingresos: number
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
  return new Date(ms).toISOString().slice(0, 10)
}

/** La reserva cubre la noche del día `dayStartMs` (§8: checkIn <= D < checkOut). */
export function coversNight(
  r: Pick<AnalyticsReservationInput, 'checkIn' | 'checkOut' | 'estado'>,
  dayStartMs: number,
): boolean {
  if (r.estado === 'cancelled' || r.estado === 'no_show') return false
  return r.checkIn.getTime() <= dayStartMs && r.checkOut.getTime() > dayStartMs
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
  const hoyMs = startOfDayMs(hasta)
  const diasMs: number[] = []
  for (let i = dias - 1; i >= 0; i--) diasMs.push(hoyMs - i * 86_400_000)

  const activas = params.reservations.filter(
    (r) => r.estado !== 'cancelled' && r.estado !== 'no_show' && !!r.unitId,
  )

  const series: PropertyOccupancySerie[] = []
  for (const p of params.properties) {
    const unitIds = new Set(params.units.filter((u) => u.propertyId === p.id).map((u) => u.id))
    if (unitIds.size === 0) continue
    const total = unitIds.size

    let sumaOcupacion = 0
    const puntos: OccupancyPoint[] = diasMs.map((dayMs) => {
      const ocupadas = new Set<string>()
      for (const r of activas) {
        if (r.propertyId !== p.id) continue
        if (!unitIds.has(r.unitId as string)) continue
        if (coversNight(r, dayMs)) ocupadas.add(r.unitId as string)
      }
      const ocupacion = total > 0 ? ocupadas.size / total : 0
      sumaOcupacion += ocupacion
      return { fecha: toFecha(dayMs), ocupadas: ocupadas.size, total, ocupacion }
    })

    series.push({
      propertyId: p.id,
      nombre: p.nombre,
      totalUnidades: total,
      ocupacionMedia: sumaOcupacion / dias,
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
}): ChannelRevenueSerie[] {
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
    if (r.estado === 'cancelled' || r.estado === 'no_show') continue
    if (r.amountAfterTax == null || r.amountAfterTax <= 0) continue
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
