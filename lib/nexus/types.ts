
/**
 * Interfaces neutras para Nexus Hub - cero menciones a herramientas específicas
 */

export interface NexusConfig {
    tenantId: string;
    baseUrl: string;
    apiToken: string; // Ya desencriptado
    accountId?: string;
    defaultEndpointId?: string;
    webhookSecret: string;
}

export interface NexusMessagePayload {
    to: string; // phone, email, etc.
    content: string;
    contentType?: 'text' | 'image' | 'document' | 'audio';
    attachmentUrl?: string;
    metadata?: {
        leadId?: string;
        conversationId?: string;
        campaignId?: string;
        channel?: 'whatsapp' | 'email' | 'sms' | 'telegram' | 'facebook' | 'instagram';
        [key: string]: any;
    };
}

export interface NexusSendResult {
    success: boolean;
    messageId: string; // ID asignado por el Hub
    status: 'queued' | 'sent' | 'delivered' | 'failed';
    error?: {
        code: string;
        message: string;
    };
    timestamp: string;
}
