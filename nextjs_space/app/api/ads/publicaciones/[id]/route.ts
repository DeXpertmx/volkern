export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * Publicaciones ADS — single publication CRUD.
 *
 * Companion of /api/ads/publicaciones/route.ts. All verbs respond 501 until
 * the Prisma model `adPublication` is added. The `id` pathname param is
 * documented for the eventual implementation; for now we just echo a clear
 * server-side message so the frontend can surface it.
 */
export const GET = withTenantAuth(async (_req, _auth) => {
  return NextResponse.json(
    {
      error:
        'Publicaciones ADS: pending Prisma model adPublication. GET stub.',
    },
    { status: 501 },
  );
});

export const PATCH = withTenantAuth(async (_req, _auth) => {
  return NextResponse.json(
    {
      error:
        'Publicaciones ADS: pending Prisma model adPublication. PATCH stub.',
    },
    { status: 501 },
  );
});

export const DELETE = withTenantAuth(async (_req, _auth) => {
  return NextResponse.json(
    {
      error:
        'Publicaciones ADS: pending Prisma model adPublication. DELETE stub.',
    },
    { status: 501 },
  );
});
