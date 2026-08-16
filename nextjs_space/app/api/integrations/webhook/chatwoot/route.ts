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

/**
 * Validar firma del webhook de Chatwoot con el secret del tenant.
 * Chatwoot firma: X-Chatwoot-Signature: sha256=HMAC(secret, "{ts}.{body}")
 * con X-Chatwoot-Timestamp en el header. El secret es el del webhook de
 * cuenta, guardado en messagingHubConfig.webhookSecret al provisionar.
 */
function verifyChatwootSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  secret: string | null
): boolean {
  if (!secret || !signature || !timestamp) {
    // Sin secret no hay nada que validar (ej. en desarrollo local)
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    return false;
  }

  // Formato de Chatwoot: sha256=<hex> sobre "ts.body"
  const normalized = signature.replace(/^sha256=/, '');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(normalized),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
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
    // Asegurar que el chatbot (Gemma) escucha en ESTE bundle/process antes de
    // procesar el mensaje (el registro es idempotente). En Next.js standalone,
    // el listener de instrumentation.ts puede vivir en otra instancia del
    // event bus (bundles separados) y nunca recibiría los eventos.
    try {
      const { initGemmaChatbot } = await import('@/lib/agents/chatwoot-chatbot-handler');
      initGemmaChatbot();
    } catch (gemmaInitErr) {
      console.error('[ChatwootWebhook] Error inicializando Gemma chatbot:', gemmaInitErr);
    }

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

    // 🔐 Extraer account_id ANTES de validar la firma: el secret del webhook
    // se guarda por canal (config.chatwootWebhookSecret) o, como fallback, en
    // messagingHubConfig.webhookSecret (flujo Telegram).
    const accountData = data.account as Record<string, unknown> | undefined;
    const inboxData = data.inbox as Record<string, unknown> | undefined;
    const chatwootAccountId = accountData?.id as number | undefined;
    const chatwootInboxId = inboxData?.id as number | undefined;
    let webhookSecret: string | null = null;

    // 1. Secret específico del canal (puente WhatsApp/Evolution)
    if (chatwootInboxId) {
      const channel = await prisma.channel.findFirst({
        where: { chatwootInboxId },
        select: { config: true },
      });
      const channelSecret = (channel?.config as any)?.chatwootWebhookSecret;
      if (channelSecret) webhookSecret = channelSecret;
    }

    // 2. Fallback: hub config del account
    if (!webhookSecret && chatwootAccountId) {
      const hub = await prisma.messagingHubConfig.findFirst({
        where: { chatwootAccountId },
        select: { webhookSecret: true },
      });
      webhookSecret = hub?.webhookSecret || null;
    }

    // 🔐 Validar firma del webhook (producción)
    const signature = request.headers.get('x-chatwoot-signature') || 
                      request.headers.get('X-Chatwoot-Signature');
    const timestamp = request.headers.get('x-chatwoot-timestamp') ||
                      request.headers.get('X-Chatwoot-Timestamp');

    if (!verifyChatwootSignature(rawBody, signature, timestamp, webhookSecret)) {
      console.error('[ChatwootWebhook] Firma inválida');
      return NextResponse.json(
        { error: 'Firma de webhook inválida' },
        { status: 401 }
      );
    }

    // 🔄 Verificar idempotencia para message.created
    if (data.event === 'message_created') {
      const messageId = String((data as any).message?.id || data.id);
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

    if (!chatwootAccountId) {
      return NextResponse.json(
        { error: 'account_id es requerido para identificar el tenant' },
        { status: 400 }
      );
    }

    // 🧠 Mapear account_id → tenant (aislamiento real)
    // El modelo Tenant solo tiene `configuracion` (no `metadata`); si el path
    // query falla (schema antiguo), se usa el fallback por hubConfig más abajo.
    let tenant: { id: string; configuracion?: any; integrations?: any[] } | null = null;
    try {
      tenant = await prisma.tenant.findFirst({
        where: {
          configuracion: { path: ['chatwootAccountId'], equals: chatwootAccountId },
        } as any,
        include: {
          integrations: {
            where: { tipo: 'chatwoot', activo: true },
            select: { credenciales: true }
          }
        } as any
      });
    } catch (tenantLookupError) {
      console.warn('[ChatwootWebhook] Lookup por configuracion falló, usando hubConfig:', tenantLookupError instanceof Error ? tenantLookupError.message : tenantLookupError);
    }

    // Si no encuentra por configuración, buscar en integrations
    let tenantId: string | null = tenant?.id || null;
    let chatwootApiKey: string | null = null;

    if (!tenantId) {
      // 🆕 Fallback principal: el provisioning actual (onboarding Telegram,
      // WhatsApp Evolution) guarda chatwootAccountId en messagingHubConfig.
      const hubConfig = await prisma.messagingHubConfig.findFirst({
        where: { chatwootAccountId },
        select: { tenantId: true, webhookSecret: true },
      });
      if (hubConfig) {
        tenantId = hubConfig.tenantId;
      }
    }

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
    } else if ((tenant as any)?.integrations?.[0]) {
      const cred = (tenant as any).integrations[0].credenciales as any;
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
    const expectedAccountId = ((tenant as any)?.configuracion as any)?.chatwootAccountId || 
                               ((tenant as any)?.metadata as any)?.chatwootAccountId;
    
    if (expectedAccountId && expectedAccountId !== chatwootAccountId) {
      console.error(`[ChatwootWebhook] Cross-tenant attempt! account_id mismatch`);
      return NextResponse.json(
        { error: 'Account ID no coincide con el tenant' },
        { status: 403 }
      );
    }

    console.log(`[ChatwootWebhook] Procesando evento ${event} para tenant ${tenantId} (account ${chatwootAccountId})`);

    // 🔄 PUENTE SALIENTE: si el agente respondió en Chatwoot (message_created
    // outgoing de un usuario/agente, no del contacto), reenviar a WhatsApp por
    // la instancia Evolution vinculada al canal.
    if (event === 'message_created') {
      // Chatwoot envía message_created con los campos del mensaje PLANOS a
      // nivel superior (message_type, content, content_attributes, sender,
      // id...) y SIN objeto `message` anidado. Algunas fuentes (tests,
      // versiones previas) sí lo anidan. Se unifican ambos formatos: el
      // anidado tiene prioridad sobre el plano.
      const dataAny = data as any;
      const message = { ...dataAny, ...((dataAny.message as Record<string, any>) || {}) };
      const inbox = dataAny.inbox as Record<string, any> | undefined;
      const conversation = dataAny.conversation as Record<string, any> | undefined;
      const senderType = message.sender_type || message.sender?.type || '';
      const isOutgoing = String(message.message_type) === 'outgoing' ||
        String(message.message_type) === '1' ||
        (senderType && senderType.toLowerCase() !== 'contact');
      const content = message.content || '';
      const inboxId = inbox?.id || dataAny.inbox_id;
      const contentAttributes = (message.content_attributes as Record<string, any>) || {};
      const volkernOrigin = contentAttributes.volkernOrigin;

      // 🔁 Espejo creado por el webhook de Evolution (el mensaje YA está en
      // WhatsApp y en la bandeja local): omitirlo por completo. Si se procesara,
      // el puente saliente reenviaría el mensaje a Evolution y entraría en un
      // bucle infinito (Chatwoot → webhook → Evolution → eco → Chatwoot...).
      // También se omiten las notas privadas de "no entregable" creadas por
      // el propio puente (volkernOrigin 'undeliverable-note').
      if (volkernOrigin === 'evolution-bridge' || volkernOrigin === 'undeliverable-note') {
        console.log('[ChatwootWebhook] Espejo del puente Evolution/nota interna, omitido:', content.substring(0, 40));
        return NextResponse.json({ ok: true, skipped: volkernOrigin });
      }

      // Respuesta del chatbot: se reenvía a WhatsApp por el puente saliente
      // (abajo), pero NO se re-sincroniza al CRM (el chatbot ya guardó el
      // mensaje localmente con sendResponseToChatwoot).
      const isChatbotOrigin = volkernOrigin === 'chatbot';

      // Las notas privadas de los agentes no deben salir por WhatsApp.
      if (isOutgoing && !message.private && content && inboxId) {
        // Log estructurado del puente saliente para auditar entregas
        // (éxitos y fallos): destino, messageId y latencia por reenvío.
        const bridgeStartedAt = Date.now();
        const bridgeMeta = {
          evento: 'whatsapp_bridge_saliente',
          tenantId,
          conversationId: conversation?.id || null,
          inboxId: Number(inboxId),
          timestamp: new Date().toISOString(),
        };
        try {
          const channel = await prisma.channel.findFirst({
            where: { tenantId, chatwootInboxId: Number(inboxId) },
          });

          if (channel && (channel.type === 'whatsapp' || channel.type === 'whatsapp_evolution')) {
            const channelConfig = (channel.config as any) || {};
            const instanceName = channelConfig.instanceName;
            // Número del cliente: del contacto de la conversación de Chatwoot
            const phoneNumber = conversation?.contact?.phone_number ||
              conversation?.meta?.sender?.phone_number || '';

            if (instanceName && phoneNumber) {
              const { sendMessageWithUserInstance } = await import('@/lib/evolution-instances');
              const sendResult = await sendMessageWithUserInstance(
                instanceName,
                phoneNumber,
                content,
              );
              const logEntry = {
                ...bridgeMeta,
                destino: phoneNumber,
                instanceName,
                channelId: channel.id,
                messageId: sendResult.messageId || null,
                latencyMs: Date.now() - bridgeStartedAt,
                success: sendResult.success,
                status: sendResult.status || null,
                error: sendResult.error || null,
              };
              if (sendResult.success) {
                console.log(`[ChatwootWebhook] ✅ Reenvío a WhatsApp OK: ${JSON.stringify(logEntry)}`);
              } else {
                console.error(`[ChatwootWebhook] ❌ Reenvío a WhatsApp FALLÓ: ${JSON.stringify(logEntry)}`);
                // 🔴 Evolution 400 = el número no existe en WhatsApp: marcar la
                // conversación en el hub como no entregable y notificar al
                // agente (label + nota privada) en vez de silenciar el fallo.
                if (sendResult.status === 400 && conversation?.id && chatwootAccountId) {
                  await markConversationUndeliverable({
                    tenantId,
                    chatwootAccountId,
                    conversationId: Number(conversation.id),
                    channelConfig,
                    instanceName,
                    phoneNumber,
                    contactName: conversation?.contact?.name || null,
                    failedContent: content,
                  });
                }
              }
            } else {
              console.warn(`[ChatwootWebhook] Sin instanceName o número para reenviar: ${JSON.stringify({
                ...bridgeMeta,
                instanceName: instanceName || null,
                destino: phoneNumber || null,
              })}`);
            }
          } else {
            console.warn(`[ChatwootWebhook] Canal no encontrado o no es WhatsApp para inbox ${inboxId}: ${JSON.stringify({
              ...bridgeMeta,
              channelType: channel?.type || null,
            })}`);
          }
        } catch (bridgeError) {
          console.error(`[ChatwootWebhook] Error en puente saliente WhatsApp: ${JSON.stringify({
            ...bridgeMeta,
            error: bridgeError instanceof Error ? bridgeError.message : String(bridgeError),
            latencyMs: Date.now() - bridgeStartedAt,
          })}`);
        }
      }

      if (isChatbotOrigin) {
        console.log('[ChatwootWebhook] Respuesta del chatbot (ya entregada por el puente), omitiendo sync local');
        return NextResponse.json({ ok: true, skipped: 'chatbot' });
      }
    }

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
  } as any);

  return NextResponse.json({
    success: result.success,
    processed: result.processed,
    skillExecuted: result.skillExecuted,
    eventEmitted: result.eventEmitted,
    error: result.error,
  } as any);
}

// ========== CONVERSACIONES NO ENTREGABLES ==========

// Dedupe en memoria por conversación: evita repetir el label + nota privada
// en cada reintento del webhook o en mensajes posteriores del mismo hilo.
const undeliverableCache = new Map<string, number>();
const UNDELIVERABLE_TTL_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Marca una conversación del hub como NO entregable por WhatsApp cuando
 * Evolution responde 400 (número inexistente) al reenviar la respuesta del
 * agente: añade el label "no-entregable" y crea una nota privada para que el
 * agente asignado la vea en el timeline y contacte por otro canal.
 */
async function markConversationUndeliverable(opts: {
  tenantId: string;
  chatwootAccountId: number;
  conversationId: number;
  channelConfig: Record<string, any>;
  instanceName?: string;
  phoneNumber?: string;
  contactName?: string | null;
  failedContent: string;
}): Promise<void> {
  const {
    tenantId,
    chatwootAccountId,
    conversationId,
    channelConfig,
    instanceName,
    phoneNumber,
    contactName,
    failedContent,
  } = opts;

  // Ya marcada recientemente → no repetir nota, label ni registro.
  const cacheKey = `${chatwootAccountId}:${conversationId}`;
  const now = Date.now();
  const last = undeliverableCache.get(cacheKey);
  if (last && now - last < UNDELIVERABLE_TTL_MS) return;
  undeliverableCache.set(cacheKey, now);

  // 🔎 Buscar el lead/contacto en el CRM por teléfono para ofrecer
  // alternativas de contacto (email, empresa, otro teléfono registrado)
  // directamente en la nota privada del hub, y para vincular la tarea de
  // seguimiento al registro correcto.
  const altLines: string[] = [];
  let matchedLeadId: string | null = null;
  let matchedContactId: string | null = null;
  let matchedEmail: string | null = null;
  let matchedEmpresa: string | null = null;
  const digits = (phoneNumber || '').replace(/[^\d]/g, '');
  if (digits.length >= 8) {
    const suffix = digits.slice(-9);
    try {
      const lead = await prisma.lead.findFirst({
        where: { tenantId, telefono: { endsWith: suffix } },
        select: { id: true, nombre: true, email: true, telefono: true, empresa: true },
      });
      const contact = !lead
        ? await prisma.contact.findFirst({
            where: { tenantId, telefono: { endsWith: suffix } },
            select: { id: true, nombre: true, email: true, telefono: true },
          })
        : null;
      if (lead) matchedLeadId = lead.id;
      if (contact) matchedContactId = contact.id;
      const rec: { nombre: string; email: string; telefono?: string | null; empresa?: string | null } | null = lead || contact;
      if (rec) {
        matchedEmail = rec.email || null;
        matchedEmpresa = rec.empresa || null;
        altLines.push(`👤 Contacto en CRM: ${rec.nombre}`);
        if (rec.empresa) altLines.push(`🏢 Empresa: ${rec.empresa}`);
        if (rec.email) altLines.push(`📧 Email: ${rec.email}`);
        const recDigits = (rec.telefono || '').replace(/[^\d]/g, '');
        if (recDigits && recDigits !== digits && rec.telefono) {
          altLines.push(`☎️ Teléfono alternativo registrado: ${rec.telefono}`);
        }
      } else {
        altLines.push('ℹ️ No se encontró ningún contacto en el CRM con este número.');
      }
    } catch (lookupErr) {
      console.error('[ChatwootWebhook] Error buscando lead por teléfono:', lookupErr);
    }
  }

  // Nota que verá el agente en el timeline del hub (con alternativas).
  const noteText =
    `⚠️ Mensaje NO entregado por WhatsApp: el número del cliente no existe o no está disponible en esta cuenta. Contacta por otro canal.\n\n` +
    (altLines.length ? `${altLines.join('\n')}\n\n` : '') +
    `Mensaje fallido: ${failedContent.substring(0, 200)}`;

  // Persistir el fallo para la vista de "No entregables" en Mi WhatsApp.
  try {
    await prisma.whatsAppDeliveryFailure.create({
      data: {
        tenantId,
        instanceName: instanceName || null,
        chatwootAccountId,
        chatwootConversationId: conversationId,
        contactoNombre: contactName || null,
        telefono: phoneNumber || null,
        emailContacto: matchedEmail,
        empresa: matchedEmpresa,
        mensajeFallido: failedContent.substring(0, 500),
        notaAgente: noteText,
        estado: 'pendiente',
      },
    });
  } catch (persistErr) {
    console.error('[ChatwootWebhook] Error persistiendo fallo de entrega:', persistErr);
  }

  // 📋 Tarea de seguimiento automática: asignada al agente dueño de la
  // instancia (el que conectó el número) para contactar por otro canal.
  try {
    const instanceOwner = await prisma.userWhatsAppInstance.findFirst({
      where: { instanceName: instanceName || '' },
      select: { userId: true },
    });
    const vencimiento = new Date();
    vencimiento.setDate(vencimiento.getDate() + 1);
    vencimiento.setHours(18, 0, 0, 0); // fin de jornada del día siguiente
    await prisma.task.create({
      data: {
        tenantId,
        ...(matchedLeadId ? { leadId: matchedLeadId } : {}),
        ...(matchedContactId ? { contactId: matchedContactId } : {}),
        tipo: 'seguimiento',
        titulo: `Contactar por otro canal: ${contactName || (phoneNumber || 'cliente sin identificar')}`,
        descripcion: `WhatsApp no pudo entregar el mensaje (número inexistente o no disponible). Contacta por email u otro teléfono.\n\n${noteText}`,
        fechaVencimiento: vencimiento,
        asignadoA: instanceOwner?.userId || null,
        completada: false,
      },
    });
    console.log(`[ChatwootWebhook] ✅ Tarea de seguimiento creada para conversación ${conversationId}`);
  } catch (taskErr) {
    console.error('[ChatwootWebhook] Error creando tarea de seguimiento:', taskErr);
  }

  // Token real de agente del canal (el del bot no puede crear salientes).
  const accountToken = channelConfig?.apiToken || '';
  if (!accountToken) {
    console.warn('[ChatwootWebhook] Sin token de agente para marcar conversación no entregable');
    return;
  }

  try {
    const { chatwootApi } = await import('@/lib/nexus/chatwoot-api');
    await chatwootApi.addLabels(chatwootAccountId, conversationId, ['no-entregable'], accountToken);
    await chatwootApi.sendMessage(
      chatwootAccountId,
      conversationId,
      noteText,
      accountToken,
      {
        messageType: 'outgoing',
        private: true,
        contentAttributes: { volkernOrigin: 'undeliverable-note' },
      }
    );
    console.log(`[ChatwootWebhook] ✅ Conversación ${conversationId} marcada como no entregable (label + nota privada)`);
  } catch (markErr) {
    console.error('[ChatwootWebhook] Error marcando conversación no entregable:', markErr);
  }
}
