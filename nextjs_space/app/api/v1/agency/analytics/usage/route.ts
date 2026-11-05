export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/v1/agency/analytics/usage
 * Devuelve métricas agregadas de uso para todos los slots de la agencia.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const agencyId = auth.tenant!.id;
    const isAgency = auth.user?.accountType === 'AGENCY' || (auth.user as any)?.tenant?.accountType === 'AGENCY';
    const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

    if (!isAgency && !isSuperadmin) {
      return NextResponse.json({ error: 'Solo disponible para agencias' }, { status: 403 });
    }

    // 1. Obtener todos los IDs de los hijos
    const children = await prisma.tenant.findMany({
      where: { parentId: agencyId },
      select: { id: true, nombre: true }
    });

    const childIds = children.map(c => c.id);

    // 2. Agregar logs de habilidades de IA (AgentSkillLog)
    const usageBySkill = await prisma.agent_skill_logs.groupBy({
      by: ['toolExecuted'],
      where: {
        tenantId: { in: childIds }
      },
      _count: true
    });

    // 3. Obtener logs recientes para el feed
    const recentLogs = await prisma.agent_skill_logs.findMany({
      where: {
        tenantId: { in: childIds }
      },
      include: {
        Tenant: { select: { nombre: true } }
      },
      orderBy: { createdAt: 'desc' } as const,
      take: 10
    });

    // 4. Calcular total global
    const totalCalls = usageBySkill.reduce((acc: number, curr) => acc + curr._count, 0);

    return NextResponse.json({
      success: true,
      stats: {
        totalCalls,
        totalSlots: children.length,
        breakdown: usageBySkill.map((s: { toolExecuted: string; _count: number }) => ({
          skill: s.toolExecuted,
          count: s._count
        }))
      },
      recentLogs: recentLogs.map((l: { id: string; toolExecuted: string; Tenant?: { nombre?: string | null } | null; createdAt: Date }) => ({
        id: l.id,
        skill: l.toolExecuted,
        tenant: l.Tenant?.nombre || 'Unknown',
        timestamp: l.createdAt
      }))
    });

  } catch (error: any) {
    console.error('[Agency-Usage] Error:', error);
    return NextResponse.json({ error: 'Error al calcular métricas de uso' }, { status: 500 });
  }
}, ['analytics:read']);
