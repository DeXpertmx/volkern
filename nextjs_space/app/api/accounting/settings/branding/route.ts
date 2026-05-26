export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AccountingBrandingUpdateSchema } from '@/lib/validation/schemas/misc';

/**
 * PATCH /api/accounting/settings/branding
 * Actualiza la identidad visual del despacho contable
 * ⚠️ showPoweredBy siempre se fuerza a true (no se puede desactivar)
 */
export const PATCH = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Asesoría o Administradores' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validation = AccountingBrandingUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Datos de branding inválidos',
        details: validation.error.format()
      }, { status: 400 });
    }

    const { logo_url, primary_color, custom_footer_text } = validation.data;

    const updatedTenant = await prisma.tenant.update({
      where: { id: auth.tenant!.id },
      data: {
        brandingConfig: {
          logoUrl: logo_url,
          primaryColor: primary_color,
          // 🔒 Forzado: nunca se puede desactivar Powered by Volkern
          showPoweredBy: true,
          customFooterText: custom_footer_text
        }
      }
    });

    console.log(`[Accounting] Branding actualizado por ${auth.tenant!.nombre}`);

    return NextResponse.json({ 
      success: true, 
      branding: updatedTenant.brandingConfig,
      // Confirmar al frontend que showPoweredBy está forzado
      note: 'showPoweredBy está siempre activo para planes de asesoría'
    });

  } catch (error: any) {
    console.error('[Accounting Branding] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar configuración de marca' }, { status: 500 });
  }
});

/**
 * GET /api/accounting/settings/branding
 * Obtiene la configuración actual
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenant!.id },
    select: { brandingConfig: true }
  });

  return NextResponse.json(tenant?.brandingConfig || {});
});
