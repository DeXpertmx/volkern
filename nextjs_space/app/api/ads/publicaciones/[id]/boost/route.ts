export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdBoostSchema } from '@/lib/validation/schemas/ads';

// POST /api/ads/publicaciones/[id]/boost
// Crea una nueva Publicación ADS en modo boost, basada en un SocialPost existente.
// El path retorna 201 con la nueva publicación creada.
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const raw = await req.json();
    const body = validateBody(AdBoostSchema, raw);
    if (body instanceof Response) return body;

    // Validar que el SocialPost pertenece al tenant y está publicado (necesario para boost)
    const post = await prisma.socialPost.findUnique({ where: { id: body.socialPostId } });
    if (!post || post.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'socialPostId inválido' }, { status: 400 });
    }
    if (post.status !== 'published' && post.status !== 'partial') {
      return NextResponse.json(
        { error: `El SocialPost debe estar publicado (status=published/partial). Actual: ${post.status}` },
        { status: 400 },
      );
    }

    // Resolver plataforma preferida desde los platforms del post
    const platforms = Array.isArray(post.platforms) ? post.platforms : [];
    const adPlatform = platforms.find((p) => p === 'facebook') ? 'META' : platforms.find((p) => p === 'google') ? 'GOOGLE' : null;
    if (!adPlatform) {
      return NextResponse.json(
        { error: 'SocialPost no tiene plataforma compatible para boost (requiere facebook o google)' },
        { status: 400 },
      );
    }

    const platform = await prisma.adPlatformConnection.findFirst({
      where: { tenantId: auth.tenant!.id, platform: adPlatform, status: 'CONNECTED' },
    });
    if (!platform) {
      return NextResponse.json(
        { error: `Plataforma ${adPlatform} no conectada para este tenant` },
        { status: 400 },
      );
    }

    // Validar campaignId si se proveyó
    if (body.campaignId) {
      const campaign = await prisma.adCampaign.findUnique({ where: { id: body.campaignId } });
      if (!campaign || campaign.tenantId !== auth.tenant!.id) {
        return NextResponse.json({ error: 'campaignId inválido' }, { status: 400 });
      }
    }

    const nombre = `Boost: ${(post.content || '').slice(0, 80)}`;
    const publication = await prisma.adsCampaignPublication.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre,
        plataforma: adPlatform,
        campaignId: body.campaignId ?? null,
        creativeId: null,
        socialPostId: post.id,
        isBoost: true,
        estado: 'BORRADOR',
        budgetDaily: body.budgetDaily ?? null,
        budgetTotal: body.budgetTotal ?? null,
        currency: body.currency ?? 'MXN',
        metrics: { impressions: 0, clicks: 0, spend: 0 },
      },
    });

    // Después de crear, intentar publicar inmediatamente (con presupuestos):
    try {
      const { getConnectorForPlatform } = await import('@/lib/ads/factory');
      const connector = getConnectorForPlatform(adPlatform);
      const result = await connector.publishPublication({
        publicationId: publication.id,
        socialPostId: post.id,
        ...(body.metaPageId && { metaPageId: body.metaPageId }),
        ...(body.adSetId && { adSetId: body.adSetId }),
        ...(body.budgetDaily && { budgetDaily: body.budgetDaily }),
        ...(body.budgetTotal && { budgetTotal: body.budgetTotal }),
        ...(body.currency && { currency: body.currency }),
      });
      const updated = await prisma.adsCampaignPublication.update({
        where: { id: publication.id },
        data: {
          estado: 'PUBLICADA',
          externalAdId: result.externalAdId,
          externalStatus: result.status,
          publishedAt: new Date(),
        },
      });
      return NextResponse.json(
        {
          data: updated,
          externalAdId: result.externalAdId,
          note: 'Creada y publicada inmediatamente (boost). Si el resultado es IN_REVIEW, Meta la revisará antes de mostrarla.',
        },
        { status: 201 },
      );
    } catch (publishErr: any) {
      await prisma.adsCampaignPublication.update({
        where: { id: publication.id },
        data: {
          estado: 'ERROR',
          errorMessage: publishErr.message || 'Error publicando el boost',
        },
      });
      return NextResponse.json(
        {
          error: publishErr.message || 'Error publicando boost',
          data: { id: publication.id, estado: 'ERROR' },
        },
        { status: 424 },
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
