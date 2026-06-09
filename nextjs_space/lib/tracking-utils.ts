/**
 * Utilidades compartidas de tracking logístico
 *
 * Funciones de interpolación GPS y construcción de timelines de eventos.
 * Reutilizadas por tracking/route.ts y tests.
 */

import { haversineKm, interpolate, AVG_TRUCK_SPEED_KMH } from '@/lib/geo'

// ─── Display cities for event descriptions ──────────────────────────────
export const DISPLAY_CITIES: Record<string, { origin: string; destination: string }> = {
  'shp-001': { origin: 'Málaga', destination: 'Madrid' },
  'shp-002': { origin: 'Málaga', destination: 'Barcelona' },
  'shp-003': { origin: 'Zaragoza', destination: 'Bilbao' },
  'shp-004': { origin: 'Zaragoza', destination: 'Sevilla' },
  'shp-005': { origin: 'Málaga', destination: 'Valencia' },
  'shp-006': { origin: 'Sevilla', destination: 'Granada' },
}

/**
 * Obtiene el nombre de ciudad para display a partir de un envío.
 * Usa DISPLAY_CITIES si el ID del envío está mapeado, o fallback a coordenadas.
 */
export function getDisplayCity(shipment: any, type: 'origin' | 'destination'): string {
  const route = DISPLAY_CITIES[shipment.id]
  if (route) return route[type]
  const lat = type === 'origin' ? shipment.originLat : shipment.destinationLat
  const lng = type === 'origin' ? shipment.originLng : shipment.destinationLng
  if (lat != null && lng != null) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  return type === 'origin' ? 'origen' : 'destino'
}

/**
 * Interpola la posición actual del vehículo basada en el tiempo transcurrido.
 *
 * - Envíos ENTREGADOS → posición fija en destino
 * - Envíos EN TRÁNSITO (SHIPPED + dispatchedAt, sin deliveredAt) → interpola entre
 *   origen y destino según elapsedTime / estimatedTravelTime
 * - Envíos PENDIENTES/PREPARANDO → null (aún en origen)
 *
 * La velocidad media estimada es AVG_TRUCK_SPEED_KMH (60 km/h).
 */
export function interpolateCurrentPosition(shipment: any): {
  currentCoords: [number, number] | null
  lastGpsUpdate: string | null
  progress: number
} {
  const now = new Date()

  if (shipment.originLat == null || shipment.originLng == null ||
      shipment.destinationLat == null || shipment.destinationLng == null) {
    return { currentCoords: null, lastGpsUpdate: null, progress: 0 }
  }

  const origin: [number, number] = [shipment.originLat, shipment.originLng]
  const dest: [number, number] = [shipment.destinationLat, shipment.destinationLng]

  // ── Entregado → destino fijo ──
  if (shipment.status === 'DELIVERED' && shipment.deliveredAt) {
    return {
      currentCoords: dest,
      lastGpsUpdate: shipment.deliveredAt.toISOString(),
      progress: 1,
    }
  }

  // ── No despachado → origen ──
  if (!shipment.dispatchedAt || shipment.status === 'PENDING' || shipment.status === 'PREPARING') {
    return {
      currentCoords: origin,
      lastGpsUpdate: now.toISOString(),
      progress: 0,
    }
  }

  // ── En tránsito → interpolar ──
  const dispatchedAt = new Date(shipment.dispatchedAt).getTime()
  const elapsedHours = (now.getTime() - dispatchedAt) / (1000 * 60 * 60)

  const distanceKm = haversineKm(origin[0], origin[1], dest[0], dest[1])
  const estimatedHours = distanceKm / AVG_TRUCK_SPEED_KMH

  if (estimatedHours <= 0) {
    return { currentCoords: dest, lastGpsUpdate: now.toISOString(), progress: 1 }
  }

  const progress = Math.min(Math.max(elapsedHours / estimatedHours, 0), 1)
  const [currentLat, currentLng] = interpolate(origin, dest, progress)

  return {
    currentCoords: [currentLat, currentLng],
    lastGpsUpdate: now.toISOString(),
    progress,
  }
}

/**
 * Construye la línea de tiempo de eventos para un envío específico.
 */
export function buildTrackingTimeline(shipment: any) {
  const events: any[] = []
  const originCity = getDisplayCity(shipment, 'origin')
  const destinationCity = getDisplayCity(shipment, 'destination')

  if (shipment.batchNumber) {
    events.push({
      id: `created-${shipment.id}`,
      type: 'CREATED',
      title: 'Envío registrado',
      description: `Envío ${shipment.batchNumber} registrado en ${originCity}`,
      location: originCity,
      timestamp: shipment.dispatchedAt
        ? new Date(new Date(shipment.dispatchedAt).getTime() - 86400000).toISOString()
        : new Date().toISOString(),
      icon: 'Package',
      color: 'text-slate-400',
    })
  }

  if (shipment.dispatchedAt) {
    events.push({
      id: `dispatched-${shipment.id}`,
      type: 'DISPATCH',
      title: 'Despachado',
      description: `Envío despachado desde ${originCity}${shipment.carrier ? ` vía ${shipment.carrier}` : ''}${shipment.trackingNumber ? ` — Tracking: ${shipment.trackingNumber}` : ''}`,
      location: originCity,
      timestamp: shipment.dispatchedAt,
      icon: 'Truck',
      color: 'text-blue-400',
    })
  }

  if (shipment.trackingNumber && !shipment.deliveredAt && shipment.dispatchedAt) {
    events.push({
      id: `transit-${shipment.id}`,
      type: 'TRANSIT',
      title: 'En tránsito',
      description: `Vehículo en ruta desde ${originCity} hacia ${destinationCity}`,
      location: destinationCity,
      timestamp: new Date(new Date(shipment.dispatchedAt).getTime() + 3600000).toISOString(),
      icon: 'Navigation',
      color: 'text-amber-400',
    })
  }

  if (shipment.erp_delivery_confirmations) {
    for (const dc of shipment.erp_delivery_confirmations) {
      events.push({
        id: `pod-${dc.id}`,
        type: 'POD',
        title: 'POD registrado',
        description: `POD confirmado en ${destinationCity} por ${dc.confirmedBy || 'receptor'}${dc.photoEvidenceUrl ? ' — Con evidencia fotográfica' : ''}${dc.notes ? ` — ${dc.notes}` : ''}`,
        location: destinationCity,
        timestamp: dc.confirmedAt,
        icon: 'FileText',
        color: 'text-violet-400',
      })
    }
  }

  if (shipment.deliveredAt) {
    events.push({
      id: `delivered-${shipment.id}`,
      type: 'DELIVERY',
      title: 'Entregado',
      description: `Envío entregado en ${destinationCity}${shipment.receiverName ? ` a ${shipment.receiverName}` : ''}`,
      location: destinationCity,
      timestamp: shipment.deliveredAt,
      icon: 'CheckCircle2',
      color: 'text-emerald-400',
    })
  }

  events.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return events
}
