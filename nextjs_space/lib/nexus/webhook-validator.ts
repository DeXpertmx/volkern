import { prisma } from '@/lib/core/db';
import crypto from 'crypto';

/**
 * Valida la firma HMAC de un webhook entrante desde el Hub (Chatwoot).
 * 
 * Identificación del tenant:
 * 1. Por `payload.tenant_id` (webhooks personalizados)
 * 2. Por `payload.account.id` → lookup en MessagingHubConfig.chatwootAccountId (Chatwoot nativo)
 */
export async function validateWebhookSignature(
    signature: string,
    payload: any
): Promise<{ tenantId: string; webhookSecret: string } | null> {
    // Intentar obtener tenantId del payload o identificar por account.id de Chatwoot
    let tenantId = payload.tenant_id;
    let config: { tenantId: string; webhookSecret: string } | null = null;

    if (tenantId) {
        // Path 1: tenant_id explícito en el payload
        config = await (prisma as any).messagingHubConfig.findUnique({
            where: { tenantId, isActive: true },
            select: { tenantId: true, webhookSecret: true }
        });
    } else if (payload.account?.id) {
        // Path 2: Chatwoot envía account.id → buscar tenant por chatwootAccountId
        const chatwootAccountId = Number(payload.account.id);
        if (!isNaN(chatwootAccountId)) {
            config = await (prisma as any).messagingHubConfig.findFirst({
                where: { chatwootAccountId, isActive: true },
                select: { tenantId: true, webhookSecret: true }
            });
            if (config) {
                tenantId = config.tenantId;
                console.log(`[Nexus Validator] Tenant identificado por Chatwoot account ${chatwootAccountId}: ${tenantId}`);
            }
        }
    }

    if (!tenantId) {
        console.error('[Nexus Validator] No tenantId found in payload (tried tenant_id and account.id)');
        return null;
    }

    if (!config) {
        console.error(`[Nexus Validator] No active config found for tenant ${tenantId}`);
        return null;
    }

    // Validación HMAC SHA256
    // Se asocia el secret configurado para el tenant
    const hmac = crypto.createHmac('sha256', config.webhookSecret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');

    // Comparación segura para evitar ataques de tiempo
    try {
        if (crypto.timingSafeEqual(Buffer.from(signature as any), Buffer.from(expectedSignature as any))) {
            return config;
        }
    } catch (e) {
        // Si las longitudes difieren, timingSafeEqual lanza error
    }

    console.error(`[Nexus Validator] Invalid signature for tenant ${tenantId}`);
    return null;
}
