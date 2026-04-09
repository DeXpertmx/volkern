/**
 * n8n Webhook Endpoint
 * /api/integrations/webhook/n8n
 * 
 * Recibe webhooks de n8n workflows completados o fallidos
 * 
 * Body esperado:
 * {
 *   "event": "workflow.completed" | "workflow.failed",
 *   "workflowId": "...",
 *   "workflowName": "...",
 *   "executionId": "...",
 *   "tenantId": "...",
 *   "result": {...} | "error": "..."
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWebhook } from '@/lib/integrations/integration-handler';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Leer body
    const rawBody = await request.text();
    let data: Record<string, unknown>;
    
    try {
      data = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Body debe ser JSON válido' },
        { status: 400 }
      );
    }

    // Extraer campos
    const event = (data.event as string) || 'workflow.completed';
    const tenantId = (data.tenantId as string) || 
                     request.headers.get('X-Tenant-Id') ||
                     request.headers.get('x-tenant-id');
    const signature = request.headers.get('X-Webhook-Signature') ||
                      request.headers.get('x-n8n-signature');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId es requerido (en body o header X-Tenant-Id)' },
        { status: 400 }
      );
    }

    // Verificar tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404 }
      );
    }

    // Buscar secret de n8n
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId,
        tipo: 'n8n',
        activo: true,
      },
      select: { credenciales: true },
    });

    const webhookSecret = (integration?.credenciales as Record<string, unknown>)?.webhookSecret as string | undefined;

    // Procesar
    const result = await handleIncomingWebhook('n8n', event, data, tenantId, {
      signature: signature || undefined,
      rawBody,
      webhookSecret,
    });

    return NextResponse.json({
      success: result.success,
      processed: result.processed,
      eventEmitted: result.eventEmitted,
      error: result.error,
    });
  } catch (error) {
    console.error('[n8n Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
