import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { prisma } from '@/lib/db';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Fetch signals
    const signals = await prisma.discoverySignal.findMany({
      where: { tenantId },
      orderBy: [
        { confidence: 'desc' },
        { score: 'desc' }
      ],
      take: 50
    });
    
    // Fetch market observations
    const observations = await prisma.marketObservation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    return NextResponse.json({ signals, observations });
  } catch (error) {
    console.error('[DiscoverAPI] Error:', error);
    // Degradation Channel: Return empty data structure with fallback flag
    return NextResponse.json({ 
      signals: [], 
      observations: [], 
      fallback: true,
      error: 'Error al obtener discover data, mostrando estado degradado.'
    });
  }
}, { requiredScopes: ['marketing:read', 'sales:read'] });
