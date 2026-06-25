import { prisma } from '@/lib/db';
import { FleetService } from '@/lib/erp/fleet-service';
import { LogisticsService } from '@/lib/erp/logistics-service';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';

/**
 * Skills de Logística para Gemma AI
 */

/**
 * Estado de un envío por número de tracking o referencia
 */
export async function getShipmentStatus(input: {
  tenantId: string;
  trackingNumber?: string;
  shipmentId?: string;
}) {
  const { tenantId, trackingNumber, shipmentId } = input;

  const where: any = { tenantId };
  if (trackingNumber) where.trackingNumber = trackingNumber;
  if (shipmentId) where.id = shipmentId;

  const shipment = await (prisma as any).erp_shipments.findFirst({
    where,
    include: {
      erp_sales_orders: {
        select: { batchNumber: true, grandTotal: true },
        include: {
          customer: { select: { name: true } },
        },
      },
      erp_delivery_confirmations: {
        orderBy: { confirmedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!shipment) {
    return { found: false, message: 'No se encontró ningún envío con esos datos.' };
  }

  return {
    found: true,
    shipment: {
      id: shipment.id,
      batchNumber: shipment.batchNumber,
      status: shipment.status,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      orderRef: shipment.erp_sales_orders?.batchNumber,
      customerName: (shipment.erp_sales_orders as any)?.customer?.name,
      dispatchedAt: shipment.dispatchedAt,
      deliveredAt: shipment.deliveredAt,
      receiverName: shipment.receiverName,
      estimatedDelivery: (shipment as any).estimatedDelivery,
    },
  };
}

/**
 * Estado de la flota — vehículos con mantenimiento pendiente o ITV próxima a vencer
 */
export async function checkFleetHealth(input: { tenantId: string }) {
  const { tenantId } = input;
  const kpis = await FleetService.getFleetKPIs(tenantId);

  const vehicles = await FleetService.listVehicles(tenantId);

  const maintenanceDue = vehicles.filter((v: any) => v.status === 'MAINTENANCE');
  const activeVehicles = vehicles.filter((v: any) => v.status === 'ACTIVE');
  const expiringItv = vehicles.filter((v: any) => {
    if (!v.itvExpiration) return false;
    const days = (new Date(v.itvExpiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days > 0 && days < 30;
  });

  return {
    summary: `${kpis.active} vehículos activos de ${kpis.total}. ${maintenanceDue.length} en mantenimiento, ${expiringItv.length} con ITV próxima a vencer.`,
    kpis,
    maintenanceDue: maintenanceDue.map((v: any) => ({
      plate: v.plate,
      brand: v.brand,
      model: v.model,
    })),
    expiringItv: expiringItv.map((v: any) => ({
      plate: v.plate,
      expiration: v.itvExpiration,
      daysLeft: Math.ceil((new Date(v.itvExpiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    })),
  };
}

/**
 * Optimizar ruta — sugerencia de planificación basada en pedidos pendientes
 */
export async function optimizeRoute(input: {
  tenantId: string;
  origin?: string;
  destination?: string;
  priority?: string;
}) {
  const { tenantId, origin, destination, priority } = input;

  // Buscar pedidos pendientes de envío
  const pendingShipments = await (prisma as any).erp_shipments.findMany({
    where: {
      tenantId,
      status: 'PREPARING',
    },
    include: {
      erp_sales_orders: {
        select: {
          batchNumber: true,
          deliveryAddress: true,
          city: true,
        },
      },
    },
    take: 10,
    orderBy: { createdAt: 'asc' },
  });

  const destinations: string[] = [];
  for (const s of pendingShipments) {
    const addr = (s.erp_sales_orders as any)?.deliveryAddress || (s.erp_sales_orders as any)?.city;
    if (addr && !destinations.includes(addr)) {
      destinations.push(addr);
    }
  }

  return {
    pendingCount: pendingShipments.length,
    destinations,
    suggestion: pendingShipments.length > 0
      ? `Hay ${pendingShipments.length} envíos pendientes. Destinos sugeridos: ${destinations.join(', ') || 'Sin direcciones registradas'}.`
      : 'No hay envíos pendientes en este momento.',
    optimizedOrder: destinations,
    origin: origin || 'Almacén principal',
  };
}

/**
 * Sugerir reorganización de almacén basada en rotación de productos
 */
export async function suggestWarehouseReorganization(input: { tenantId: string; warehouseId?: string }) {
  const { tenantId, warehouseId } = input;

  const where: any = { tenantId };
  if (warehouseId) where.warehouseId = warehouseId;

  const stockLevels = await (prisma as any).erp_stock_levels.findMany({
    where,
    include: {
      catalogoItem: { select: { nombre: true, sku: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { quantity: 'desc' },
    take: 20,
  });

  // Productos con mayor rotación (menos stock = más rotación)
  const highRotation = stockLevels.filter((s: any) => s.quantity > 0 && s.quantity < 10);
  const lowRotation = stockLevels.filter((s: any) => s.quantity > 50);

  return {
    warehouseName: warehouseId ? stockLevels[0]?.warehouse?.name : 'Todos los almacenes',
    totalItems: stockLevels.length,
    highRotationItems: highRotation.map((s: any) => ({
      name: s.catalogoItem?.nombre,
      sku: s.catalogoItem?.sku,
      stock: s.quantity,
    })),
    lowRotationItems: lowRotation.map((s: any) => ({
      name: s.catalogoItem?.nombre,
      sku: s.catalogoItem?.sku,
      stock: s.quantity,
    })),
    suggestion: `Se detectaron ${highRotation.length} productos de alta rotación (stock < 10 uds) que deberían estar en ubicaciones de picking rápido, y ${lowRotation.length} productos de baja rotación (stock > 50 uds) que pueden ir a zonas de almacenaje profundo.`,
  };
}

/**
 * Tracking de un pedido para cliente (público)
 */
export async function trackOrder(input: {
  tenantId: string;
  orderRef?: string;
  trackingNumber?: string;
}) {
  const { tenantId, orderRef, trackingNumber } = input;

  const where: any = { tenantId };
  if (trackingNumber) where.trackingNumber = trackingNumber;
  if (orderRef) {
    const salesOrder = await (prisma as any).salesOrder.findFirst({
      where: { tenantId, batchNumber: orderRef },
    });
    if (salesOrder) where.salesOrderId = salesOrder.id;
  }

  const shipment = await (prisma as any).erp_shipments.findFirst({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      erp_delivery_confirmations: {
        orderBy: { confirmedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!shipment) {
    return { found: false, message: 'No se encontró información de seguimiento.' };
  }

  return {
    found: true,
    status: shipment.status,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    estimatedDelivery: (shipment as any).estimatedDelivery,
    lastUpdate: shipment.deliveredAt || shipment.dispatchedAt || shipment.createdAt,
    receiver: shipment.receiverName,
    timeline: [
      { event: 'Despachado', date: shipment.dispatchedAt, done: !!shipment.dispatchedAt },
      { event: 'En tránsito', date: null, done: shipment.status === 'SHIPPED' || shipment.status === 'DELIVERED' },
      { event: 'Entregado', date: shipment.deliveredAt, done: shipment.status === 'DELIVERED' },
    ],
  };
}
