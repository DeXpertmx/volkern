
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/support/tickets/analytics
 * Devuelve métricas detalladas para el SLA Dashboard.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Obtener tickets de los últimos 30 días
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const tickets = await prisma.supportTicket.findMany({
      where: {
        tenantId,
        createdAt: { gte: last30Days }
      },
      select: {
        createdAt: true,
        resolvedAt: true,
        priority: true,
        slaState: true,
        status: true
      }
    });

    // 1. Tickets por día (Volumen)
    const ticketsPorDia = tickets.reduce((acc: any, t) => {
      const date = t.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.entries(ticketsPorDia).map(([fecha, count]) => ({
      fecha,
      count
    })).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // 2. Distribución por Prioridad
    const porPrioridad = {
      CRITICAL: tickets.filter(t => t.priority === 'CRITICAL').length,
      HIGH: tickets.filter(t => t.priority === 'HIGH').length,
      MEDIUM: tickets.filter(t => t.priority === 'MEDIUM').length,
      LOW: tickets.filter(t => t.priority === 'LOW').length
    };

    // 3. Estado de SLA
    const slaStats = {
      ON_TIME: tickets.filter(t => t.slaState === 'ON_TIME').length,
      AT_RISK: tickets.filter(t => t.slaState === 'AT_RISK').length,
      BREACHED: tickets.filter(t => t.slaState === 'BREACHED').length
    };

    return NextResponse.json({
      ticketsPorDia: chartData,
      porPrioridad,
      slaStats,
      total: tickets.length
    });
  } catch (error) {
    console.error('[SupportAnalyticsAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener analíticas' }, { status: 500 });
  }
}, ['support:read']);
