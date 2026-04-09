/**
 * Chatwoot Webhook Endpoint
 * /api/integrations/webhook/chatwoot
 * 
 * Recibe webhooks de Chatwoot (conversaciones, mensajes, contactos)
 * 
 * Headers:
 * - X-Chatwoot-Signature: HMAC signature
 * 
 * Body según evento:
 * - conversation.created
 * - message.created
 * - contact.created
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

    // Extraer evento de Chatwoot
    const event = (data.event as string);
    if (!event) {
      return NextResponse.json(
        { error: 'Campo "event" es requerido' },
        { status: 400 }
      );
    }

    // Extraer tenantId - Chatwoot puede enviarlo en custom_attributes o header
    const accountData = data.account as Record<string, unknown> | undefined;
    const tenantId = (accountData?.custom_attributes as Record<string, unknown>)?.tenantId as string ||
                     (data.custom_attributes as Record<string, unknown>)?.tenantId as string ||
                     request.headers.get('X-Tenant-Id') ||
                     request.headers.get('x-tenant-id');

    if (!tenantId) {
      // Intentar buscar por inbox_id si está configurado
      const inboxData = data.inbox as Record<string, unknown> | undefined;
      const inboxId = inboxData?.id || data.inbox_id;
      if (inboxId) {
        const integration = await prisma.integration.findFirst({
          where: {
            tipo: 'chatwoot',
            activo: true,
            credenciales: {
              path: ['inbox_id'],
              equals: String(inboxId),
            },
          },
          select: { tenantId: true },
        });
        
        if (integration) {
          // Procesar con el tenantId encontrado
          return processWebhook(request, rawBody, data, event, integration.tenantId);
        }
      }
      
      return NextResponse.json(
        { error: 'No se pudo determinar el tenantId' },
        { status: 400 }
      );
    }

    return processWebhook(request, rawBody, data, event, tenantId);
  } catch (error) {
    console.error('[Chatwoot Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

async function processWebhook(
  request: NextRequest,
  rawBody: string,
  data: Record<string, unknown>,
  event: string,
  tenantId: string
) {
  const signature = request.headers.get('X-Chatwoot-Signature') ||
                    request.headers.get('x-chatwoot-signature');

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

  // Buscar secret de Chatwoot
  const integration = await prisma.integration.findFirst({
    where: {
      tenantId,
      tipo: 'chatwoot',
      activo: true,
    },
    select: { credenciales: true },
  });

  const webhookSecret = (integration?.credenciales as Record<string, unknown>)?.webhookSecret as string | undefined;

  // Procesar
  const result = await handleIncomingWebhook('chatwoot', event, data, tenantId, {
    signature: signature || undefined,
    rawBody,
    webhookSecret,
  });

  return NextResponse.json({
    success: result.success,
    processed: result.processed,
    skillExecuted: result.skillExecuted,
    eventEmitted: result.eventEmitted,
    error: result.error,
  });
}
