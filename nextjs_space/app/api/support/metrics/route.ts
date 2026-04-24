import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Obtener todos los tickets cerrados en los últimos 30 días para métricas
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const tickets = await prisma.supportTicket.findMany({
      where: {
        tenantId,
        createdAt: { gte: last30Days }
      }
    });

    const resolvedTickets = tickets.filter(t => t.resolvedAt);
    const acknowledgedTickets = tickets.filter(t => t.acknowledgeAt);

    // 1. MTTD (Mean Time to Detect/Acknowledge) en horas
    let mttd = 0;
    if (acknowledgedTickets.length > 0) {
      const sum = acknowledgedTickets.reduce((acc, t) => {
        return acc + (t.acknowledgeAt!.getTime() - t.createdAt.getTime());
      }, 0);
      mttd = sum / acknowledgedTickets.length / (60 * 60 * 1000);
    }

    // 2. MTTR (Mean Time to Resolve) en horas
    let mttr = 0;
    if (resolvedTickets.length > 0) {
      const sum = resolvedTickets.reduce((acc, t) => {
        return acc + (t.resolvedAt!.getTime() - t.createdAt.getTime());
      }, 0);
      mttr = sum / resolvedTickets.length / (60 * 60 * 1000);
    }

    // 3. % SLA Compliance
    const totalWithSLA = tickets.filter(t => t.slaDueAt).length;
    const breached = tickets.filter(t => t.slaState === 'BREACHED').length;
    const slaCompliance = totalWithSLA > 0 ? ((totalWithSLA - breached) / totalWithSLA) * 100 : 100;

    // 4. Backlog por prioridad
    const backlog = {
      CRITICAL: tickets.filter(t => t.priority === 'CRITICAL' && !t.resolvedAt).length,
      HIGH: tickets.filter(t => t.priority === 'HIGH' && !t.resolvedAt).length,
      MEDIUM: tickets.filter(t => t.priority === 'MEDIUM' && !t.resolvedAt).length,
      LOW: tickets.filter(t => t.priority === 'LOW' && !t.resolvedAt).length
    };

    return NextResponse.json({
      mttd: Number(mttd.toFixed(2)),
      mttr: Number(mttr.toFixed(2)),
      slaCompliance: Number(slaCompliance.toFixed(1)),
      backlog,
      totalTickets: tickets.length
    });
  } catch (error) {
    console.error('[SupportMetrics] Error:', error);
    return NextResponse.json({ error: 'Error al calcular métricas' }, { status: 500 });
  }
});
