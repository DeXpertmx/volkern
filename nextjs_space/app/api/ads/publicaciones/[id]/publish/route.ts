export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getConnectorForPlatform } from '@/lib/ads/factory';

export const POST = withTenantAuth(async (_req, auth, { params }: any) => {
  try {
    const { id } = params;
    const pub = await prisma.adsCampaignPublication.findUnique({
      where: { id },
      include: { creative: true, socialPost: true },
    });
    if (!pub || pub.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    // Solo BORRADOR o PROGRAMADA pueden pasar a PUBLICADA vía /publish
    if (!['BORRADOR', 'PROGRAMADA', 'ERROR'].includes(pub.estado)) {
      return NextResponse.json(
        { error: `No se puede publicar en estado ${pub.estado}` },
        { status: 409 },
      );
    }

    // No-publicar boost sin SocialPost o creatividad sin AdsCreative
    if (!pub.isBoost && !pub.creative) {
      return NextResponse.json(
        { error: 'Publicación sin creatividad asociada. Crea o asigna un AdsCreative.' },
        { status: 400 },
      );
    }

    // Resolver platformId por tenant + plataforma
    const platformName = pub.plataforma; // 'META' | 'GOOGLE'
    const platform = await prisma.adPlatformConnection.findFirst({
      where: { tenantId: auth.tenant!.id, platform: platformName, status: 'CONNECTED' },
    });
    if (!platform) {
      return NextResponse.json(
        { error: `No hay plataforma ${platformName} conectada para este tenant` },
        { status: 400 },
      );
    }

    const connector = getConnectorForPlatform(platformName);
    let result;
    try {
      result = await connector.publishPublication({
        publicationId: pub.id,
        platformId: platform.id,
        ...(pub.creative && {
          creative: {
            mediaUrl: pub.creative.mediaUrl,
            mediaType: pub.creative.mediaType as 'IMAGE' | 'VIDEO',
            bodyText: pub.creative.bodyText ?? undefined,
            headline: pub.creative.headline ?? undefined,
            callToAction: pub.creative.callToAction ?? undefined,
            landingUrl: pub.creative.landingUrl ?? undefined,
          },
        }),
        ...(pub.socialPostId && { socialPostId: pub.socialPostId }),
      });
    } catch (publishErr: any) {
      // Marcar ERROR con mensaje claro
      await prisma.adsCampaignPublication.update({
        where: { id: pub.id },
        data: {
          estado: 'ERROR',
          errorMessage: publishErr.message || 'Error desconocido al publicar',
        },
      });
      return NextResponse.json(
        { error: publishErr.message || 'Error al publicar', data: { estado: 'ERROR' } },
        { status: 424 },
      );
    }

    const updated = await prisma.adsCampaignPublication.update({
      where: { id: pub.id },
      data: {
        estado: 'PUBLICADA',
        externalAdId: result.externalAdId,
        externalStatus: result.status,
        publishedAt: new Date(),
        errorMessage: null,
      },
    });

    return NextResponse.json({ data: updated, externalAdId: result.externalAdId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
