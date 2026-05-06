export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { GemmaService } from '@/lib/gemma/gemma-service';

/**
 * POST /api/guide
 * Procesa consultas del Volkern Guide usando Gemma + RAG (Knowledge Hub)
 * Protegido por withTenantAuth para asegurar aislamiento de datos.
 */
export const POST = withTenantAuth(async (request: Request, auth) => {
  try {
    const { hub, query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const tenantId = auth.tenant!.id;
    const userId = auth.user!.id;

    console.log(`[GuideAPI] Consulta recibida de ${userId} para tenant ${tenantId}`);

    const result = await GemmaService.getContextualGuideResponse(
      tenantId,
      userId,
      hub || 'General',
      query
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GuideAPI] Error fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
