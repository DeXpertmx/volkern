import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { StrategyService } from '@/lib/strategy/strategy-service';
import { prisma } from '@/lib/db';

/**
 * GET /api/strategy/snapshot
 * Proporciona el snapshot ejecutivo consolidado del Strategy Hub.
 * Refactorizado para usar withTenantAuth y asegurar aislamiento.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Ejecutar el sniffer para tener datos frescos (en segundo plano o secuencial)
    // Nota: runProfitabilitySniffer crea registros en la DB
    await StrategyService.runProfitabilitySniffer(tenantId);
    const projections = await StrategyService.generateCashflowProjections(tenantId);
    
    // Consolidar registros de rentabilidad enriquecidos con nombres de proyecto
    const rawProfitability = await prisma.profitabilityRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const projectIds = rawProfitability
      .filter(r => r.entityType === 'PROJECT')
      .map(r => r.entityId);

    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true }
    });

    const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

    const profitability = rawProfitability.map(r => ({
      ...r,
      entityName: r.entityType === 'PROJECT' ? (projectMap[r.entityId] || r.entityId) : r.entityId
    }));

    return NextResponse.json({
      projections,
      profitability,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[StrategyAPI] Error:', error);
    // Canal de degradación segura
    return NextResponse.json({ 
      projections: [], 
      profitability: [],
      fallback: true,
      error: 'Error al generar snapshot estratégico',
      timestamp: new Date().toISOString()
    });
  }
}, { requiredScopes: ['finanzas:read'] }); // Ajustado scope según lo disponible en el sistema
