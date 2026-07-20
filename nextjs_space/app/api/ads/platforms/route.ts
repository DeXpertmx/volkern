export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getConnector } from '@/lib/ads/connectors';
import { AdDisconnectSchema } from '@/lib/validation/schemas/ads';
import type { AdPlatform } from '@/lib/ads/types';

/**
 * GET /api/ads/platforms
 * Lista todas las plataformas de anuncios conectadas para el tenant.
 * Excluye accessToken y refreshToken por seguridad.
 */
export const GET = withTenantAuth(async (req: Request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const platforms = await prisma.adPlatformConnection.findMany({
      where: { tenantId },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        status: true,
        metadata: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ platforms });
  } catch (error: any) {
    console.error('[ADS Platforms] Error listing platforms:', error);
    return NextResponse.json({ error: 'Error al obtener plataformas conectadas' }, { status: 500 });
  }
}, ['ads:read']);

/**
 * DELETE /api/ads/platforms
 * Desconecta una plataforma de anuncios por su ID.
 */
export const DELETE = withTenantAuth(async (req: Request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const body = await req.json();
    const parsed = AdDisconnectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { platformId } = parsed.data;

    // Obtener la conexión para conocer la plataforma
    const connection = await prisma.adPlatformConnection.findUnique({
      where: { id: platformId },
      select: { platform: true, tenantId: true },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 });
    }

    if (connection.tenantId !== tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Ejecutar desconexión a través del conector (revoca tokens, limpia estado)
    await getConnector(connection.platform as AdPlatform).disconnect(tenantId, platformId);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user!.id,
        tenantId,
        accion: 'disconnect_platform',
        entidad: 'ad_platform',
        entidadId: platformId,
        descripcion: `Plataforma ${connection.platform} desconectada`,
      },
    });

    return NextResponse.json({ success: true, message: 'Plataforma desconectada exitosamente' });
  } catch (error: any) {
    console.error('[ADS Platforms] Error disconnecting platform:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar plataforma' }, { status: 500 });
  }
}, ['ads:manage']);
