import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const now = new Date();
    const days30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const days15 = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const days7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const alerts: Array<{
      id: string;
      type: 'CRITICAL' | 'WARNING' | 'INFO';
      title: string;
      description: string;
      category: string;
      icon: string;
      count?: number;
      link?: string;
    }> = [];

    // ── 1. ITV próximas a vencer (CRITICAL) ──
    const expiringItv = await (prisma as any).erp_fleet_vehicles.findMany({
      where: {
        tenantId: auth.tenant!.id,
        status: { not: 'RETIRED' },
        itvExpiration: {
          not: null,
          lte: days15,
          gte: now,
        },
      },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        itvExpiration: true,
      },
    });

    if (expiringItv.length > 0) {
      const plates = expiringItv.map((v: any) => v.plate).join(', ');
      const soonest = expiringItv.reduce((earliest: any, v: any) =>
        new Date(v.itvExpiration) < new Date(earliest.itvExpiration) ? v : earliest
      );
      const daysLeft = Math.ceil((new Date(soonest.itvExpiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      alerts.push({
        id: 'itv-expiring',
        type: 'CRITICAL',
        title: 'ITV próximas a vencer',
        description: `${expiringItv.length} vehículo${expiringItv.length > 1 ? 's' : ''} (${plates}) — la más próxima vence en ${daysLeft} días.`,
        category: 'fleet',
        icon: 'Calendar',
        count: expiringItv.length,
        link: '/dashboard/logistica/flota',
      });
    }

    // ── 2. Mantenimiento programado (WARNING) ──
    const pendingMaintenance = await (prisma as any).erp_maintenance_orders.findMany({
      where: {
        tenantId: auth.tenant!.id,
        status: 'PLANNED',
        plannedDate: { lte: days7 },
      },
      select: {
        id: true,
        description: true,
        plannedDate: true,
        assetId: true,
      },
    });

    if (pendingMaintenance.length > 0) {
      const urgentCount = pendingMaintenance.filter(
        (m: any) => new Date(m.plannedDate) <= now
      ).length;

      alerts.push({
        id: 'maintenance-pending',
        type: 'WARNING',
        title: 'Mantenimiento Programado',
        description: `${pendingMaintenance.length} órdenes de mantenimiento pendientes${urgentCount > 0 ? ` (${urgentCount} vencidas)` : ''} para esta semana.`,
        category: 'fleet',
        icon: 'Wrench',
        count: pendingMaintenance.length,
        link: '/dashboard/logistica/flota',
      });
    }

    // ── 3. Capacidad de almacén (INFO) ──
    const warehouses = await prisma.warehouse.findMany({
      where: { tenantId: auth.tenant!.id, active: true },
      include: {
        _count: { select: { stockLevels: true } },
      },
    });

    for (const wh of warehouses) {
      // Calcular niveles de ocupación y stock bajo
      const lowStockItems = await (prisma as any).erp_stock_levels.count({
        where: {
          tenantId: auth.tenant!.id,
          warehouseId: wh.id,
          quantity: { lte: 5, gt: 0 },
        },
      });

      if (lowStockItems > 0) {
        alerts.push({
          id: `low-stock-${wh.id}`,
          type: 'INFO',
          title: `Stock bajo en ${wh.name}`,
          description: `${lowStockItems} producto${lowStockItems > 1 ? 's' : ''} con stock bajo (≤5 unidades) en ${wh.name}${wh.location ? ` (${wh.location})` : ''}.`,
          category: 'warehouse',
          icon: 'HardDrive',
          count: lowStockItems,
          link: '/dashboard/logistica/almacenes',
        });
      }
    }

    // ── 4. Envíos pendientes de asignación (WARNING) ──
    const pendingShipments = await (prisma as any).erp_shipments.count({
      where: {
        tenantId: auth.tenant!.id,
        status: { in: ['PENDING', 'PREPARING', 'PROCESSING'] },
      },
    });

    if (pendingShipments > 0) {
      alerts.push({
        id: 'shipments-pending',
        type: 'WARNING',
        title: 'Envíos Pendientes',
        description: `${pendingShipments} envío${pendingShipments > 1 ? 's' : ''} pendiente${pendingShipments > 1 ? 's' : ''} de preparación o asignación de transportista.`,
        category: 'shipments',
        icon: 'Truck',
        count: pendingShipments,
        link: '/dashboard/logistica/envios',
      });
    }

    // ── 5. Seguros por vencer (INFO) ──
    const expiringInsurance = await (prisma as any).erp_fleet_vehicles.findMany({
      where: {
        tenantId: auth.tenant!.id,
        status: { not: 'RETIRED' },
        insuranceExpiration: {
          not: null,
          lte: days30,
          gte: now,
        },
      },
      select: {
        id: true,
        plate: true,
        insuranceExpiration: true,
      },
    });

    if (expiringInsurance.length > 0) {
      alerts.push({
        id: 'insurance-expiring',
        type: 'INFO',
        title: 'Seguros por Vencer',
        description: `${expiringInsurance.length} vehículo${expiringInsurance.length > 1 ? 's' : ''} con seguro próximo a expirar (${expiringInsurance.map((v: any) => v.plate).join(', ')}).`,
        category: 'fleet',
        icon: 'ShieldCheck',
        count: expiringInsurance.length,
        link: '/dashboard/logistica/flota',
      });
    }

    // ── 6. Envíos en tránsito (INFO) ──
    const inTransit = await (prisma as any).erp_shipments.count({
      where: {
        tenantId: auth.tenant!.id,
        status: 'SHIPPED',
      },
    });

    if (inTransit > 0) {
      alerts.push({
        id: 'shipments-transit',
        type: 'INFO',
        title: 'Envíos en Tránsito',
        description: `${inTransit} envío${inTransit > 1 ? 's' : ''} actualmente en ruta. Revisa el estado de tracking.`,
        category: 'shipments',
        icon: 'Navigation',
        count: inTransit,
        link: '/dashboard/logistica/tracking',
      });
    }

    // Ordenar: CRITICAL primero, luego WARNING, luego INFO
    const typeOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    alerts.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

    return NextResponse.json({
      alerts,
      summary: {
        critical: alerts.filter(a => a.type === 'CRITICAL').length,
        warning: alerts.filter(a => a.type === 'WARNING').length,
        info: alerts.filter(a => a.type === 'INFO').length,
        total: alerts.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
