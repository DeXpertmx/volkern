export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { GemmaService } from '@/lib/gemma/gemma-service';

/**
 * POST /api/gemma/suggestions/[id]/execute - Ejecutar acción sugerida
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const { actionId, operatorNote } = body;

    if (!actionId || !operatorNote) {
      return NextResponse.json({ error: 'Firma de operador requerida (nota)' }, { status: 400 });
    }

    const result = await GemmaService.executeAction(
      id,
      actionId,
      auth.user!.id,
      operatorNote
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error executing Gemma action:', error);
    return NextResponse.json({ error: 'Error al ejecutar acción' }, { status: 500 });
  }
});
