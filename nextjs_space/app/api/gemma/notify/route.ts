export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { GemmaService } from '@/lib/gemma/gemma-service';

/**
 * POST /api/gemma/notify - Recibir sugerencia de Gemma (Internal Webhook)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, event, requestPayload, gemmaOutput } = body;
    console.log(`[GemmaAPI] Recibiendo notificación para tenant ${tenantId}, evento ${event}`);

    if (!tenantId || !gemmaOutput) {
      console.warn('[GemmaAPI] Datos insuficientes recibidos');
      return NextResponse.json({ error: 'Datos insuficientes' }, { status: 400 });
    }

    const response = await GemmaService.processGemmaResponse(
      tenantId,
      event,
      requestPayload,
      gemmaOutput
    );
    console.log(`[GemmaAPI] Notificación procesada con éxito: ${response.id}`);

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GemmaAPI] Error fatal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
