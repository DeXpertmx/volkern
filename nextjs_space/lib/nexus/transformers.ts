/**
 * Traducción de eventos del Hub (Nexus) a modelos internos de Volkern
 */

export interface TranslatedEvent {
    id: string;
    type: 'message.received' | 'message.sent' | 'conversation.created' | 'conversation.updated';
    tenantId: string;
    data: {
        externalRef: string;
        conversationId?: string;
        content?: string;
        channel?: string;
        metadata?: any;
        contactRef?: string;
    };
}

export function translateHubEvent(payload: any, tenantId: string): TranslatedEvent {
    // Mapeo dinámico basado en la estructura de eventos del Hub
    const eventType = payload.event;

    return {
        id: payload.id || `evt_${Date.now()}`,
        type: mapEventType(eventType),
        tenantId,
        data: {
            externalRef: payload.data?.id?.toString() || payload.data?.conversation_id?.toString(),
            content: payload.data?.content,
            channel: payload.data?.channel || payload.data?.inbox?.channel_type,
            contactRef: payload.data?.sender?.id?.toString() || payload.data?.contact?.id?.toString(),
            metadata: {
                ...payload.data,
                source: 'nexus'
            },
        }
    };
}

function mapEventType(hubEvent: string): TranslatedEvent['type'] {
    switch (hubEvent) {
        case 'message_created': return 'message.received';
        case 'message_updated': return 'message.sent';
        case 'conversation_created': return 'conversation.created';
        case 'conversation_updated': return 'conversation.updated';
        default: return 'message.received';
    }
}
