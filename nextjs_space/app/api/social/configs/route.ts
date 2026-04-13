import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { encrypt } from '@/lib/core/crypto';

export const dynamic = 'force-dynamic';

// GET /api/social/configs - Listar configuraciones conectadas
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const configs = await prisma.socialPlatformConfig.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        platform: true,
        profileName: true,
        profileImage: true,
        profileId: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
    });

    return NextResponse.json({ success: true, configs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// POST /api/social/configs - Guardar/Actualizar configuración manual (token directo)
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const body = await req.json();
    const { platform, accessToken, profileId, profileName, profileImage } = body;

    if (!platform || !accessToken) {
      return NextResponse.json({ error: 'Plataforma y Token requeridos' }, { status: 400 });
    }

    const encryptedToken = encrypt(accessToken);

    const config = await prisma.socialPlatformConfig.upsert({
      where: {
        tenantId_platform: { tenantId, platform },
      },
      update: {
        accessToken: encryptedToken,
        profileId,
        profileName,
        profileImage,
        isActive: true,
        metadata: { connectedManually: true, connectedAt: new Date().toISOString() },
      },
      create: {
        tenantId,
        platform,
        accessToken: encryptedToken,
        profileId,
        profileName,
        profileImage,
        isActive: true,
        metadata: { connectedManually: true, connectedAt: new Date().toISOString() },
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// DELETE /api/social/configs?platform=facebook - Desconectar una plataforma
export const DELETE = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');

    if (!platform) {
      return NextResponse.json({ error: 'Parámetro platform requerido' }, { status: 400 });
    }

    // Desactivar la config en lugar de borrarla (permite auditoría)
    const existing = await prisma.socialPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId, platform } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 });
    }

    await prisma.socialPlatformConfig.update({
      where: { tenantId_platform: { tenantId, platform } },
      data: {
        isActive: false,
        accessToken: '', // Limpiar token por seguridad
        profileId: null,
        profileName: null,
        profileImage: null,
        expiresAt: null,
        metadata: { disconnectedAt: new Date().toISOString() },
      },
    });

    return NextResponse.json({ success: true, message: `${platform} desconectado correctamente` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
