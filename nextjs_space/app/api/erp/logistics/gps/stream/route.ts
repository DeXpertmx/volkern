import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { interpolateCurrentPosition, getDisplayCity } from '@/lib/tracking-utils'

// ─── GET /api/erp/logistics/gps/stream ─────────────────────────────────
// SSE (Server-Sent Events) endpoint que emite actualizaciones de tracking
// cada ~5 segundos. El cliente se conecta via EventSource y recibe eventos
// con las rutas y posiciones actualizadas en tiempo real.
//
// Eventos enviados:
//   - "data": { routes, events, timestamp, stats }
//   - "heartbeat": keep-alive cada 30s
//   - "error": si hay un problema
//
// Conexión:
//   const es = new EventSource('/api/erp/logistics/gps/stream');
//   es.onmessage = (e) => { const data = JSON.parse(e.data); ... };
// ─────────────────────────────────────────────────────────────────────────

const STREAM_INTERVAL_MS = 5000  // 5 segundos entre actualizaciones
const HEARTBEAT_INTERVAL_MS = 30000 // heartbeat cada 30s

export const GET = withTenantAuth(async (request, auth) => {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false

      const sendEvent = (event: string, data: unknown) => {
        if (isClosed) return
        try {
          const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(msg))
        } catch (err) {
          // Stream cerrado
          isClosed = true
        }
      }

      // ── Función que recolecta datos de tracking ──
      const fetchAndPush = async () => {
        try {
          const tenantId = auth.tenant!.id

          // Obtener envíos con datos GPS
          const shipments = await (prisma as any).erp_shipments.findMany({
            where: { tenantId },
            include: {
              erp_delivery_confirmations: {
                take: 1,
                orderBy: { confirmedAt: 'desc' },
              },
            },
            orderBy: { batchNumber: 'desc' },
            take: 50,
          })

          // Construir rutas con GPS interpolado
          const seenRoutes = new Set<string>()
          const routes = shipments
            .filter((s: any) => {
              if (seenRoutes.has(s.id)) return false
              seenRoutes.add(s.id)
              return true
            })
            .map((s: any) => {
              const originCoords: [number, number] = s.originLat != null && s.originLng != null
                ? [s.originLat, s.originLng]
                : [36.7213, -4.4214]
              const destCoords: [number, number] = s.destinationLat != null && s.destinationLng != null
                ? [s.destinationLat, s.destinationLng]
                : [40.4168, -3.7038]
              const gpsPosition = interpolateCurrentPosition(s)
              return {
                shipmentId: s.id,
                batchNumber: s.batchNumber,
                status: s.status,
                carrier: s.carrier,
                origin: getDisplayCity(s, 'origin'),
                destination: getDisplayCity(s, 'destination'),
                originCoords,
                destinationCoords: destCoords,
                currentCoords: gpsPosition.currentCoords,
                gpsProgress: gpsPosition.progress,
                cargoTemp: s.currentTemp ?? null,
                dispatchedAt: s.dispatchedAt,
                deliveredAt: s.deliveredAt,
                lastGpsUpdate: gpsPosition.lastGpsUpdate,
                routeWaypoints: s.routeWaypoints,
              }
            })

          // Construir eventos de tracking
          const events: any[] = []
          for (const s of shipments) {
            const originCity = getDisplayCity(s, 'origin')
            const destinationCity = getDisplayCity(s, 'destination')

            if (s.dispatchedAt) {
              events.push({
                id: `dispatch-${s.id}`,
                shipmentId: s.id,
                batchNumber: s.batchNumber,
                type: 'DISPATCH',
                title: 'Envío despachado',
                description: `Envío ${s.batchNumber} despachado desde ${originCity}${s.carrier ? ` vía ${s.carrier}` : ''}`,
                location: originCity,
                timestamp: s.dispatchedAt,
                icon: 'Truck',
                color: 'text-blue-400',
              })
            }
            if (s.deliveredAt) {
              events.push({
                id: `delivery-${s.id}`,
                shipmentId: s.id,
                batchNumber: s.batchNumber,
                type: 'DELIVERY',
                title: 'Entrega confirmada',
                description: `Envío ${s.batchNumber} entregado en ${destinationCity}${s.receiverName ? ` a ${s.receiverName}` : ''}`,
                location: destinationCity,
                timestamp: s.deliveredAt,
                icon: 'CheckCircle2',
                color: 'text-emerald-400',
              })
            }
          }
          events.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

          // Estadísticas rápidas
          const inTransitCount = routes.filter((r: any) => r.status === 'SHIPPED').length
          const deliveredCount = routes.filter((r: any) => r.status === 'DELIVERED').length
          const pendingCount = routes.filter((r: any) => r.status !== 'SHIPPED' && r.status !== 'DELIVERED').length

          // Enviar evento data
          sendEvent('data', {
            routes,
            events: events.slice(0, 20),
            timestamp: new Date().toISOString(),
            stats: {
              total: routes.length,
              inTransit: inTransitCount,
              delivered: deliveredCount,
              pending: pendingCount,
            },
          })
        } catch (error: any) {
          if (!isClosed) {
            sendEvent('error', { message: error.message })
          }
        }
      }

      // ── Heartbeat ──
      const heartbeatInterval = setInterval(() => {
        sendEvent('heartbeat', { time: new Date().toISOString() })
      }, HEARTBEAT_INTERVAL_MS)

      // ── Push inicial y luego cada N segundos ──
      await fetchAndPush()
      const dataInterval = setInterval(fetchAndPush, STREAM_INTERVAL_MS)

      // ── Limpieza al cerrar conexión ──
      request.signal.addEventListener('abort', () => {
        isClosed = true
        clearInterval(dataInterval)
        clearInterval(heartbeatInterval)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // Deshabilitar buffering de nginx
    },
  })
}, ['erp:read'])
