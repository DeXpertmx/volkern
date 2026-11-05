import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

export const dynamic = 'force-dynamic';

/**
 * API: Actividad Operativa (Dashboard)
 * Proxy hacia el skill get_field_activity
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Llamar al skill de actividad en campo
    const result = await skills.get_field_activity({ tenantId });
    
    return NextResponse.json({
      success: true,
      activeTechs: result.activeTechs
    });

  } catch (error: any) {
    console.error('[OperationsActivityAPI] Error:', error);
    return NextResponse.json({ error: 'Error al obtener actividad operativa' }, { status: 500 });
  }
}, ['dashboard:read']);
