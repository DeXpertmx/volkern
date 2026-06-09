import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';
import {
  interpolateCurrentPosition,
  buildTrackingTimeline,
  getDisplayCity,
} from '@/lib/tracking-utils';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    // ── Búsqueda por número de tracking o referencia ──
    if (search) {
      const shipment = await (prisma as any).erp_shipments.findFirst({
        where: {
          tenantId: auth.tenantId,
          OR: [
            { trackingNumber: { contains: search, mode: 'insensitive' } },
            { batchNumber: { contains: search, mode: 'insensitive' } },
          ],
        },
        include: {
          erp_delivery_confirmations: {
            orderBy: { confirmedAt: 'desc' },
          },
          erp_sales_orders: {
            select: { batchNumber: true, grandTotal: true },
          },
        },
      });

      if (!shipment) {
        return NextResponse.json({
          found: false,
          events: [],
          message: 'No se encontró ningún envío con ese número de tracking.',
        });
      }

      // Construir timeline de eventos
      const events = buildTrackingTimeline(shipment);

      return NextResponse.json({
        found: true,
        shipment: {
          id: shipment.id,
          batchNumber: shipment.batchNumber,
          trackingNumber: shipment.trackingNumber,
          carrier: shipment.carrier,
          status: shipment.status,
          orderRef: shipment.erp_sales_orders?.batchNumber || null,
        },
        events,
      });
    }

    // ── Listar eventos de tracking recientes ──
    const [shipments, total] = await Promise.all([
      (prisma as any).erp_shipments.findMany({
        where: { tenantId: auth.tenantId },
        include: {
          erp_delivery_confirmations: {
            take: 1,
            orderBy: { confirmedAt: 'desc' },
          },
        },
        orderBy: { batchNumber: 'desc' },
        take: limit,
        skip,
      }),
      (prisma as any).erp_shipments.count({ where: { tenantId: auth.tenantId } }),
    ]);

    // Compose tracking events from shipments (with GPS data + display city names)
    const events = shipments.flatMap((s: any) => {
      const timeline: any[] = [];
      const originCity = getDisplayCity(s, 'origin')
      const destinationCity = getDisplayCity(s, 'destination')

      if (s.dispatchedAt) {
        timeline.push({
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
        });
      }

      if (s.deliveredAt) {
        timeline.push({
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
        });
      }

      if (s.erp_delivery_confirmations?.length > 0) {
        const dc = s.erp_delivery_confirmations[0];
        timeline.push({
          id: `confirmation-${dc.id}`,
          shipmentId: s.id,
          batchNumber: s.batchNumber,
          type: 'CONFIRMATION',
          title: 'POD registrado',
          description: `POD confirmado en ${destinationCity} por ${dc.confirmedBy || 'receptor'}${dc.notes ? ` — ${dc.notes}` : ''}`,
          location: destinationCity,
          timestamp: dc.confirmedAt,
          icon: 'FileText',
          color: 'text-violet-400',
        });
      }

      return timeline;
    });

    // Ordenar por timestamp descendente
    events.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Build routes for Polyline rendering (using GPS data from DB)
    const seenRoutes = new Set<string>()
    const routes = shipments
      .filter((s: any) => s.dispatchedAt || s.deliveredAt || (s.originLat && s.destinationLat))
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
          dispatchedAt: s.dispatchedAt,
          deliveredAt: s.deliveredAt,
          lastGpsUpdate: gpsPosition.lastGpsUpdate,
          routeWaypoints: s.routeWaypoints,
        }
      })

    return NextResponse.json({
      events: events.slice(0, limit),
      routes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
