import { prisma } from '@/lib/core/db';
import { NexusConfig } from '@/lib/nexus/types';

export enum MessagingStrategy {
    DIRECT = 'direct', // Volkern → Evolution/Twilio/Resend
    NEXUS = 'nexus',   // Volkern → Hub → Canal
}

export interface NexusFullConfig extends NexusConfig {
    chatwootAccountId?: number;
    telegramInboxId?: number;
    whatsappInboxId?: number;
}

export async function getMessagingStrategy(tenantId: string): Promise<MessagingStrategy> {
    try {
        // También verificar si el tenant tiene nexusEnabled
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { nexusEnabled: true }
        });

        if (!tenant?.nexusEnabled) {
            return MessagingStrategy.DIRECT;
        }

        const config = await prisma.messagingHubConfig.findFirst({
            where: {
                tenantId,
                isActive: true
            },
            select: { isActive: true, chatwootAccountId: true },
        });

        // Nexus activo solo si hay cuenta de Chatwoot configurada
        return config?.isActive && config?.chatwootAccountId 
            ? MessagingStrategy.NEXUS 
            : MessagingStrategy.DIRECT;
    } catch (error) {
        console.error('[MessagingStrategy] Error fetching strategy:', error);
        return MessagingStrategy.DIRECT;
    }
}

export async function getNexusConfig(tenantId: string): Promise<NexusFullConfig | null> {
    try {
        const config = await prisma.messagingHubConfig.findFirst({
            where: { tenantId, isActive: true },
        });

        if (!config) return null;

        // 🔐 Desencriptar token
        const { decrypt } = await import('@/lib/core/crypto');
        const apiToken = decrypt(config.hubApiToken);

        return {
            tenantId: config.tenantId,
            baseUrl: config.hubBaseUrl,
            apiToken: apiToken,
            accountId: config.hubAccountId ?? undefined,
            defaultEndpointId: config.defaultEndpointId ?? undefined,
            webhookSecret: config.webhookSecret,
            // Campos adicionales de Chatwoot
            chatwootAccountId: config.chatwootAccountId ?? undefined,
            telegramInboxId: config.telegramInboxId ?? undefined,
            whatsappInboxId: config.whatsappInboxId ?? undefined,
        };
    } catch (error) {
        console.error('[MessagingStrategy] Error fetching Nexus config:', error);
        return null;
    }
}

/**
 * Obtener el inbox ID correcto según el canal
 */
export async function getInboxIdForChannel(
    tenantId: string, 
    channel: 'telegram' | 'whatsapp'
): Promise<number | null> {
    const config = await getNexusConfig(tenantId);
    
    if (!config) return null;
    
    switch (channel) {
        case 'telegram':
            return config.telegramInboxId ?? null;
        case 'whatsapp':
            return config.whatsappInboxId ?? null;
        default:
            return null;
    }
}
