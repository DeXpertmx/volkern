/**
 * Tests vitest del helper `addTelegramChannelToTenant` extraído del provisioner.
 *
 * Cubre:
 *   • Idempotencia: si ya existe un canal telegram activo, devuelve 'already-exists'.
 *   • Validación temprana: botName sin '@' y/o botToken corto → 422-style codes.
 *   • dryRun=true: ejecuta validaciones sin tocar BD ni Chatwoot.
 *   • Flujo completo: crea inbox + upsert hubConfig + crea channel + audit log + webhook.
 *   • Manejo de error: createTelegramInbox falla → ok:false sin rollback.
 *   • Defensivo: configureWebhook/auditLog fallan → ok:true con warn.
 *
 * NOTA: vi.mock() factory NUNCA puede capturar variables/constantes top-level
 * (porque vi.mock se eleva al top del módulo). Por eso TODO el setup de mocks
 * vive dentro de `vi.hoisted()` y se accede vía el objeto `mocks` retornado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const mockChannel = {
        findFirst: vi.fn(),
        create: vi.fn(),
    };
    const mockHubConfig = { upsert: vi.fn() };
    const mockAuditLog = { create: vi.fn() };
    const mockChatwoot = {
        createTelegramInbox: vi.fn(),
        configureWebhook: vi.fn(),
    };
    const mockEncrypt = vi.fn((s: string) => `enc(${s})`);
    return {
        channel: mockChannel,
        hubConfig: mockHubConfig,
        auditLog: mockAuditLog,
        chatwoot: mockChatwoot,
        encrypt: mockEncrypt,
        prisma: {
            channel: mockChannel,
            messagingHubConfig: mockHubConfig,
            auditLog: mockAuditLog,
            tenant: { findUnique: vi.fn() },
            user: { findUnique: vi.fn() },
        },
    };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/nexus/chatwoot-api', () => ({ chatwootApi: mocks.chatwoot }));
vi.mock('@/lib/core/crypto', () => ({
    encrypt: (s: string) => mocks.encrypt(s),
    decrypt: (s: string) => s.replace(/^enc\((.+)\)$/, '$1'),
}));

// Import SUT DESPUÉS de declarar los mocks.
import { addTelegramChannelToTenant, type AddTelegramChannelInput } from '../lib/provisioning/tenant-provisioner';

const BASE_INPUT: AddTelegramChannelInput = {
    tenantId: 'tenant-123',
    tenantName: 'Brokers SL',
    chatwootAccountId: 42,
    chatwootApiToken: 'cwtoken',
    botName: '@mi_empresa_bot',
    botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwx',
    webhookUrl: 'https://volkern.app/api/webhooks/nexus-sync',
    webhookSecret: 'whsecret',
    actor: { kind: 'system', source: 'provisioner' },
};

describe('addTelegramChannelToTenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.channel.findFirst.mockResolvedValue(null);
        mocks.chatwoot.createTelegramInbox.mockResolvedValue({ id: 99 });
        mocks.chatwoot.configureWebhook.mockResolvedValue({ id: 1, url: BASE_INPUT.webhookUrl });
        mocks.hubConfig.upsert.mockResolvedValue({ id: 'hub-1' });
        mocks.channel.create.mockResolvedValue({ id: 'channel-1' });
        mocks.auditLog.create.mockResolvedValue({});
    });

    it('1) éxito → state="created" con inboxId + channelId + hubId', async () => {
        const result = await addTelegramChannelToTenant(BASE_INPUT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state).toBe('created');
        expect(result.telegramInboxId).toBe(99);
        expect(result.telegramChannelId).toBe('channel-1');
        expect(result.hubConfigId).toBe('hub-1');
    });

    it('1a) webhook + hub upsert + channel persistidos correctamente', async () => {
        await addTelegramChannelToTenant(BASE_INPUT);
        expect(mocks.chatwoot.createTelegramInbox).toHaveBeenCalledWith(
            42, BASE_INPUT.botToken, BASE_INPUT.botName, 'cwtoken',
        );
        expect(mocks.hubConfig.upsert).toHaveBeenCalledTimes(1);
        expect(mocks.hubConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { tenantId: 'tenant-123' },
            update: expect.objectContaining({ telegramInboxId: 99 }),
            create: expect.objectContaining({ telegramInboxId: 99 }),
        }));
        expect(mocks.channel.create).toHaveBeenCalledTimes(1);
        const channelData = mocks.channel.create.mock.calls[0][0].data;
        expect(channelData.type).toBe('telegram');
        expect(channelData.isActive).toBe(true);
        expect(channelData.isDefault).toBe(true);
        // botToken encriptado dentro del JSON config
        expect(channelData.config.botToken).toBe('enc(123456789:ABCdefGHIjklMNOpqrSTUvwx)');
        expect(channelData.chatwootInboxId).toBe(99);
    });

    it('1b) audit log registra el actor (system)', async () => {
        await addTelegramChannelToTenant(BASE_INPUT);
        const audit = mocks.auditLog.create.mock.calls[0][0].data;
        expect(audit.accion).toBe('crear');
        expect(audit.entidad).toBe('tenant-telegram');
        expect(audit.entidadId).toBe('tenant-123');
        expect(audit.cambiosDespues.telegramInboxId).toBe(99);
        expect(audit.cambiosDespues.actor).toEqual({ kind: 'system', source: 'provisioner' });
    });

    it('2) idempotente: canal telegram ya existe → state="already-exists"', async () => {
        mocks.channel.findFirst.mockResolvedValue({ id: 'channel-existing', chatwootInboxId: 7 });
        const result = await addTelegramChannelToTenant(BASE_INPUT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state).toBe('already-exists');
        expect(result.telegramInboxId).toBe(7);
        expect(result.telegramChannelId).toBe('channel-existing');
        expect(mocks.chatwoot.createTelegramInbox).not.toHaveBeenCalled();
        expect(mocks.channel.create).not.toHaveBeenCalled();
    });

    it('3) botName sin @ → ok:false TELEGRAM_BOTNAME_INVALID (no toca nada)', async () => {
        const result = await addTelegramChannelToTenant({ ...BASE_INPUT, botName: 'mi_bot' });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe('TELEGRAM_BOTNAME_INVALID');
        expect(mocks.chatwoot.createTelegramInbox).not.toHaveBeenCalled();
        expect(mocks.channel.create).not.toHaveBeenCalled();
    });

    it('4) botToken corto → ok:false TELEGRAM_BOTTOKEN_INVALID', async () => {
        const result = await addTelegramChannelToTenant({ ...BASE_INPUT, botToken: 'short' });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe('TELEGRAM_BOTTOKEN_INVALID');
    });

    it('5) dryRun=true → reporta "created" sin tocar BD ni Chatwoot', async () => {
        const result = await addTelegramChannelToTenant({ ...BASE_INPUT, dryRun: true });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state).toBe('created');
        expect(mocks.chatwoot.createTelegramInbox).not.toHaveBeenCalled();
        expect(mocks.channel.create).not.toHaveBeenCalled();
        expect(mocks.hubConfig.upsert).not.toHaveBeenCalled();
    });

    it('6) Chatwoot createTelegramInbox falla → ok:false TELEGRAM_INBOX_ERROR', async () => {
        mocks.chatwoot.createTelegramInbox.mockRejectedValue(new Error('Chatwoot 503'));
        const result = await addTelegramChannelToTenant(BASE_INPUT);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe('TELEGRAM_INBOX_ERROR');
        expect(result.message).toContain('Chatwoot 503');
        expect(mocks.channel.create).not.toHaveBeenCalled();
    });

    it('7) configureWebhook falla → log warn, sigue siendo ok:true', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mocks.chatwoot.configureWebhook.mockRejectedValue(new Error('webhook 500'));
        const result = await addTelegramChannelToTenant(BASE_INPUT);
        expect(result.ok).toBe(true);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('webhook configure failed'),
            expect.anything(),
        );
        warn.mockRestore();
    });

    it('8) auditLog falla → log warn, sigue siendo ok:true', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mocks.auditLog.create.mockRejectedValue(new Error('audit 503'));
        const result = await addTelegramChannelToTenant(BASE_INPUT);
        expect(result.ok).toBe(true);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('audit log failed'),
            expect.anything(),
        );
        warn.mockRestore();
    });

    it('9) actor=user propaga al audit log', async () => {
        await addTelegramChannelToTenant({
            ...BASE_INPUT,
            actor: { kind: 'user', id: 'admin-1', email: 'admin@volkern.app' },
        });
        const audit = mocks.auditLog.create.mock.calls[0][0].data;
        expect(audit.cambiosDespues.actor).toEqual({ kind: 'user', id: 'admin-1', email: 'admin@volkern.app' });
    });
});
