import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * GET /api/erp/finance/taxes - Previsión de impuestos regional
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country') as 'MX' | 'ES' | 'USA_LLC' || 'ES';
    
    const tenantId = auth.tenant!.id;

    // Ejecutar Skill de Prospector Fiscal
    const projection = await skills.tax_prospector({ tenantId, region: country });

    return NextResponse.json(projection);
  } catch (error) {
    console.error('Error calculating tax provisions:', error);
    return NextResponse.json({ error: 'Error al calcular impuestos' }, { status: 500 });
  }
}, ['erp:read']);
