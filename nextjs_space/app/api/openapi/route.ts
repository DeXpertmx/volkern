export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { openApiDocument } from '@/lib/openapi';

/**
 * GET /api/openapi
 *
 * Devuelve la especificación OpenAPI 3.0 completa generada
 * automáticamente desde los schemas Zod del proyecto.
 *
 * Tags: Sistema
 */
export async function GET() {
  return NextResponse.json(openApiDocument);
}
