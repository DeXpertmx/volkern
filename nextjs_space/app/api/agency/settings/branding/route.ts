export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * PATCH /api/agency/settings/branding
 * Actualiza la identidad visual de la agencia y sus hijos
 */
export const PATCH = withTenantAuth(async (req, auth) => {
  const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
  if (auth.user?.accountType !== 'AGENCY' && !isSuperadmin) {
    return NextResponse.json({ error: 'Solo disponible para cuentas de Agencia o Administradores' }, { status: 403 });
  }

  try {
    const { logo_url, primary_color, show_powered_by, custom_footer_text } = await req.json();

    const updatedTenant = await prisma.tenant.update({
      where: { id: auth.tenant!.id },
      data: {
        brandingConfig: {
          logoUrl: logo_url,
          primaryColor: primary_color,
          showPoweredBy: show_powered_by ?? true,
          customFooterText: custom_footer_text
        }
      }
    });

    console.log(`[Agency] Branding actualizado por ${auth.tenant!.nombre}`);

    return NextResponse.json({ 
      success: true, 
      branding: updatedTenant.brandingConfig 
    });

  } catch (error: any) {
    console.error('[Agency Branding] Error:', error);
    return NextResponse.json({ error: 'Error al actualizar configuración de marca' }, { status: 500 });
  }
});

/**
 * GET /api/agency/settings/branding
 * Obtiene la configuración actual
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenant!.id },
    select: { brandingConfig: true }
  });

  return NextResponse.json(tenant?.brandingConfig || {});
});
