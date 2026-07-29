export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateBody } from '@/lib/validation';
import { AdCreativeCreateSchema } from '@/lib/validation/schemas/ads';
import type { Prisma } from '@prisma/client';

// GET /api/ads/creatives — lista las creatividades del tenant
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const items = await prisma.adsCreative.findMany({
      where: { tenantId: auth.tenant!.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({ data: items, meta: { total: items.length, limit } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

// POST /api/ads/creatives — crea un registro AdsCreative.
// NOTA sobre uploads binarios: la subida del archivo binario (imagen/video) se hace
// mediante endpoint pre-firmado en lib/s3.ts. Este endpoint solo registra el activo
// creativo una vez que el frontend ya tiene la URL pública (CDN/S3).
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const raw = await req.json();
    const body = validateBody(AdCreativeCreateSchema, raw);
    if (body instanceof Response) return body;

    const data: Prisma.AdsCreativeCreateInput = {
      tenant: { connect: { id: auth.tenant!.id } },
      nombre: body.nombre,
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaType,
    };
    if (body.durationSec !== undefined && body.durationSec !== null) data.durationSec = body.durationSec;
    if (body.width !== undefined && body.width !== null) data.width = body.width;
    if (body.height !== undefined && body.height !== null) data.height = body.height;
    if (body.bodyText !== undefined && body.bodyText !== null) data.bodyText = body.bodyText;
    if (body.headline !== undefined && body.headline !== null) data.headline = body.headline;
    if (body.callToAction !== undefined && body.callToAction !== null) data.callToAction = body.callToAction;
    if (body.landingUrl !== undefined && body.landingUrl !== null) data.landingUrl = body.landingUrl;

    const creative = await prisma.adsCreative.create({ data });
    return NextResponse.json({ data: creative }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
