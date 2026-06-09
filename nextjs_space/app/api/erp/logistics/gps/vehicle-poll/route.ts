import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── Esquema de validación del body ─────────────────────────────────────
interface VehiclePollRequest {
  /** ID único del dispositivo GPS del vehículo (obligatorio) */
  deviceKey: string
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
  /** Temperatura de la carga en °C (opcional, ej: 22.5) */
  cargoTemp?: number
}

// ─── POST /api/erp/logistics/gps/vehicle-poll ───────────────────────────
// Endpoint para que dispositivos IoT reporten la posición GPS de un vehículo
// usando su deviceKey (ID único generado al crear el vehículo en flota).
//
// ⚠️ Este endpoint usa autenticación por deviceKey, no requiere API key.
//    El deviceKey se genera automáticamente al registrar el vehículo.
//
// Uso desde dispositivo IoT:
//   curl -X POST https://volkern.app/api/erp/logistics/gps/vehicle-poll \\
//     -H "Content-Type: application/json" \\
//     -d '{
//       "deviceKey": "VK-GPS-1234ABC-X7K2",
//       "latitude": 36.7213,
//       "longitude": -4.4214,
//       "speed": 65,
//       "heading": 180,
//       "cargoTemp": 22.5
//     }'
// ─────────────────────────────────────────────────────────────────────────

export const POST = async (request: NextRequest) => {
  try {
    const body: VehiclePollRequest = await request.json()

    // ── Validar campos obligatorios ──
    if (!body.deviceKey) {
      return NextResponse.json(
        { error: 'Campo obligatorio: deviceKey' },
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

    // ── Buscar vehículo por deviceKey ──
    const vehicle = await (prisma as any).erp_fleet_vehicles.findUnique({
      where: { gpsDeviceId: body.deviceKey },
    })

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado. Verifica el deviceKey.' },
        { status: 404 }
      )
    }

    // ── Timestamp de la lectura ──
    const gpsTimestamp = body.timestamp ? new Date(body.timestamp) : new Date()
    if (isNaN(gpsTimestamp.getTime())) {
      return NextResponse.json(
        { error: 'timestamp inválido. Usa formato ISO 8601.' },
        { status: 400 }
      )
    }

    // ── Anterior posición ──
    const previousPosition: [number, number] | null =
      vehicle.currentLat != null && vehicle.currentLng != null
        ? [vehicle.currentLat, vehicle.currentLng]
        : null

    // ── Persistir posición en el vehículo ──
    // (El vehículo no tiene campos GPS en erp_fleet_vehicles, así que
    //  almacenamos la posición en erp_vehicle_positions para trazabilidad)
    const updateData: Record<string, any> = {
      currentLat: body.latitude,
      currentLng: body.longitude,
      lastGpsUpdate: gpsTimestamp,
    }

    if (body.cargoTemp != null) {
      updateData.currentTemp = body.cargoTemp
    }
    if (body.speed != null) {
      updateData.lastSpeed = body.speed
    }

    await (prisma as any).erp_fleet_vehicles.update({
      where: { id: vehicle.id },
      data: updateData,
    })

    // ── Respuesta ──
    const response = {
      acknowledged: true,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      previousPosition,
      newPosition: [body.latitude, body.longitude] as [number, number],
      timestamp: gpsTimestamp.toISOString(),
      speed: body.speed ?? null,
      heading: body.heading ?? null,
      cargoTemp: body.cargoTemp ?? null,
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
}
