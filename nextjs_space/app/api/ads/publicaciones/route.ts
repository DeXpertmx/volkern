export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdPublicationCreateSchema, AdPublicationListQuerySchema } from '@/lib/validation/schemas/ads';

// ─── States permitidos + transiciones ─────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ['PROGRAMADA', 'PUBLICADA'],
  PROGRAMADA: ['PUBLICADA', 'ERROR', 'BORRADOR'],
  PUBLICADA: ['PAUSADA', 'ERROR'],
  PAUSADA: ['PUBLICADA'],
  ERROR: ['BORRADOR', 'PROGRAMADA', 'PUBLICADA'],
};

export function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true; // no-op update
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── GET /api/ads/publicaciones ───────────────────────────────────
// Lista las publicaciones del tenant con filtros opcionales.
// Una vez creadas con plataforma + creative, el dashboard las muestra.
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const parsed = AdPublicationListQuerySchema.safeParse(queryParams);
    const filters = parsed.success ? parsed.data : { limit: 50 };

    const where: any = { tenantId: auth.tenant!.id };
    if (filters.plataforma) where.plataforma = filters.plataforma;
    if (filters.estado) where.estado = filters.estado;
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.socialPostId) where.socialPostId = filters.socialPostId;

    const [items, total] = await Promise.all([
      prisma.adsCampaignPublication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        include: {
          creative: true,
          campaign: { select: { id: true, name: true, externalId: true } },
          socialPost: { select: { id: true, content: true, publishedAt: true, platforms: true } },
        },
      }),
      prisma.adsCampaignPublication.count({ where }),
    ]);

    return NextResponse.json({ data: items, meta: { total, limit: filters.limit ?? 50 } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

// ─── POST /api/ads/publicaciones ──────────────────────────────────
// Crea una publicación nueva. Dos modos:
//   - Con creativeId propio (AdsCreative creado aparte)
//   - Boost: isBoost=true + socialPostId (la creatividad viene del SocialPost)
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const raw = await req.json();
    const body = validateBody(AdPublicationCreateSchema, raw);
    if (body instanceof Response) return body;

    // Validar platformId existe y pertenece al tenant
    const platform = await prisma.adPlatformConnection.findUnique({
      where: { id: body.platformId },
    });
    if (!platform || platform.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'platformId inválido o de otro tenant' }, { status: 400 });
    }
    if (platform.status !== 'CONNECTED') {
      return NextResponse.json(
        { error: `Plataforma ${platform.platform} no está conectada (status=${platform.status})` },
        { status: 400 },
      );
    }

    // Validar creativeId si fue provisto
    if (body.creativeId) {
      const creative = await prisma.adsCreative.findUnique({ where: { id: body.creativeId } });
      if (!creative || creative.tenantId !== auth.tenant!.id) {
        return NextResponse.json({ error: 'creativeId inválido' }, { status: 400 });
      }
    }

    // Validar socialPostId en modo boost
    if (body.isBoost) {
      if (!body.socialPostId) {
        return NextResponse.json({ error: 'socialPostId es obligatorio en modo boost' }, { status: 400 });
      }
      const post = await prisma.socialPost.findUnique({ where: { id: body.socialPostId } });
      if (!post || post.tenantId !== auth.tenant!.id) {
        return NextResponse.json({ error: 'socialPostId inválido' }, { status: 400 });
      }
    }

    // Validar campaignId si fue provisto
    if (body.campaignId) {
      const campaign = await prisma.adCampaign.findUnique({ where: { id: body.campaignId } });
      if (!campaign || campaign.tenantId !== auth.tenant!.id) {
        return NextResponse.json({ error: 'campaignId inválido' }, { status: 400 });
      }
    }

    // Determinar estado inicial según scheduledFor e isBoost
    let initialState = 'BORRADOR';
    if (body.scheduledFor && new Date(body.scheduledFor).getTime() > Date.now()) {
      initialState = 'PROGRAMADA';
    }

    const publication = await prisma.adsCampaignPublication.create({
      data: {
        tenantId: auth.tenant!.id,
        nombre: body.nombre,
        plataforma: body.plataforma,
        campaignId: body.campaignId ?? null,
        creativeId: body.isBoost ? null : (body.creativeId ?? null),
        socialPostId: body.isBoost ? (body.socialPostId ?? null) : null,
        isBoost: body.isBoost ?? false,
        estado: initialState,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        budgetDaily: body.budgetDaily ?? null,
        budgetTotal: body.budgetTotal ?? null,
        currency: body.currency ?? 'MXN',
        // Almacenamos platformId en metadata ya que el modelo no tiene el campo directo.
        // En publish resolveremos platformId por tenant+plataforma.
        metrics: { impressions: 0, clicks: 0, spend: 0 },
      },
    });

    return NextResponse.json({ data: publication }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
