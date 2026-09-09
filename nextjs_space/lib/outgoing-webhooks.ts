
/**
 * Sistema de Webhooks Salientes (Outgoing Webhooks)
 * 
 * Similar a Chatwoot: cuando ocurre un evento en Volkern CRM,
 * se envía automáticamente una notificación HTTP a URLs externas configuradas.
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { AuditService } from '@/lib/audit-service';
import type { WebhookEvent } from '@/lib/webhook-events';

export type { WebhookEvent } from '@/lib/webhook-events';
export { getAvailableEvents } from '@/lib/webhook-events';

// Interface para el payload del webhook
export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  tenant_id: string;
  data: any;
  metadata?: Record<string, any>;
}

/**
 * Dispara webhooks para un evento específico
 */
export async function dispatchWebhook(
  tenantId: string,
  evento: WebhookEvent,
  data: any,
  entidadTipo?: string,
  entidadId?: string
) {
  try {
    // Buscar todos los webhooks activos del tenant que estén suscritos a este evento
    const webhooks = await prisma.outgoingWebhook.findMany({
      where: {
        tenantId,
        activo: true,
      },
    });

    // Filtrar webhooks que tengan este evento en su lista de eventos
    const webhooksInteresados = webhooks.filter((webhook) => {
      const eventos = (webhook.eventos as any) || [];
      return Array.isArray(eventos) && eventos.includes(evento);
    });

    if (webhooksInteresados.length === 0) {
      console.log(`[Webhook] No hay webhooks activos para el evento: ${evento}`);
      return;
    }

    console.log(
      `[Webhook] Disparando ${webhooksInteresados.length} webhook(s) para evento: ${evento}`
    );

    // Registrar en audit chain que se despacharon webhooks
    try {
      await AuditService.log({
        tenantId,
        userId: 'system',
        action: 'WEBHOOK_DISPATCHED',
        entity: entidadTipo || 'Webhook',
        entityId: entidadId || 'batch',
        description: `📡 Webhook: ${evento} → ${webhooksInteresados.length} endpoint(s) (${webhooksInteresados.map(w => w.url).join(', ')})`,
        metadata: {
          event: evento,
          webhookCount: webhooksInteresados.length,
          targets: webhooksInteresados.map(w => ({ id: w.id, url: w.url, method: w.metodoHttp })),
          dataKeys: data ? Object.keys(data) : [],
        },
      });
    } catch (auditError) {
      console.error('[Webhook] Error al registrar audit log de dispatch:', auditError);
    }

    // Enviar webhooks en paralelo
    const promises = webhooksInteresados.map((webhook) =>
      enviarWebhook(webhook.id, evento, data, entidadTipo, entidadId)
    );

    await Promise.allSettled(promises);
  } catch (error: any) {
    console.error('[Webhook] Error al despachar webhooks:', error);
  }
}

/**
 * Envía un webhook individual
 */
async function enviarWebhook(
  webhookId: string,
  evento: WebhookEvent,
  data: any,
  entidadTipo?: string,
  entidadId?: string
) {
  const webhook = await prisma.outgoingWebhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    console.error(`[Webhook] Webhook no encontrado: ${webhookId}`);
    return;
  }

  // Construir el payload
  const payload: WebhookPayload = {
    event: evento,
    timestamp: new Date().toISOString(),
    tenant_id: webhook.tenantId,
    data,
  };

  // Preparar headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Volkern-CRM-Webhook/1.0',
    'X-Webhook-Event': evento,
    'X-Webhook-Timestamp': payload.timestamp,
  };

  // Añadir headers personalizados
  if (webhook.headers) {
    const customHeaders = webhook.headers as Record<string, string>;
    Object.assign(headers, customHeaders);
  }

  // Firma HMAC si hay secretKey
  if (webhook.secretKey) {
    const signature = generateHmacSignature(
      JSON.stringify(payload),
      webhook.secretKey
    );
    headers['X-Webhook-Signature'] = signature;
  }

  const startTime = Date.now();
  let delivery: any;

  try {
    // Crear registro de delivery
    delivery = await prisma.outgoingWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        tenantId: webhook.tenantId,
        evento,
        payload: payload as any,
        headers: headers as any,
        entidadTipo,
        entidadId,
        estado: 'reintentando',
        intentos: 1,
        fechaEnvio: new Date(),
        ultimoIntento: new Date(),
      },
    });

    // Enviar el webhook
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      webhook.timeoutSegundos * 1000
    );

    const response = await fetch(webhook.url, {
      method: webhook.metodoHttp,
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const tiempoRespuesta = Date.now() - startTime;
    const respuestaText = await response.text();
    let respuestaJson: any;

    try {
      respuestaJson = JSON.parse(respuestaText);
    } catch {
      respuestaJson = { raw: respuestaText };
    }

    // Actualizar el delivery con la respuesta
    const esExitoso = response.status >= 200 && response.status < 300;

    await prisma.outgoingWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        estado: esExitoso ? 'exitoso' : 'fallido',
        estadoHttp: response.status,
        respuesta: respuestaJson as any,
        tiempoRespuesta,
        errorMensaje: esExitoso
          ? null
          : `HTTP ${response.status}: ${respuestaText.substring(0, 500)}`,
      },
    });

    // Actualizar estadísticas del webhook
    await prisma.outgoingWebhook.update({
      where: { id: webhook.id },
      data: {
        totalEnviados: { increment: 1 },
        totalExitosos: esExitoso ? { increment: 1 } : undefined,
        totalFallidos: esExitoso ? undefined : { increment: 1 },
        ultimoEnvio: new Date(),
      },
    });

    // Registrar en audit chain
    try {
      await AuditService.log({
        tenantId: webhook.tenantId,
        userId: 'system',
        action: esExitoso ? 'WEBHOOK_DELIVERED' : 'WEBHOOK_FAILED',
        entity: 'OutgoingWebhook',
        entityId: webhook.id,
        description: `${esExitoso ? '✅' : '❌'} Webhook ${evento} → ${webhook.url} [HTTP ${response.status}]`,
        metadata: {
          event: evento,
          status: response.status,
          responseTime: tiempoRespuesta,
          hasSignature: !!webhook.secretKey,
          deliveryId: delivery?.id,
          entidadTipo,
          entidadId,
        },
      });
    } catch (auditError) {
      console.error('[Webhook] Error al registrar audit log de delivery:', auditError);
    }

    console.log(
      `[Webhook] Enviado (${response.status}) a ${webhook.url} en ${tiempoRespuesta}ms`
    );

    // Si falló y hay reintentos disponibles, programar reintento
    if (!esExitoso && delivery.intentos < webhook.maxReintentos) {
      await programarReintento(delivery.id, delivery.intentos + 1);
    }
  } catch (error: any) {
    const tiempoRespuesta = Date.now() - startTime;
    const errorMensaje = error.message || 'Error desconocido';

    console.error(`[Webhook] Error al enviar a ${webhook.url}:`, errorMensaje);

    // Actualizar delivery con error
    if (delivery) {
      await prisma.outgoingWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          estado: 'fallido',
          errorMensaje: errorMensaje.substring(0, 1000),
          tiempoRespuesta,
        },
      });

      // Actualizar estadísticas
      await prisma.outgoingWebhook.update({
        where: { id: webhook.id },
        data: {
          totalEnviados: { increment: 1 },
          totalFallidos: { increment: 1 },
          ultimoEnvio: new Date(),
        },
      });

      // Programar reintento si corresponde
      if (delivery.intentos < webhook.maxReintentos) {
        await programarReintento(delivery.id, delivery.intentos + 1);
      }
    }
  }
}

/**
 * Programa un reintento de webhook
 */
async function programarReintento(deliveryId: string, intento: number) {
  // Retraso exponencial: 2^(intento-1) minutos
  const minutos = Math.pow(2, intento - 1);
  const proximoIntento = new Date(Date.now() + minutos * 60 * 1000);

  await prisma.outgoingWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      intentos: intento,
      proximoIntento,
      estado: 'reintentando',
    },
  });

  console.log(
    `[Webhook] Reintento #${intento} programado para ${proximoIntento.toISOString()}`
  );
}

/**
 * Genera una firma HMAC para el payload
 */
function generateHmacSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Verifica una firma HMAC
 */
export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateHmacSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
