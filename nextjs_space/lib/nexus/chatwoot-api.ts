/**
 * Cliente interno para la API de Chatwoot
 * Usado para provisionamiento automático de cuentas y canales
 * White-label: Nunca exponer "chatwoot" al frontend
 */

import { encrypt } from '@/lib/core/crypto';
import crypto from 'crypto';

// Sin CHATWOOT_BASE_URL el cliente está deshabilitado: el default anterior
// ('https://volkern.dimension.expert') apuntaba al gateway de Volkern, no a
// una instancia de Chatwoot, y cada llamada devolvía 404 de la app. Ahora una
// URL ausente se trata como "Chatwoot no configurado" (ver request()).
const CHATWOOT_BASE_URL = process.env.CHATWOOT_BASE_URL || '';
const CHATWOOT_SUPER_ADMIN_TOKEN = process.env.CHATWOOT_SUPER_ADMIN_TOKEN;
const CHATWOOT_BOT_USER_ID = 2; // ID del usuario bot admin-bot@volkern.app
const CHATWOOT_BOT_EMAIL = 'admin-bot@volkern.app';
const CHATWOOT_BOT_PASSWORD = 'AdminBot123!';

interface ChatwootAccount {
    id: number;
    name: string;
    locale: string;
    status: string;
}

interface ChatwootInbox {
    id: number;
    name: string;
    channel_type: string;
    greeting_enabled: boolean;
}

interface ChatwootAccessToken {
    token: string;
    id: number;
}

interface ChatwootUser {
    id: number;
    email: string;
    role: string;
    access_token?: string;
}

interface ChatwootPlatformUser {
    id: number;
    email: string;
    name: string;
    access_token: string;
    accounts: { id: number; role: string }[];
}

class ChatwootApiClient {
    private baseUrl: string;
    private superAdminToken: string;
    private cachedBotUser: ChatwootPlatformUser | null = null;

    constructor() {
        this.baseUrl = CHATWOOT_BASE_URL;
        this.superAdminToken = CHATWOOT_SUPER_ADMIN_TOKEN || '';

        if (!this.superAdminToken) {
            console.warn('[ChatwootAPI] CHATWOOT_SUPER_ADMIN_TOKEN no configurado');
        }
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        useAccountToken?: string
    ): Promise<T> {
        if (!this.baseUrl) {
            throw new Error('Chatwoot no configurado: falta CHATWOOT_BASE_URL. Las integraciones de mensajería se omiten.');
        }
        const token = useAccountToken || this.superAdminToken;
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'api_access_token': token,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('[ChatwootAPI] Error:', {
                status: response.status,
                endpoint,
                body: errorBody
            });
            throw new Error(`Chatwoot API error: ${response.status} - ${errorBody}`);
        }

        return response.json();
    }

    // ========== ACCOUNTS ==========

    /**
     * Crear una nueva cuenta en Chatwoot
     */
    async createAccount(name: string, locale: string = 'es'): Promise<ChatwootAccount> {
        console.log('[ChatwootAPI] Creating account:', name);
        
        return this.request<ChatwootAccount>('/platform/api/v1/accounts', {
            method: 'POST',
            body: JSON.stringify({ name, locale }),
        });
    }

    /**
     * Obtener información de una cuenta
     */
    async getAccount(accountId: number): Promise<ChatwootAccount> {
        return this.request<ChatwootAccount>(`/api/v1/accounts/${accountId}`);
    }

    // ========== BOT USER MANAGEMENT ==========

    /**
     * Obtener o crear el usuario bot de administración
     * Este usuario se asocia a cada cuenta para poder crear inboxes
     */
    async getOrCreateBotUser(): Promise<ChatwootPlatformUser> {
        if (this.cachedBotUser) {
            return this.cachedBotUser;
        }

        console.log('[ChatwootAPI] Getting or creating bot user');

        // Intentar obtener el usuario existente por ID
        try {
            const user = await this.request<ChatwootPlatformUser>(
                `/platform/api/v1/users/${CHATWOOT_BOT_USER_ID}`,
                { method: 'GET' }
            );

            if (user && user.id) {
                console.log('[ChatwootAPI] Bot user found:', user.id);
                this.cachedBotUser = user;
                return user;
            }
        } catch (error) {
            console.log('[ChatwootAPI] Bot user not found by ID, creating new one');
        }

        // Crear nuevo usuario bot
        const newUser = await this.request<ChatwootPlatformUser>(
            '/platform/api/v1/users',
            {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Admin Bot',
                    email: CHATWOOT_BOT_EMAIL,
                    password: CHATWOOT_BOT_PASSWORD,
                    custom_attributes: {},
                }),
            }
        );

        console.log('[ChatwootAPI] Bot user created:', newUser.id);
        this.cachedBotUser = newUser;
        return newUser;
    }

    /**
     * Asociar el bot user a una cuenta como administrador
     */
    async ensureBotUserInAccount(accountId: number): Promise<string> {
        const botUser = await this.getOrCreateBotUser();

        // Verificar si ya está asociado
        const isAssociated = botUser.accounts?.some(acc => acc.id === accountId);

        if (!isAssociated) {
            console.log('[ChatwootAPI] Associating bot user to account:', accountId);
            await this.request(
                `/platform/api/v1/accounts/${accountId}/account_users`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: botUser.id,
                        role: 'administrator',
                    }),
                }
            );

            // Actualizar la lista de cuentas del usuario en caché
            if (!botUser.accounts) {
                botUser.accounts = [];
            }
            botUser.accounts.push({ id: accountId, role: 'administrator' });
        }

        return botUser.access_token;
    }

    /**
     * Crear cuenta y preparar el acceso del bot
     * Retorna tanto el ID de la cuenta como el access token del bot
     */
    async createAccountWithAccess(name: string, locale: string = 'es'): Promise<{
        account: ChatwootAccount;
        accessToken: string;
    }> {
        // 1. Crear la cuenta
        const account = await this.createAccount(name, locale);

        // 2. Asegurar que el bot user esté en la cuenta
        const accessToken = await this.ensureBotUserInAccount(account.id);

        return { account, accessToken };
    }

    // ========== INBOXES (Canales) ==========

    /**
     * Crear inbox de Telegram
     */
    async createTelegramInbox(
        accountId: number,
        botToken: string,
        botName: string,
        accountToken: string
    ): Promise<ChatwootInbox> {
        console.log('[ChatwootAPI] Creating Telegram inbox for account:', accountId);
        
        return this.request<ChatwootInbox>(
            `/api/v1/accounts/${accountId}/inboxes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: `Telegram - ${botName}`,
                    channel: {
                        type: 'telegram',
                        bot_token: botToken,
                    },
                }),
            },
            accountToken
        );
    }

    /**
     * Crear inbox de WhatsApp (Cloud API)
     */
    async createWhatsAppInbox(
        accountId: number,
        name: string,
        phoneNumberId: string,
        businessAccountId: string,
        accessToken: string,
        accountToken: string
    ): Promise<ChatwootInbox> {
        console.log('[ChatwootAPI] Creating WhatsApp inbox for account:', accountId);
        
        return this.request<ChatwootInbox>(
            `/api/v1/accounts/${accountId}/inboxes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    channel: {
                        type: 'whatsapp',
                        phone_number_id: phoneNumberId,
                        business_account_id: businessAccountId,
                        api_key: accessToken,
                        provider: 'whatsapp_cloud', // Chatwoot v3.x
                    },
                }),
            },
            accountToken
        );
    }

    /**
     * Crear inbox de canal API (puente WhatsApp vía Evolution API)
     *
     * Chatwoot 4.x NO incluye el provider 'evolution' (solo `default` y
     * `whatsapp_cloud`), así que el puente se implementa con un inbox tipo
     * `api`: Volkern crea la conversación y el mensaje entrante vía la API
     * REST de Chatwoot, y el webhook del canal API devuelve las respuestas
     * del agente para reenviarlas a WhatsApp por Evolution.
     */
    async createApiInbox(
        accountId: number,
        name: string,
        webhookUrl: string,
        accountToken: string
    ): Promise<ChatwootInbox> {
        console.log('[ChatwootAPI] Creating API inbox for account:', accountId);

        return this.request<ChatwootInbox>(
            `/api/v1/accounts/${accountId}/inboxes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    channel: {
                        type: 'api',
                        webhook_url: webhookUrl,
                    },
                }),
            },
            accountToken
        );
    }

    /**
     * Crear inbox de WhatsApp vía Twilio
     */
    async createTwilioWhatsAppInbox(
        accountId: number,
        name: string,
        phoneNumber: string,
        accountSid: string,
        authToken: string,
        accountToken: string
    ): Promise<ChatwootInbox> {
        console.log('[ChatwootAPI] Creating Twilio WhatsApp inbox for account:', accountId);
        
        return this.request<ChatwootInbox>(
            `/api/v1/accounts/${accountId}/inboxes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    channel: {
                        type: 'whatsapp',
                        phone_number: phoneNumber,
                        provider: 'twilio',
                        provider_config: {
                            account_sid: accountSid,
                            auth_token: authToken,
                        },
                    },
                }),
            },
            accountToken
        );
    }

    /**
     * Crear inbox de Email (IMAP/SMTP)
     */
    async createEmailInbox(
        accountId: number,
        name: string,
        email: string,
        config: {
            imap: { address: string; port: number; user: string; pass: string; ssl: boolean };
            smtp: { address: string; port: number; user: string; pass: string; protocol: string };
        },
        accountToken: string
    ): Promise<ChatwootInbox> {
        console.log('[ChatwootAPI] Creating Email inbox for account:', accountId, email);
        
        return this.request<ChatwootInbox>(
            `/api/v1/accounts/${accountId}/inboxes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: `Email - ${name}`,
                    channel: {
                        type: 'email',
                        email: email,
                        imap_enabled: true,
                        imap_address: config.imap.address,
                        imap_port: config.imap.port,
                        imap_email: config.imap.user,
                        imap_password: config.imap.pass,
                        imap_enable_ssl: config.imap.ssl,
                        smtp_enabled: true,
                        smtp_address: config.smtp.address,
                        smtp_port: config.smtp.port,
                        smtp_email: config.smtp.user,
                        smtp_password: config.smtp.pass,
                        smtp_protocol: config.smtp.protocol,
                    },
                }),
            },
            accountToken
        );
    }

    /**
     * Listar inboxes de una cuenta
     */
    async listInboxes(accountId: number, accountToken: string): Promise<{ payload: ChatwootInbox[] }> {
        return this.request<{ payload: ChatwootInbox[] }>(
            `/api/v1/accounts/${accountId}/inboxes`,
            { method: 'GET' },
            accountToken
        );
    }

    /**
     * Añadir agentes como miembros de un inbox. Sin membresía, los agentes no
     * ven las conversaciones del inbox en las vistas "Sin asignar"/"Todas"
     * del hub.
     */
    async addInboxMembers(
        accountId: number,
        inboxId: number,
        userIds: number[],
        accountToken: string
    ): Promise<{ payload: any[] }> {
        console.log('[ChatwootAPI] Adding inbox members:', inboxId, userIds);
        return this.request<{ payload: any[] }>(
            `/api/v1/accounts/${accountId}/inbox_members`,
            {
                method: 'POST',
                body: JSON.stringify({ inbox_id: inboxId, user_ids: userIds }),
            },
            accountToken
        );
    }

    /**
     * Asegura que un usuario exista en Chatwoot (idempotente por email, la
     * plataforma reutiliza el usuario si ya existe) y esté vinculado a la
     * cuenta del tenant como agente. Devuelve el user_id de Chatwoot.
     */
    async ensureUserInAccountByEmail(
        accountId: number,
        email: string,
        name: string,
        accountToken: string
    ): Promise<number> {
        const user = await this.request<{ id: number }>(
            '/platform/api/v1/users',
            {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    email,
                    // La plataforma exige password fuerte; el usuario opera con
                    // tokens de API, no con login directo a esta cuenta.
                    password: `A1!${crypto.randomBytes(10).toString('base64url')}`,
                }),
            }
        );
        await this.request(
            `/platform/api/v1/accounts/${accountId}/account_users`,
            {
                method: 'POST',
                body: JSON.stringify({ user_id: user.id, role: 'agent' }),
            }
        );
        return user.id;
    }

    // ========== ACCESS TOKENS ==========

    /**
     * Generar API token para la cuenta del tenant
     */
    async createAccountAccessToken(
        accountId: number,
        name: string
    ): Promise<ChatwootAccessToken> {
        console.log('[ChatwootAPI] Creating access token for account:', accountId);
        
        // Usar Platform API para crear token de cuenta
        return this.request<ChatwootAccessToken>(
            `/platform/api/v1/accounts/${accountId}/account_users`,
            {
                method: 'POST',
                body: JSON.stringify({
                    user_id: 1, // Super admin user ID
                    role: 'administrator',
                }),
            }
        );
    }

    /**
     * Crear usuario administrador en la cuenta
     */
    async createAccountUser(
        accountId: number,
        email: string,
        name: string,
        role: string = 'administrator'
    ): Promise<ChatwootUser> {
        console.log('[ChatwootAPI] Creating user for account:', accountId, email);

        // Chatwoot exige que el usuario EXISTA antes de vincularlo a una
        // cuenta: `POST /platform/api/v1/accounts/:id/account_users` devuelve
        // 422 "User must exist" si no hay user_id. Flujo canónico de la wiki
        // de Chatwoot: crear Account -> crear User (platform users API, que
        // además reutiliza el usuario si ya existe por email) -> vincular con
        // account_users { user_id, role }.
        const user = await this.request<ChatwootUser>(
            '/platform/api/v1/users',
            {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    email,
                    // La plataforma exige password con política fuerte (mayúscula,
                    // minúscula, número, especial); generamos una aleatoria. Los
                    // admins del tenant no la usan para login directo: el hub
                    // opera con tokens de API (ver ChatwootPlatformUser).
                    password: `A1!${crypto.randomBytes(10).toString('base64url')}`,
                }),
            }
        );

        return this.request<ChatwootUser>(
            `/platform/api/v1/accounts/${accountId}/account_users`,
            {
                method: 'POST',
                body: JSON.stringify({
                    user_id: user.id,
                    role,
                }),
            }
        );
    }

    // ========== CONVERSATIONS ==========

    /**
     * Crear o obtener conversación
     */
    async getOrCreateConversation(
        accountId: number,
        inboxId: number,
        contactIdentifier: string,
        accountToken: string
    ): Promise<{ id: number; contact_id: number }> {
        // Primero buscar contacto existente
        const contacts = await this.request<{ payload: any[] }>(
            `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(contactIdentifier)}`,
            { method: 'GET' },
            accountToken
        );

        let contactId: number | undefined;

        if (contacts.payload && contacts.payload.length > 0) {
            contactId = contacts.payload[0].id;
        } else {
            // Crear contacto. Chatwoot 4.x devuelve el contacto en
            // payload.contact.id (no payload.id).
            const newContact = await this.request<{ payload: { contact?: { id: number }; id?: number } }>(
                `/api/v1/accounts/${accountId}/contacts`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        inbox_id: inboxId,
                        // Siempre guardar el número en formato E.164 (con '+'),
                        // que es lo que exige Chatwoot (422 si no): el puente
                        // saliente lee conversation.contact.phone_number para
                        // reenviar la respuesta del agente a WhatsApp.
                        phone_number: '+' + (contactIdentifier.includes('@') ? contactIdentifier.split('@')[0] : contactIdentifier),
                        email: contactIdentifier.includes('@') ? contactIdentifier : undefined,
                        name: contactIdentifier,
                    }),
                },
                accountToken
            );
            contactId = newContact?.payload?.contact?.id ?? newContact?.payload?.id;
        }

        if (!contactId) {
            throw new Error('No se pudo obtener el ID del contacto en Chatwoot.');
        }

        // Asegurar que el contacto tenga un contact_inbox (source_id) para este
        // inbox. Chatwoot exige esa relación para abrir una conversación en el
        // inbox; si el contacto existía de otro inbox (o sin vínculo), el POST
        // /conversations devuelve 404 "Resource could not be found".
        try {
            await this.request(
                `/api/v1/accounts/${accountId}/contacts/${contactId}/contact_inboxes`,
                {
                    method: 'POST',
                    body: JSON.stringify({ inbox_id: inboxId }),
                },
                accountToken
            );
        } catch (contactInboxErr) {
            // Si el contact_inbox ya existe, el endpoint responde 200; otros
            // errores no deben romper el flujo (el POST /conversations lo dirá).
            console.warn('[ChatwootAPI] contact_inboxes warning:', contactInboxErr instanceof Error ? contactInboxErr.message : contactInboxErr);
        }

        // Crear conversación
        const conversation = await this.request<{ id: number; contact_id: number }>(
            `/api/v1/accounts/${accountId}/conversations`,
            {
                method: 'POST',
                body: JSON.stringify({
                    inbox_id: inboxId,
                    contact_id: contactId,
                    status: 'open',
                }),
            },
            accountToken
        );

        return conversation;
    }

    // ========== MESSAGES ==========

    /**
     * Enviar mensaje en una conversación
     */
    async sendMessage(
        accountId: number,
        conversationId: number,
        content: string,
        accountToken: string,
        options?: {
            messageType?: 'outgoing' | 'incoming';
            private?: boolean;
            contentType?: string;
            contentAttributes?: Record<string, any>;
        }
    ): Promise<{ id: number; content: string; message_type: number }> {
        return this.request(
            `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
            {
                method: 'POST',
                body: JSON.stringify({
                    content,
                    message_type: options?.messageType || 'outgoing',
                    private: options?.private || false,
                    content_type: options?.contentType,
                    content_attributes: options?.contentAttributes,
                }),
            },
            accountToken
        );
    }

    /**
     * Asignar una conversación a un agente (para que aparezca en su vista
     * "Mis conversaciones"/asignadas del hub).
     */
    async assignConversation(
        accountId: number,
        conversationId: number,
        assigneeId: number,
        accountToken: string
    ): Promise<{ payload: any }> {
        console.log('[ChatwootAPI] Assigning conversation:', conversationId, '→ user', assigneeId);
        return this.request<{ payload: any }>(
            `/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
            {
                method: 'POST',
                body: JSON.stringify({ assignee_id: assigneeId }),
            },
            accountToken
        );
    }

    /**
     * Añadir etiquetas a una conversación (visibles en la vista del agente).
     * El endpoint es idempotente: re-añadir una etiqueta existente no duplica.
     */
    async addLabels(
        accountId: number,
        conversationId: number,
        labels: string[],
        accountToken: string
    ): Promise<{ payload: any }> {
        console.log('[ChatwootAPI] Añadiendo labels a conversación:', conversationId, '→', labels);
        return this.request<{ payload: any }>(
            `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
            {
                method: 'POST',
                body: JSON.stringify({ labels }),
            },
            accountToken
        );
    }

    /**
     * Listar los agentes de la cuenta (id, nombre, email). Se usa para mapear
     * al agente de Chatwoot correspondiente al usuario autenticado de Volkern
     * (por email) y así filtrar la pestaña "Mías" del hub.
     */
    async listAgents(
        accountId: number,
        accountToken: string
    ): Promise<{ id: number; name: string; email: string }[]> {
        try {
            const res = await this.request<{ payload?: any[] } | any[]>(
                `/api/v1/accounts/${accountId}/agents`,
                { method: 'GET' },
                accountToken
            );
            const list = Array.isArray(res) ? res : (res?.payload || []);
            return list
                .filter((a: any) => a && typeof a.id === 'number')
                .map((a: any) => ({
                    id: Number(a.id),
                    name: String(a.name || a.available_name || ''),
                    email: String((a.email || '').toLowerCase()),
                }));
        } catch (err) {
            console.error('[ChatwootAPI] Error listando agentes:', err instanceof Error ? err.message : err);
            return [];
        }
    }

    /**
     * Listar conversaciones de la cuenta con su agente asignado (assignee).
     * La respuesta de Chatwoot v4 incluye `meta.assignee` en cada conversación
     * ({ id, name, email, ... } o null si está sin asignar). Se pagina hasta
     * `maxPages` para cubrir bandejas grandes.
     */
    async listConversations(
        accountId: number,
        accountToken: string,
        options?: { status?: string; assigneeType?: string; maxPages?: number }
    ): Promise<{
        conversations: {
            id: number;
            status: string;
            assignee: { id: number; name: string; email: string } | null;
        }[];
        counts?: { mias: number; sin_asignar: number; todas: number };
        error?: string;
    }> {
        const maxPages = options?.maxPages || 5;
        const conversations: { id: number; status: string; assignee: { id: number; name: string; email: string } | null }[] = [];
        let page = 1;
        // Chatwoot v4 devuelve en data.meta los contadores globales del account
        // (mine_count/unassigned_count/all_count) exactos para las pestañas.
        let counts: { mias: number; sin_asignar: number; todas: number } | undefined;
        try {
            while (page <= maxPages) {
                const params = new URLSearchParams({
                    page: String(page),
                    ...(options?.status ? { status: options.status } : {}),
                    ...(options?.assigneeType ? { assignee_type: options.assigneeType } : {}),
                });
                const res = await this.request<{
                    data?: { payload?: any[]; meta?: Record<string, any> };
                    payload?: any[];
                    meta?: { pagination?: { next_page?: number | null } };
                }>(
                    `/api/v1/accounts/${accountId}/conversations?${params.toString()}`,
                    { method: 'GET' },
                    accountToken
                );
                // Chatwoot v4: { data: { payload: [...], meta: {...} } }
                const innerData = (res?.data || {}) as { payload?: any[]; meta?: Record<string, any> };
                const list = Array.isArray(res?.payload)
                    ? res.payload
                    : (innerData.payload || []);
                const meta = innerData.meta || {};
                if (typeof meta.mine_count === 'number' && typeof meta.all_count === 'number') {
                    counts = {
                        mias: meta.mine_count,
                        sin_asignar: meta.unassigned_count ?? 0,
                        todas: meta.all_count,
                    };
                }
                if (list.length === 0) break;
                for (const conv of list) {
                    const assigneeRaw = conv?.meta?.assignee || conv?.assignee || null;
                    conversations.push({
                        id: Number(conv?.id),
                        status: String(conv?.status || 'open'),
                        assignee: assigneeRaw && typeof assigneeRaw === 'object'
                            ? {
                                id: Number(assigneeRaw.id),
                                name: String(assigneeRaw.name || assigneeRaw.available_name || ''),
                                email: String((assigneeRaw.email || '').toLowerCase()),
                            }
                            : null,
                    });
                }
                const next =
                    (res?.meta as any)?.pagination?.next_page ??
                    (innerData.meta as any)?.pagination?.next_page;
                if (!next) break;
                page += 1;
            }
            return { conversations, counts };
        } catch (err) {
            console.error('[ChatwootAPI] Error listando conversaciones:', err instanceof Error ? err.message : err);
            return { conversations, counts, error: err instanceof Error ? err.message : 'Error listando conversaciones' };
        }
    }

    // ========== WEBHOOKS ==========

    /**
     * Configurar webhook para la cuenta
     * Chatwoot devuelve el `secret` del webhook en la respuesta; ese secret es
     * el que firma cada payload (X-Chatwoot-Signature: sha256=HMAC(secret, ts.body))
     * y debe guardarse para validar los eventos entrantes del hub.
     */
    async configureWebhook(
        accountId: number,
        webhookUrl: string,
        accountToken: string
    ): Promise<{ id: number; url: string; secret: string }> {
        console.log('[ChatwootAPI] Configuring webhook for account:', accountId);
        
        const result = await this.request<{ payload: { webhook: { id: number; url: string; secret: string } } }>(
            `/api/v1/accounts/${accountId}/webhooks`,
            {
                method: 'POST',
                body: JSON.stringify({
                    url: webhookUrl,
                    subscriptions: [
                        'conversation_created',
                        'conversation_status_changed',
                        'conversation_updated',
                        'message_created',
                        'message_updated',
                        'webwidget_triggered',
                    ],
                }),
            },
            accountToken
        );

        const webhook = result?.payload?.webhook;
        return {
            id: webhook?.id ?? 0,
            url: webhook?.url ?? webhookUrl,
            secret: webhook?.secret ?? '',
        };
    }

    // ========== HEALTH CHECK ==========

    /**
     * Verificar conectividad con Chatwoot
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return response.ok;
        } catch (error) {
            console.error('[ChatwootAPI] Health check failed:', error);
            return false;
        }
    }
}

// Singleton
export const chatwootApi = new ChatwootApiClient();
export type { ChatwootAccount, ChatwootInbox, ChatwootAccessToken, ChatwootUser };
