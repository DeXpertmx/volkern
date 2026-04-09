import { NexusConfig, NexusMessagePayload, NexusSendResult } from './types';

export class NexusAdapter {
    private config: NexusConfig;

    constructor(config: NexusConfig) {
        this.config = config;
    }

    private get headers(): HeadersInit {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiToken}`,
            'X-Tenant-ID': this.config.tenantId, // 🔐 Aislamiento explícito
        };
    }

    async sendMessage(
        endpointId: string,
        payload: NexusMessagePayload
    ): Promise<NexusSendResult> {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/v1/conversations`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({
                    inbox_id: endpointId,
                    contact_id: payload.metadata?.leadId, // Mapeo inteligente
                    content: payload.content,
                    message_type: 'outgoing',
                    attachments: payload.attachmentUrl ? [{ url: payload.attachmentUrl }] : undefined,
                    private: false,
                }),
                next: { revalidate: 0 }, // ✅ Next.js: evitar caché para requests de envío
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                return {
                    success: false,
                    messageId: '',
                    status: 'failed',
                    error: {
                        code: `HUB_${response.status}`,
                        message: error.message || 'Error en servicio de mensajería',
                    },
                    timestamp: new Date().toISOString(),
                };
            }

            const data = await response.json();

            return {
                success: true,
                messageId: data.id,
                status: data.status || 'sent',
                timestamp: data.created_at || new Date().toISOString(),
            };

        } catch (error) {
            console.error(`[Nexus] Error sending message for tenant ${this.config.tenantId}:`, error);

            return {
                success: false,
                messageId: '',
                status: 'failed',
                error: {
                    code: 'NETWORK_ERROR',
                    message: 'No se pudo conectar con el servicio de mensajería',
                },
                timestamp: new Date().toISOString(),
            };
        }
    }

    async healthCheck(): Promise<{ ok: boolean; latencyMs?: number }> {
        const start = Date.now();
        try {
            const response = await fetch(`${this.config.baseUrl}/health`, {
                headers: this.headers,
                cache: 'no-store',
                next: { revalidate: 0 },
            });
            const latencyMs = Date.now() - start;

            return {
                ok: response.ok,
                latencyMs,
            };
        } catch {
            return { ok: false };
        }
    }
}
