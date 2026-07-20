export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getConnector } from '@/lib/ads/connectors';
import type { AdPlatform } from '@/lib/ads/types';

/**
 * GET /api/ads/platforms/[id]
 * Devuelve los detalles de una conexión de plataforma de anuncios (sin tokens sensibles).
 */
export const GET = withTenantAuth(async (req: Request, auth, context) => {
  try {
    const tenantId = auth.tenant!.id;
    const { id } = context?.params || {};

    const platform = await prisma.adPlatformConnection.findUnique({
      where: { id },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        status: true,
        metadata: true,
        lastSyncedAt: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            adCampaigns: true,
            adInsights: true,
          },
        },
      },
    });

    if (!platform) {
      return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 });
    }

    // Verificar que la conexión pertenezca al tenant
    const ownershipCheck = await prisma.adPlatformConnection.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!ownershipCheck || ownershipCheck.tenantId !== tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    return NextResponse.json({
      platform: {
        ...platform,
        campaignCount: platform._count.adCampaigns,
        insightCount: platform._count.adInsights,
        syncStatus: platform.status === 'CONNECTED'
          ? (platform.lastSyncedAt
              ? (Date.now() - platform.lastSyncedAt.getTime() < 3600000 ? 'UP_TO_DATE' : 'STALE')
              : 'NEVER_SYNCED')
          : platform.status,
      },
    });
  } catch (error: any) {
    console.error('[ADS Platform Detail] Error:', error);
    return NextResponse.json({ error: 'Error al obtener detalle de la plataforma' }, { status: 500 });
  }
}, ['ads:read']);

/**
 * DELETE /api/ads/platforms/[id]
 * Desconecta una plataforma de anuncios específica.
 */
export const DELETE = withTenantAuth(async (req: Request, auth, context) => {
  try {
    const tenantId = auth.tenant!.id;
    const { id } = context?.params || {};

    // Obtener la conexión y verificar pertenencia
    const connection = await prisma.adPlatformConnection.findUnique({
      where: { id },
      select: { platform: true, tenantId: true },
    });

    if (!connection) {
      return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 });
    }

    if (connection.tenantId !== tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Ejecutar desconexión a través del conector (revoca tokens, limpia estado)
    await getConnector(connection.platform as AdPlatform).disconnect(tenantId, id);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: auth.user!.id,
        tenantId,
        accion: 'disconnect_platform',
        entidad: 'ad_platform',
        entidadId: id,
        descripcion: `Plataforma ${connection.platform} desconectada`,
      },
    });

    return NextResponse.json({ success: true, message: 'Plataforma desconectada exitosamente' });
  } catch (error: any) {
    console.error('[ADS Platform Detail] Error disconnecting:', error);
    return NextResponse.json({ error: error.message || 'Error al desconectar plataforma' }, { status: 500 });
  }
}, ['ads:manage']);
