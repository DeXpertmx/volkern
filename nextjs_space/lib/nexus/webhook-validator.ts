import { prisma } from '@/lib/core/db';
import crypto from 'crypto';

/**
 * Valida la firma HMAC de un webhook entrante desde el Hub
 */
export async function validateWebhookSignature(
    signature: string,
    payload: any
): Promise<{ tenantId: string; webhookSecret: string } | null> {
    // El Hub debe proporcionar un identificador de tenant, ya sea en el payload o headers
    // Para Chatwoot/Nexus, asumimos que viene en el payload
    const tenantId = payload.tenant_id;

    if (!tenantId) {
        console.error('[Nexus Validator] No tenantId found in payload');
        return null;
    }

    const config = await (prisma as any).messagingHubConfig.findUnique({
        where: { tenantId, isActive: true },
        select: { tenantId: true, webhookSecret: true }
    });

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
