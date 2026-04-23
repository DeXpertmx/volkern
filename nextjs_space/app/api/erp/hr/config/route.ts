import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { brandingConfig: true }
    });

    const config = (tenant?.brandingConfig as any)?.hrSettings || {
      badge: {
        primaryColor: '#0f172a',
        secondaryColor: '#3b82f6',
        showQr: true,
        showDepartment: true,
        showJobTitle: true,
        logoUrl: '',
        layout: 'portrait'
      }
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('[HR_CONFIG_GET]', error);
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 });
  }
}, ['team:read']);

export const PATCH = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const newHrSettings = await req.json();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { brandingConfig: true }
    });

    const currentConfig = (tenant?.brandingConfig as any) || {};
    
    const updatedConfig = {
      ...currentConfig,
      hrSettings: {
        ...(currentConfig.hrSettings || {}),
        ...newHrSettings
      }
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { brandingConfig: updatedConfig }
    });

    return NextResponse.json({ success: true, hrSettings: updatedConfig.hrSettings });
  } catch (error) {
    console.error('[HR_CONFIG_PATCH]', error);
    return NextResponse.json({ error: 'Error al actualizar configuración' }, { status: 500 });
  }
}, ['team:write']);
