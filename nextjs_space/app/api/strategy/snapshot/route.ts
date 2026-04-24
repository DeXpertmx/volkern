import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { StrategyService } from '@/lib/strategy/strategy-service';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Ejecutar el sniffer para tener datos frescos
    await StrategyService.runProfitabilitySniffer(tenantId);
    const projections = await StrategyService.generateCashflowProjections(tenantId);
    
    // Aquí consolidaríamos el snapshot
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
    // Degradation Channel
    return NextResponse.json({ 
      projections: [], 
      profitability: [],
      fallback: true,
      timestamp: new Date().toISOString()
    });
  }
}, { requiredScopes: ['finance:read', 'admin:read'] });
