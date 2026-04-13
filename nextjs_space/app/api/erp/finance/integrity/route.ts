import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateFinancialSecurity } from '@/lib/security/finance-guard';
import { verifyFinancialIntegrity } from '@/lib/security/integrity-service';

/**
 * GET /api/erp/finance/integrity - Verificar integridad de la bóveda
 */
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const user = { id: auth.user!.id, role: auth.user!.role, email: auth.user!.email || '' };

    // 🛡️ VALIDAR ACCESO
    const security = await validateFinancialSecurity(tenantId, user);
    if (!security.authorized && !security.alertOwner) {
       return NextResponse.json({ error: security.error }, { status: security.status });
    }

    const isIntegrityIntact = await verifyFinancialIntegrity(tenantId);

    return NextResponse.json({
      status: isIntegrityIntact ? 'OK' : 'ALERT',
      message: isIntegrityIntact 
        ? "La bóveda financiera está íntegra. Todos los hashes coinciden." 
        : "Se detectó una discrepancia en la cadena de auditoría."
    });
  } catch (error) {
    console.error('Error verifying integrity:', error);
    return NextResponse.json({ error: 'Error al verificar integridad' }, { status: 500 });
  }
}, ['erp:read']);
