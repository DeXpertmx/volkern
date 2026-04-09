export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma as proxyPrisma, globalPrisma, getTenantDb } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

// GET /api/admin/analytics - Obtener analíticas globales (Superadmin)
// Este endpoint opera principalmente sobre el Control Plane (Global DB) y agrega datos de Tenants.
export const GET = withTenantAuth(async (req, auth) => {
  try {
    // 1. Verificar si el usuario es superadmin (el rol ya viene en auth.user)
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado: requiere rol de Superadmin' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || '30';
    const daysAgo = parseInt(period);
    const periodStart = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    // 2. Obtener métricas del Control Plane (Global DB) - Rápidas
    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      newTenants,
      totalMRR,
      mrrByCurrency,
      totalGlobalUsers,
      tenantsWithDb,
      recentTenants
    ] = await Promise.all([
      globalPrisma.tenant.count(),
      globalPrisma.tenant.count({ where: { estado: 'activo' } }),
      globalPrisma.tenant.count({ where: { estado: 'trial' } }),
      globalPrisma.tenant.count({ where: { estado: 'suspendido' } }),
      globalPrisma.tenant.count({
        where: { fechaCreacion: { gte: periodStart } }
      }),
      globalPrisma.tenant.aggregate({
        _sum: { mrr: true },
        where: { estado: { in: ['activo', 'trial'] } }
      }),
      globalPrisma.tenant.groupBy({
        by: ['moneda'],
        _sum: { mrr: true },
        where: { estado: { in: ['activo', 'trial'] } }
      }),
      globalPrisma.user.count(),
      // Necesitamos la lista de tenants para agregar datos operativos (leads, etc)
      globalPrisma.tenant.findMany({
        where: { estado: { in: ['activo', 'trial'] } },
        select: { id: true, dbUrl: true }
      }),
      globalPrisma.$queryRaw`
        SELECT 
          DATE("fechaCreacion") as date,
          COUNT(*)::int as count
        FROM "Tenant"
        WHERE "fechaCreacion" >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}
        GROUP BY DATE("fechaCreacion")
        ORDER BY date DESC
      `
    ]);

    // 3. Agregación Multi-DB (Muestreo o Agregación Asíncrona)
    // NOTA: En un sistema a gran escala esto se haría vía Workers o Data Warehouse.
    // Para Volkern Admin actual, hacemos una agregación simple sobre tenants activos.
    let totalLeadsAggregated = 0;
    let totalCoursesAggregated = 0;
    let totalStudentsAggregated = 0;

    // Limitamos la agregación en tiempo real para evitar timeouts si hay cientos de tenants
    const aggregationTenants = tenantsWithDb.slice(0, 50); // Límite de seguridad
    
    const operationalMetrics = await Promise.all(aggregationTenants.map(async (t) => {
      try {
        const tenantDb = await getTenantDb(t.id);
        const [leads, courses, students] = await Promise.all([
          tenantDb.lead.count(),
          tenantDb.curso.count(),
          tenantDb.estudiante.count()
        ]);
        return { leads, courses, students };
      } catch (e) {
        console.error(`Error agregando datos para tenant ${t.id}:`, e);
        return { leads: 0, courses: 0, students: 0 };
      }
    }));

    operationalMetrics.forEach(m => {
      totalLeadsAggregated += m.leads;
      totalCoursesAggregated += m.courses;
      totalStudentsAggregated += m.students;
    });

    // 4. Calcular tasas (MRR, Churn)
    const churnedTenants = await globalPrisma.auditLog.count({
      where: {
        entidad: 'tenant',
        accion: 'actualizar',
        descripcion: { contains: 'suspendido' },
        fechaCreacion: { gte: periodStart }
      }
    });

    const churnRate = activeTenants > 0 ? ((churnedTenants / activeTenants) * 100).toFixed(2) : '0.00';
    const growthRate = activeTenants > 0 ? ((newTenants / activeTenants) * 100).toFixed(2) : '0.00';

    return NextResponse.json({
      overview: {
        totalTenants,
        activeTenants,
        trialTenants,
        suspendedTenants,
        totalMRR: totalMRR._sum.mrr || 0,
        totalUsers: totalGlobalUsers,
        totalLeads: totalLeadsAggregated,
        totalCourses: totalCoursesAggregated,
        totalStudents: totalStudentsAggregated,
        aggregatedSamples: aggregationTenants.length // Indica cuántos DBs se consultaron
      },
      metrics: {
        newTenants,
        churnRate: parseFloat(churnRate),
        growthRate: parseFloat(growthRate),
        avgLeadsPerTenant: activeTenants > 0 ? Math.round(totalLeadsAggregated / (aggregationTenants.length || 1)) : 0
      },
      mrrByCurrency: mrrByCurrency.map((item: any) => ({
        currency: item.moneda,
        total: item._sum.mrr || 0
      })),
      recentActivity: recentTenants
    });

  } catch (error: any) {
    console.error('Error fetching admin analytics:', error);
    return NextResponse.json({ error: 'Error al obtener analytics' }, { status: 500 });
  }
}, ['admin:read'])
