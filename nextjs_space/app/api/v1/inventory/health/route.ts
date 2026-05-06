import { NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
import { withTenantAuth } from '@/lib/api-key-auth';
import { skills } from '@/lib/skills';

/**
 * API: Salud del Inventario (Dashboard)
 * Proxy hacia el skill audit_material_leaks
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    
    // Llamar al skill de auditoría operativa
    const result = await skills.audit_material_leaks({ tenantId });
    
    return NextResponse.json({
      success: true,
      data: {
        status: result.status,
        items: [], // En una implementación real, filtraríamos los items críticos aquí
        recommendation: result.recommendation
      }
    });

  } catch (error: any) {
    console.error('[InventoryHealthAPI] Error:', error);
    return NextResponse.json({ error: 'Error al auditar inventario' }, { status: 500 });
  }
});
