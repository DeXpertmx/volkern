import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { haversineKm, interpolate, calcProgress, AVG_TRUCK_SPEED_KMH } from '@/lib/geo'

// ─── POST /api/erp/logistics/gps/realtime ──────────────────────────────
// Simula movimiento GPS: avanza los vehículos en tránsito N minutos y
// persiste la nueva posición en la BD. Si un vehículo alcanza el destino,
// se auto-completa la entrega.

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json().catch(() => ({}))
    const minutes = Math.max(1, Math.min(body.minutes ?? 15, 120))

    // Buscar envíos en tránsito con coordenadas GPS
    const inTransit = await (prisma as any).erp_shipments.findMany({
      where: {
        tenantId: auth.tenant!.id,
        status: 'SHIPPED',
        dispatchedAt: { not: null },
        deliveredAt: null,
        originLat: { not: null },
        originLng: { not: null },
        destinationLat: { not: null },
        destinationLng: { not: null },
      },
    })

    if (inTransit.length === 0) {
      return NextResponse.json({
        updated: 0,
        completed: 0,
        message: 'No hay envíos en tránsito con coordenadas GPS.',
        simulatedMinutes: minutes,
      })
    }

    const now = new Date()
    let updated = 0
    let completed = 0
    const results: Array<{
      id: string
      batchNumber: string
      from: [number, number]
      to: [number, number]
      progress: number
      completed: boolean
    }> = []

    for (const s of inTransit) {
      const origin: [number, number] = [s.originLat, s.originLng]
      const dest: [number, number] = [s.destinationLat, s.destinationLng]

      // Posición actual (desde BD o inicio)
      const currentPos: [number, number] =
        s.currentLat != null && s.currentLng != null
          ? [s.currentLat, s.currentLng]
          : origin

      // Progreso actual basado en distancia recorrida
      const progress = calcProgress(origin, dest, currentPos)
      if (progress >= 1) {
        // Ya llegó — auto-completar si no estaba marcado
        if (s.status !== 'DELIVERED') {
          await (prisma as any).erp_shipments.update({
            where: { id: s.id },
            data: {
              status: 'DELIVERED',
              deliveredAt: now,
              receiverName: 'Entrega automática',
              lastGpsUpdate: now,
            },
          })
          completed++
          results.push({
            id: s.id,
            batchNumber: s.batchNumber,
            from: currentPos,
            to: dest,
            progress: 1,
            completed: true,
          })
        }
        continue
      }

      // Distancia a recorrer en este step
      const stepKm = AVG_TRUCK_SPEED_KMH * (minutes / 60)
      const totalKm = haversineKm(origin[0], origin[1], dest[0], dest[1])

      // Nuevo progreso después del step
      const traveledKm = progress * totalKm
      const newTraveledKm = Math.min(traveledKm + stepKm, totalKm)
      const newProgress = totalKm > 0 ? newTraveledKm / totalKm : 1

      // Nueva posición interpolada
      const newPos = interpolate(origin, dest, newProgress)
      const reached = newProgress >= 1

      // Generar temperatura realista: más cálido en latitudes bajas (sur)
      // Rango base: 16-26°C para latitudes 36-43°N (España peninsular)
      const baseTemp = 26 - Math.abs(dest[0]) * 0.25 // sur más cálido
      const hourVariation = Math.sin((now.getHours() - 6) * Math.PI / 12) * 3 // pico a las 12-14h
      const simulatedTemp = Math.round((baseTemp + hourVariation + (Math.random() - 0.5) * 2) * 10) / 10

      // Persistir en BD
      await (prisma as any).erp_shipments.update({
        where: { id: s.id },
        data: {
          currentLat: newPos[0],
          currentLng: newPos[1],
          currentTemp: simulatedTemp,
          lastGpsUpdate: now,
          ...(reached
            ? {
                status: 'DELIVERED',
                deliveredAt: now,
                receiverName: 'Entrega automática',
              }
            : {}),
        },
      })

      updated++
      if (reached) completed++

      results.push({
        id: s.id,
        batchNumber: s.batchNumber,
        from: currentPos,
        to: newPos,
        progress: newProgress,
        completed: reached,
      })
    }

    return NextResponse.json({
      updated,
      completed,
      simulatedMinutes: minutes,
      results,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
})
