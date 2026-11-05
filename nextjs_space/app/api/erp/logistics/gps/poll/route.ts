import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { haversineKm, calcProgress } from '@/lib/geo'

// ─── Esquema de validación del body ─────────────────────────────────────
interface GpsPollRequest {
  /** ID del envío (obligatorio) */
  shipmentId: string
  /** Latitud del vehículo (obligatorio) */
  latitude: number
  /** Longitud del vehículo (obligatorio) */
  longitude: number
  /** Timestamp ISO de la lectura GPS (opcional, default now) */
  timestamp?: string
  /** Velocidad en km/h (opcional) */
  speed?: number
  /** Rumbo en grados 0-360 (opcional) */
  heading?: number
  /** Altitud en metros (opcional) */
  altitude?: number
  /** Precisión en metros (opcional) */
  accuracy?: number
  /** Si true, añade esta posición a routeWaypoints */
  addWaypoint?: boolean
  /** Identificador del dispositivo o conductor (opcional) */
  deviceId?: string
  /** Temperatura de la carga en °C (opcional, ej: 22.5) */
  cargoTemp?: number
}

// ─── POST /api/erp/logistics/gps/poll ───────────────────────────────────
// Endpoint para que vehículos reales reporten su posición GPS.
// Autenticación vía sesión web o API key (recomendado para dispositivos IoT).
//
// ⚠️ Rate limiting: Se recomienda un intervalo mínimo de 30-60 segundos entre
//    polls del mismo shipmentId para evitar saturación de la BD.
//
// Uso con API key:
//   curl -X POST http://localhost:3000/api/erp/logistics/gps/poll \
//     -H 'Authorization: Bearer vk_...' \
//     -H 'Content-Type: application/json' \
//     -d '{"shipmentId":"shp-002","latitude":38.1234,"longitude":-3.5678,"speed":65,"heading":180}'
//
// Uso con sesión web (cookie):
//   curl -X POST http://localhost:3000/api/erp/logistics/gps/poll \
//     -H 'Content-Type: application/json' \
//     -d '{"shipmentId":"shp-002","latitude":38.1234,"longitude":-3.5678}' \
//     --cookie "next-auth.session-token=..."
// ─────────────────────────────────────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body: GpsPollRequest = await request.json()

    // ── Validar campos obligatorios ──
    if (!body.shipmentId) {
      return NextResponse.json(
        { error: 'Campo obligatorio: shipmentId' },
        { status: 400 }
      )
    }
    if (body.latitude == null || body.longitude == null) {
      return NextResponse.json(
        { error: 'Campos obligatorios: latitude, longitude' },
        { status: 400 }
      )
    }
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      return NextResponse.json(
        { error: 'latitude y longitude deben ser números' },
        { status: 400 }
      )
    }
    if (body.latitude < -90 || body.latitude > 90) {
      return NextResponse.json(
        { error: 'latitude debe estar entre -90 y 90' },
        { status: 400 }
      )
    }
    if (body.longitude < -180 || body.longitude > 180) {
      return NextResponse.json(
        { error: 'longitude debe estar entre -180 y 180' },
        { status: 400 }
      )
    }

    // ── Buscar el envío ──
    const shipment = await (prisma as any).erp_shipments.findUnique({
      where: { id: body.shipmentId },
    })

    if (!shipment) {
      return NextResponse.json(
        { error: 'Envío no encontrado' },
        { status: 404 }
      )
    }

    // Verificar que pertenece al tenant autenticado
    if (shipment.tenantId !== auth.tenant!.id) {
      return NextResponse.json(
        { error: 'El envío no pertenece a este tenant' },
        { status: 403 }
      )
    }

    // ── Validar estado del envío ──
    if (shipment.status === 'DELIVERED') {
      return NextResponse.json({
        acknowledged: true,
        warning: 'El envío ya fue entregado. No se actualiza posición.',
        shipmentId: body.shipmentId,
        batchNumber: shipment.batchNumber,
        status: shipment.status,
      })
    }

    if (shipment.status === 'CANCELLED') {
      return NextResponse.json({
        acknowledged: true,
        warning: 'El envío está cancelado. No se actualiza posición.',
        shipmentId: body.shipmentId,
        batchNumber: shipment.batchNumber,
        status: shipment.status,
      })
    }

    if (!shipment.dispatchedAt && shipment.status !== 'DISPATCHING') {
      return NextResponse.json({
        acknowledged: true,
        warning: 'El envío no ha sido despachado. Guardando posición de referencia.',
        shipmentId: body.shipmentId,
        batchNumber: shipment.batchNumber,
        status: shipment.status,
      })
    }

    // ── Timestamp de la lectura ──
    const gpsTimestamp = body.timestamp ? new Date(body.timestamp) : new Date()
    if (isNaN(gpsTimestamp.getTime())) {
      return NextResponse.json(
        { error: 'timestamp inválido. Usa formato ISO 8601.' },
        { status: 400 }
      )
    }

    // ── Anterior posición para referencia ──
    const previousPosition: [number, number] | null =
      shipment.currentLat != null && shipment.currentLng != null
        ? [shipment.currentLat, shipment.currentLng]
        : null

    const newPosition: [number, number] = [body.latitude, body.longitude]

    // ── Construir waypoint (si addWaypoint es true) ──
        let waypoints: Array<{
      lat: number
      lng: number
      timestamp: string
      speed?: number
      heading?: number
      altitude?: number
      accuracy?: number
      deviceId?: string
      cargoTemp?: number
    }> = []

    if (body.addWaypoint && shipment.routeWaypoints) {
      try {
        const existing = Array.isArray(shipment.routeWaypoints)
          ? shipment.routeWaypoints
          : typeof shipment.routeWaypoints === 'string'
            ? JSON.parse(shipment.routeWaypoints)
            : []
        waypoints = [...existing]
      } catch {
        waypoints = []
      }
    }

    if (body.addWaypoint) {
      waypoints.push({
        lat: body.latitude,
        lng: body.longitude,
        timestamp: gpsTimestamp.toISOString(),
        ...(body.speed != null ? { speed: body.speed } : {}),
        ...(body.heading != null ? { heading: body.heading } : {}),
        ...(body.altitude != null ? { altitude: body.altitude } : {}),
        ...(body.accuracy != null ? { accuracy: body.accuracy } : {}),
        ...(body.deviceId ? { deviceId: body.deviceId } : {}),
        ...(body.cargoTemp != null ? { cargoTemp: body.cargoTemp } : {}),
      })
    }

    // ── Persistir en BD ──
    const updateData: Record<string, any> = {
      currentLat: body.latitude,
      currentLng: body.longitude,
      lastGpsUpdate: gpsTimestamp,
    }

    if (body.cargoTemp != null) {
      updateData.currentTemp = body.cargoTemp
    }

    if (body.addWaypoint) {
      updateData.routeWaypoints = waypoints
    }

    // Si el envío está en estado DISPATCHING y recibimos GPS, pasar a SHIPPED
    if (shipment.status === 'DISPATCHING' && !shipment.dispatchedAt) {
      updateData.status = 'SHIPPED'
      updateData.dispatchedAt = gpsTimestamp
    }

    await (prisma as any).erp_shipments.update({
      where: { id: body.shipmentId },
      data: updateData,
    })

    // ── Calcular progreso en la ruta (si hay coordenadas de origen/destino) ──
    let progress: number | null = null
    if (
      shipment.originLat != null && shipment.originLng != null &&
      shipment.destinationLat != null && shipment.destinationLng != null
    ) {
      progress = calcProgress(
        [shipment.originLat, shipment.originLng],
        [shipment.destinationLat, shipment.destinationLng],
        newPosition,
      )
    }

    // ── Calcular distancia desde el origen ──
    let distanceFromOrigin: number | null = null
    let distanceToDestination: number | null = null
    let totalDistance: number | null = null
    if (shipment.originLat != null && shipment.originLng != null) {
      distanceFromOrigin = Math.round(
        haversineKm(shipment.originLat, shipment.originLng, body.latitude, body.longitude) * 100
      ) / 100
    }
    if (shipment.destinationLat != null && shipment.destinationLng != null) {
      distanceToDestination = Math.round(
        haversineKm(body.latitude, body.longitude, shipment.destinationLat, shipment.destinationLng) * 100
      ) / 100
    }
    if (shipment.originLat != null && shipment.originLng != null &&
        shipment.destinationLat != null && shipment.destinationLng != null) {
      totalDistance = Math.round(
        haversineKm(shipment.originLat, shipment.originLng, shipment.destinationLat, shipment.destinationLng) * 100
      ) / 100
    }

    // ── Respuesta ──
    const response = {
      acknowledged: true,
      shipmentId: body.shipmentId,
      batchNumber: shipment.batchNumber,
      status: shipment.status === 'DISPATCHING' ? 'SHIPPED' : shipment.status,
      previousPosition,
      newPosition,
      timestamp: gpsTimestamp.toISOString(),
      progress,
      distance: {
        fromOriginKm: distanceFromOrigin,
        toDestinationKm: distanceToDestination,
        totalKm: totalDistance,
      },
      speed: body.speed ?? null,
      heading: body.heading ?? null,
      cargoTemp: body.cargoTemp ?? null,
      waypointAdded: body.addWaypoint === true,
      waypointCount: waypoints.length,
      deviceId: body.deviceId ?? null,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    if (error.name === 'SyntaxError' && error.message?.includes('JSON')) {
      return NextResponse.json(
        { error: 'Cuerpo de la solicitud inválido. Envía JSON válido.' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}, ['erp:write'])
