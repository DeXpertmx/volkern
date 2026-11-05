import { NexusAdapter } from '@/lib/nexus/adapter';
import { getMessagingStrategy, getNexusConfig, MessagingStrategy } from './strategy';
import { sendWhatsAppMessage, sendWhatsAppMessageWithMedia } from '@/lib/whatsapp';
import { sendEmail } from '@/lib/ses-email';
import { sendSMS } from '@/lib/sms';
import { loadTelegramCredentials, sendTelegramMessage } from '@/lib/telegram';
import { sendFacebookMessage, sendInstagramMessage } from '@/lib/meta-messenger';

export interface UnifiedMessagePayload {
    to: string;
    content: string;
    channel: 'whatsapp' | 'email' | 'sms' | 'telegram' | 'facebook' | 'instagram';
    metadata?: Record<string, any>;
}

export async function sendUnifiedMessage(
    tenantId: string,
    payload: UnifiedMessagePayload
) {
    const strategy = await getMessagingStrategy(tenantId);

    if (strategy === MessagingStrategy.NEXUS) {
        const nexusConfig = await getNexusConfig(tenantId);

        if (!nexusConfig) {
            // Fallback automático si la config está corrupta
            console.warn(`[Messaging] Nexus config not found for tenant ${tenantId}, falling back to DIRECT`);
            return await sendViaLegacy(tenantId, payload);
        }

        const adapter = new NexusAdapter(nexusConfig);

        // Mapear channel → endpointId (lógica configurable por tenant)
        const endpointId = payload.metadata?.endpointId || nexusConfig.defaultEndpointId;

        if (!endpointId) {
            throw new Error('No se encontró un canal configurado para enviar este mensaje');
        }

        return await adapter.sendMessage(endpointId, {
            to: payload.to,
            content: payload.content,
            metadata: {
                ...payload.metadata,
                channel: payload.channel,
                tenantId,
            },
        });
    }

    // Ruta legacy: delegar a tus integraciones existentes
    return await sendViaLegacy(tenantId, payload);
}

// Función helper para mantener tu lógica actual encapsulada
async function sendViaLegacy(tenantId: string, payload: UnifiedMessagePayload) {
    switch (payload.channel) {
        case 'whatsapp':
            if (payload.metadata?.mediaUrl) {
                return await sendWhatsAppMessageWithMedia(
                    payload.to,
                    payload.content,
                    payload.metadata.mediaUrl,
                    payload.metadata.mediaType || 'image',
                    tenantId
                );
            }
            return await sendWhatsAppMessage(payload.to, payload.content, tenantId);

        case 'email':
            return await sendEmail({
                to: payload.to,
                subject: payload.metadata?.asunto || 'Mensaje de Volkern CRM',
                html: payload.content.replace(/\n/g, '<br>'),
                text: payload.content,
            });

        case 'sms':
            return await sendSMS(payload.to, payload.content);

        case 'telegram': {
            // Solo el bot PROPIO del tenant: sin él no se envía (el bot del
            // sistema no lleva datos de tenants).
            const creds = await loadTelegramCredentials(tenantId);
            if (!creds.bot_token) {
                throw new Error('El tenant no tiene bot de Telegram propio configurado');
            }
            return await sendTelegramMessage(payload.to, payload.content, creds.bot_token);
        }

        case 'facebook':
            return await sendFacebookMessage(payload.to, payload.content);

        case 'instagram':
            return await sendInstagramMessage(payload.to, payload.content);

        default:
            throw new Error(`Canal no soportado en legacy: ${payload.channel}`);
    }
}
