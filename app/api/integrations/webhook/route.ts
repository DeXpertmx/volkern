/**
 * Volkern Integration Webhook Endpoint
 * Punto de entrada centralizado para webhooks externos
 * 
 * URL: /api/integrations/webhook
 * 
 * Query params:
 * - type: Tipo de integración (n8n, chatwoot, calcom, evolution, whatsapp, telegram, generic)
 * - event: Nombre del evento
 * - tenantId: ID del tenant (requerido)
 * 
 * Headers:
 * - X-Webhook-Signature: Firma HMAC para validación (opcional)
 * - X-Tenant-Id: ID del tenant (alternativa a query param)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleIncomingWebhook,
  listIntegrations,
  getIntegrationDocs,
  IntegrationType,
} from '@/lib/integrations/integration-handler';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ============== GET - Documentación ==============

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as IntegrationType | null;

  if (type) {
    const docs = getIntegrationDocs(type);
    if (!docs) {
      return NextResponse.json(
        { error: `Integración "${type}" no encontrada` },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      integration: docs,
    });
  }

  // Lista todas las integraciones
  const integrations = listIntegrations();
  
  return NextResponse.json({
    success: true,
    description: 'Volkern Integration Webhook API',
    usage: {
      endpoint: '/api/integrations/webhook',
      method: 'POST',
      queryParams: {
        type: 'Tipo de integración (requerido)',
        event: 'Nombre del evento (requerido)',
        tenantId: 'ID del tenant (requerido)',
      },
      headers: {
        'X-Webhook-Signature': 'Firma HMAC para validación (opcional)',
        'X-Tenant-Id': 'ID del tenant (alternativa a query param)',
      },
    },
    integrations,
  });
}

// ============== POST - Recibir Webhook ==============

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 1. Extraer parámetros
    const type = searchParams.get('type') as IntegrationType;
    const event = searchParams.get('event');
    const tenantId = searchParams.get('tenantId') || 
                     request.headers.get('X-Tenant-Id') ||
                     request.headers.get('x-tenant-id');
    const signature = request.headers.get('X-Webhook-Signature') || 
                      request.headers.get('x-webhook-signature') ||
                      request.headers.get('X-Hub-Signature-256'); // WhatsApp/Meta

    // 2. Validaciones básicas
    if (!type) {
      return NextResponse.json(
        { error: 'Parámetro "type" es requerido' },
        { status: 400 }
      );
    }

    if (!event) {
      return NextResponse.json(
        { error: 'Parámetro "event" es requerido' },
        { status: 400 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Parámetro "tenantId" es requerido (query param o header X-Tenant-Id)' },
        { status: 400 }
      );
    }

    // 3. Verificar que el tenant existe
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, nombre: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { status: 404 }
      );
    }

    // 4. Parsear body
    const rawBody = await request.text();
    let data: Record<string, unknown>;
    
    try {
      data = JSON.parse(rawBody);
    } catch {
      // Si no es JSON, tratar como form data o raw
      data = { raw: rawBody };
    }

    // 5. Buscar webhook secret si existe
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId,
        tipo: type,
        activo: true,
      },
      select: {
        credenciales: true,
      },
    });

    const webhookSecret = (integration?.credenciales as Record<string, unknown>)?.webhookSecret as string | undefined;

    // 6. Procesar webhook
    const result = await handleIncomingWebhook(type, event, data, tenantId, {
      signature: signature || undefined,
      rawBody,
      webhookSecret,
    });

    // 7. Respuesta
    if (result.success) {
      return NextResponse.json({
        message: result.processed 
          ? `Webhook procesado exitosamente` 
          : `Webhook recibido pero no procesado (evento no mapeado)`,
        ...result,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Webhook API] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ============== Webhooks Específicos por Ruta ==============

// Estos son endpoints alternativos para integraciones que no permiten query params
// Se manejan en rutas separadas como:
// /api/integrations/webhook/n8n/route.ts
// /api/integrations/webhook/chatwoot/route.ts
// etc.
