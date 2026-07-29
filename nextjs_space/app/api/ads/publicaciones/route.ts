export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * Publicaciones ADS — list and create ad publications.
 *
 * Sub-route of ADS Intelligence. Distinct from /api/ads/campaigns in that
 * each publication carries its own creative + copy + schedule (one shot
 * social boost, not the campaign-level orchestration).
 *
 * TODO(prisma): add `adPublication` model with fields
 *  - tenantId, name, body (copy), platform ('meta'|'google'),
 *  - status (BORRADOR | PROGRAMADA | PUBLICADA | ERROR | PAUSADA),
 *  - mediaUrl, scheduledFor, publishedAt, metrics (json)
 *  - and run `npx prisma migrate dev --name add-ad-publication`.
 *
 * Until then, GET returns [] (frontend shows empty state) and POST returns
 * 501 (frontend surfaces the message). All other handlers respond 501 too.
 */
export const GET = withTenantAuth(async (_req, _auth) => {
  return NextResponse.json([]);
});

export const POST = withTenantAuth(async (_req, _auth) => {
  return NextResponse.json(
    {
      error:
        'Publicaciones ADS: pending Prisma model adPublication. POST stub.',
    },
    { status: 501 },
  );
});
