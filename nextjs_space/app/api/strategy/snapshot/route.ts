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
    
    // Consolidar registros de rentabilidad
    const profitability = await prisma.profitabilityRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

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
