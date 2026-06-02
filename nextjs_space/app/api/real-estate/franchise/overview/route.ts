export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getFranchiseGlobalStats, getFranchiseCommissionSummary } from '@/lib/real-estate/commission-calculator';

/**
 * GET /api/real-estate/franchise/overview
 *
 * Dashboard consolidado para el franquiciatario master.
 * Muestra estadísticas agregadas de todas las oficinas (sub-tenants).
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  // Validar que sea una cuenta de tipo AGENCY o BUSINESS con módulo REAL_ESTATE
  if (auth.tenant?.accountType !== 'AGENCY' && auth.tenant?.accountType !== 'BUSINESS') {
    return NextResponse.json(
      { error: 'Solo disponible para cuentas de Agencia o Franquicia' },
      { status: 403 }
    );
  }

  try {
    // 1. Estadísticas globales (agregadas de todos los sub-tenants)
    const globalStats = await getFranchiseGlobalStats(tenantId);

    // Obtener todos los tenant IDs desde globalStats (evita query duplicada)
    const childTenantIds = globalStats.childTenants.map(t => t.id);
    const allTenantIds = [tenantId, ...childTenantIds];

    // 2. Resumen de comisiones por oficina
    const commissionSummary = await getFranchiseCommissionSummary(tenantId, true);

    // 3. Top propiedades más vistas
    const topProperties = await prisma.catalogoItem.findMany({
      where: {
        tenantId: { in: allTenantIds },
        tipo: 'inmueble',
        activo: true,
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 10,
      select: {
        id: true,
        nombre: true,
        precioBase: true,
        tenantId: true,
        customFieldValues: true,
        media: true,
        fechaCreacion: true,
      },
    });

    // 4. Leads recientes
    const recentLeads = await prisma.lead.findMany({
      where: {
        tenantId: { in: allTenantIds },
        fuente: 'portal_inmobiliario',
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 10,
      select: {
        id: true,
        nombre: true,
        email: true,
        empresa: true,
        tenantId: true,
        fechaCreacion: true,
      },
    });

    // 5. Deals por etapa
    const dealsByStage = await prisma.deal.groupBy({
      by: ['etapa'],
      where: {
        tenantId: { in: allTenantIds },
        estado: 'activo',
      },
      _count: { id: true },
      _sum: { valor: true },
    });

    // Mapear nombres de tenants (incluye el tenant principal + hijos de globalStats)
    const tenantNames = new Map(
      [[tenantId, auth.tenant!.nombre], ...globalStats.childTenants.map(t => [t.id, t.nombre] as [string, string])]
    );

    return NextResponse.json({
      globalStats,
      commissions: commissionSummary,
      topProperties: topProperties.map(p => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precioBase,
        oficina: tenantNames.get(p.tenantId) || '—',
        ciudad: (p.customFieldValues as any)?.zona || '',
        imagen: Array.isArray(p.media) ? (p.media[0] as any)?.url || '' : '',
        fechaCreacion: p.fechaCreacion,
      })),
      recentLeads: recentLeads.map(l => ({
        ...l,
        oficina: tenantNames.get(l.tenantId) || '—',
      })),
      dealsByStage: dealsByStage.map(d => ({
        etapa: d.etapa,
        cantidad: d._count.id,
        valorTotal: d._sum.valor || 0,
      })),
    });
  } catch (error) {
    console.error('[Franchise Overview] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos del dashboard' },
      { status: 500 }
    );
  }
});
