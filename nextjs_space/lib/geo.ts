/**
 * Utilidades geoespaciales compartidas
 *
 * Funciones para cálculo de distancias, interpolación y progreso GPS.
 * Reutilizadas por tracking/route.ts y gps/realtime/route.ts.
 */

/** Velocidad media estimada de camión en carretera (km/h) */
export const AVG_TRUCK_SPEED_KMH = 60

/**
 * Fórmula Haversine para calcular distancia en km entre dos puntos geográficos
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371 // radio Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Interpola un punto entre origin y destination dado un progreso [0, 1]
 */
export function interpolate(
  origin: [number, number],
  dest: [number, number],
  progress: number
): [number, number] {
  return [
    origin[0] + (dest[0] - origin[0]) * progress,
    origin[1] + (dest[1] - origin[1]) * progress,
  ]
}

/**
 * Calcula el progreso [0, 1] de un vehículo midiendo la distancia recorrida
 * desde el origen hasta su posición actual vs la distancia total del trayecto.
 */
export function calcProgress(
  origin: [number, number],
  dest: [number, number],
  current: [number, number]
): number {
  const totalKm = haversineKm(origin[0], origin[1], dest[0], dest[1])
  if (totalKm <= 0) return 1
  const traveledKm = haversineKm(origin[0], origin[1], current[0], current[1])
  return Math.min(traveledKm / totalKm, 1)
}
