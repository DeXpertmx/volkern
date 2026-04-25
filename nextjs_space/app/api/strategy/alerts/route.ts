import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { StrategyService } from '@/lib/strategy/strategy-service';

/**
 * GET /api/strategy/alerts
 * Obtiene las alertas estratégicas generadas por Gemma para el ejecutivo.
 * Refactorizado con withTenantAuth para aislamiento por tenant.
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Generar o obtener alertas ejecutivas
    const alert = await StrategyService.generateStrategicAlerts(tenantId);
    
    return NextResponse.json([alert]);
  } catch (error) {
    console.error('[StrategyAPI Alerts] Error:', error);
    return NextResponse.json([{ 
      message: 'Sistema de alertas estratégicas degradado temporalmente.',
      fallback: true
    }]);
  }
}, { requiredScopes: ['finanzas:read'] });
