/**
 * Chatwoot Webhook Endpoint
 * /api/integrations/webhook/chatwoot
 * 
 * Recibe webhooks de Chatwoot (conversaciones, mensajes, contactos)
 * 
 * Headers:
 * - X-Chatwoot-Signature: HMAC SHA256 signature (opcional, para producción)
 * - X-Tenant-Id: Tenant ID (para múltiples tenants)
 * 
 * Body según evento:
 * - conversation.created
 * - message.created
 * - contact.created
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWebhook } from '@/lib/integrations/integration-handler';
import { prisma } from '@/lib/db';
import * as crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Secret para validar firma (configurable por tenant)
const WEBHOOK_SECRET = process.env.CHATWOOT_WEBHOOK_SECRET;

/**
 * Validar firma del webhook
 */
function verifyChatwootSignature(body: string, signature: string | null): boolean {
  if (!signature || !WEBHOOK_SECRET) {
    // En desarrollo, permitir sin firma
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Verificar idempotencia del mensaje
 */
const messageIdCache = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 60000; // 1 minuto

function isIdempotent(messageId: string): boolean {
  const now = Date.now();
  const cached = messageIdCache.get(messageId);
  
  if (cached && now - cached < IDEMPOTENCY_TTL_MS) {
    return true; // Ya procesado recientemente
  }
  
  messageIdCache.set(messageId, now);
  
  // Limpiar entradas antiguas
  if (messageIdCache.size > 1000) {
    const keysToDelete: string[] = [];
    messageIdCache.forEach((ts, key) => {
      if (now - ts > IDEMPOTENCY_TTL_MS) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => messageIdCache.delete(key));
  }
  
  return false;
}

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

    // 🔐 Validar firma del webhook (producción)
    const signature = request.headers.get('x-chatwoot-signature') || 
                      request.headers.get('X-Chatwoot-Signature');
    
    if (!verifyChatwootSignature(rawBody, signature)) {
      console.error('[ChatwootWebhook] Firma inválida');
      return NextResponse.json(
        { error: 'Firma de webhook inválida' },
        { status: 401 }
      );
    }

    // 🔄 Verificar idempotencia para message.created
    if (data.event === 'message_created') {
      const messageId = String(data.message?.id || data.id);
      if (messageId && isIdempotent(messageId)) {
        console.log(`[ChatwootWebhook] Mensaje idempotente: ${messageId}`);
        return NextResponse.json({ ok: true, idempotent: true });
      }
    }

// Extraer evento de Chatwoot
    const event = (data.event as string);
    if (!event) {
      return NextResponse.json(
        { error: 'Campo "event" es requerido' },
        { status: 400 }
      );
    }

    // 🔑 Extraer account_id de Chatwoot (IDENTIFICADOR PRINCIPAL)
    const accountData = data.account as Record<string, unknown> | undefined;
    const chatwootAccountId = accountData?.id as number | undefined;

    if (!chatwootAccountId) {
      return NextResponse.json(
        { error: 'account_id es requerido para identificar el tenant' },
        { status: 400 }
      );
    }

    // 🧠 Mapear account_id → tenant (aislamiento real)
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { configuracion: { path: ['chatwootAccountId'], equals: chatwootAccountId } },
          { metadata: { path: ['chatwootAccountId'], equals: chatwootAccountId } }
        ]
      },
      include: {
        integrations: {
          where: { tipo: 'chatwoot', activo: true },
          select: { credenciales: true }
        }
      }
    });

    // Si no encuentra por configuración, buscar en integrations
    let tenantId: string | null = tenant?.id || null;
    let chatwootApiKey: string | null = null;

    if (!tenantId) {
      // Buscar por inbox_id como fallback
      const inboxData = data.inbox as Record<string, unknown> | undefined;
      const inboxId = inboxData?.id || data.inbox_id;
      
      if (inboxId) {
        const integration = await prisma.integration.findFirst({
          where: {
            tipo: 'chatwoot',
            activo: true,
            credenciales: { path: ['inbox_id'], equals: String(inboxId) }
          },
          select: { tenantId: true, credenciales: true }
        });
        
        if (integration) {
          tenantId = integration.tenantId;
          const cred = integration.credenciales as any;
          chatwootApiKey = cred?.apiToken || cred?.accessToken;
        }
      }
    } else if (tenant?.integrations?.[0]) {
      const cred = tenant.integrations[0].credenciales as any;
      chatwootApiKey = cred?.apiToken || cred?.accessToken;
    }

    if (!tenantId) {
      console.error(`[ChatwootWebhook] No se encontró tenant para account_id: ${chatwootAccountId}`);
      return NextResponse.json(
        { error: 'Tenant no encontrado para este account_id' },
        { status: 404 }
      );
    }

    // 🔐 SEGURIDAD: Verificar aislamiento por account
    const expectedAccountId = (tenant?.configuracion as any)?.chatwootAccountId || 
                               (tenant?.metadata as any)?.chatwootAccountId;
    
    if (expectedAccountId && expectedAccountId !== chatwootAccountId) {
      console.error(`[ChatwootWebhook] Cross-tenant attempt! account_id mismatch`);
      return NextResponse.json(
        { error: 'Account ID no coincide con el tenant' },
        { status: 403 }
      );
    }

    console.log(`[ChatwootWebhook] Procesando evento ${event} para tenant ${tenantId} (account ${chatwootAccountId})`);

    // ✅ Procesar webhook con tenant identificado por account_id
    return processWebhook(request, rawBody, data, event, tenantId, chatwootApiKey);
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
  tenantId: string,
  chatwootApiKey?: string | null
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

  // Buscar secret de Chatwoot (si no se pasó como参数)
  const integration = await prisma.integration.findFirst({
    where: {
      tenantId,
      tipo: 'chatwoot',
      activo: true,
    },
    select: { credenciales: true },
  });

  const webhookSecret = (integration?.credenciales as Record<string, unknown>)?.webhookSecret as string | undefined;
  const apiKey = chatwootApiKey || (integration?.credenciales as Record<string, unknown>)?.apiToken as string;

  // Procesar
  const result = await handleIncomingWebhook('chatwoot', event, data, tenantId, {
    signature: signature || undefined,
    rawBody,
    webhookSecret,
    apiAccessToken: apiKey,
  });

  return NextResponse.json({
    success: result.success,
    processed: result.processed,
    skillExecuted: result.skillExecuted,
    eventEmitted: result.eventEmitted,
    error: result.error,
  });
}
