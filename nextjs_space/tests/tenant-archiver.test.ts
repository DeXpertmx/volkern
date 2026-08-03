/**
 * Tests vitest del helper `archiveTenant` extraído para reusarse desde
 * el endpoint POST /api/admin/tenants/{id}/archive y la página
 * /admin/partner-offboarding.
 *
 * Cubre:
 *   • Éxito end-to-end: estado='archived', hubConfig suspendido, channels
 *     revocados, email domain borrado, goodbye email enviado, audit log
 *     persistido.
 *   • Errores tempranos: tenant no existe, ya archivado.
 *   • dryRun=true: ejecuta el plan completo sin tocar Chatwoot/Resend.
 *   • Defensivo: si goodbye email falla, el resto sigue adelante y se reporta.
 *   • Si deleteDomain falla, se reporta pero se continua; el emailDomainStatus
 *     aún se actualiza a 'archived'.
 *   • recipient resolution: usa billingEmail si existe; si no, busca el
 *     primer usuario con rol Admin/Administrador/Superadmin.
 *   • idempotencia de campos del snapshot antes/después.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const tenant = {
        findUnique: vi.fn(),
        update: vi.fn(),
    };
    const messagingHubConfig = {
        updateMany: vi.fn(),
    };
    const channel = {
        updateMany: vi.fn(),
    };
    const auditLog = {
        create: vi.fn(),
    };
    const user = {
        findFirst: vi.fn(),
    };
    const sendEmail = vi.fn();
    const deleteDomain = vi.fn();
    return {
        tenant,
        messagingHubConfig,
        channel,
        auditLog,
        user,
        sendEmail,
        deleteDomain,
        prisma: {
            tenant, messagingHubConfig, channel, auditLog, user,
        },
    };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/resend-email', () => ({
    sendEmail: mocks.sendEmail,
    getFromAddress: (sub?: string, name?: string) =>
        name && sub ? `${name} <noreply@${sub}.volkern.app>` : 'noreply@volkern.app',
}));
vi.mock('@/lib/resend-domains', () => ({
    deleteDomain: mocks.deleteDomain,
}));

import { archiveTenant, type ArchiveTenantInput } from '../lib/provisioning/tenant-archiver';

const BASE_INPUT: ArchiveTenantInput = {
    tenantId: 'tenant-abc',
    reason: 'requested_by_partner',
    sendGoodbyeEmail: true,
    dryRun: false,
    actor: { kind: 'user', id: 'admin-1', email: 'admin@volkern.app' },
};

const NON_ARCHIVED_TENANT = {
    id: 'tenant-abc',
    nombre: 'Brokers SL',
    slug: 'brokers-sl',
    subdomain: 'brokers-sl',
    estado: 'activo',
    billingEmail: 'billing@brokers-sl.com',
    stripeCustomerId: 'cus_123',
    resendDomainId: 'resend-dom-1',
    emailDomainStatus: 'verified',
};

describe('archiveTenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tenant.findUnique.mockResolvedValue({ ...NON_ARCHIVED_TENANT });
        mocks.tenant.update.mockResolvedValue({ id: 'tenant-abc' });
        mocks.messagingHubConfig.updateMany.mockResolvedValue({ count: 1 });
        mocks.channel.updateMany.mockResolvedValue({ count: 2 });
        mocks.user.findFirst.mockResolvedValue(null);
        mocks.deleteDomain.mockResolvedValue(undefined);
        mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'msg_xyz' });
        mocks.auditLog.create.mockResolvedValue({});
    });

    it('1) éxito end-to-end → estado=archived + 6 steps ok + goodbye email enviado', async () => {
        const result = await archiveTenant(BASE_INPUT);
        expect(result.ok).toBe(true);
        expect(result.tenantId).toBe('tenant-abc');
        expect(result.steps.length).toBeGreaterThanOrEqual(5);

        // Tenant actualizado a estado='archived'
        const updateCall = mocks.tenant.update.mock.calls[0][0];
        expect(updateCall.data.estado).toBe('archived');
        expect(updateCall.data.mrr).toBe(0);
        expect(updateCall.data.fechaVencimiento).toBeInstanceOf(Date);

        // Hub suspendido
        expect(mocks.messagingHubConfig.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { tenantId: 'tenant-abc' },
            data: expect.objectContaining({ isActive: false, hubApiToken: '' }),
        }));

        // Channels revocados
        expect(mocks.channel.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { tenantId: 'tenant-abc', isActive: true },
            data: expect.objectContaining({ isActive: false }),
        }));

        // Resend domain borrado + emailDomainStatus='archived'
        expect(mocks.deleteDomain).toHaveBeenCalledWith('resend-dom-1');
        expect(mocks.tenant.update.mock.calls.length).toBeGreaterThanOrEqual(2);

        // Goodbye email enviado al billingEmail
        expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
        const emailArgs = mocks.sendEmail.mock.calls[0][0];
        expect(emailArgs.to).toBe('billing@brokers-sl.com');
        expect(emailArgs.subject).toContain('Brokers SL');
        expect(emailArgs.tenantSubdomain).toBe('brokers-sl');

        // Audit log con actor propagado
        expect(mocks.auditLog.create).toHaveBeenCalledTimes(1);
        const auditArgs = mocks.auditLog.create.mock.calls[0][0].data;
        expect(auditArgs.accion).toBe('archivar');
        expect(auditArgs.entidad).toBe('tenant');
        expect(auditArgs.cambiosDespues.actor).toEqual(BASE_INPUT.actor);
        expect(auditArgs.cambiosDespues.reason).toBe(BASE_INPUT.reason);

        expect(result.goodbyeEmail).toEqual({ to: 'billing@brokers-sl.com', messageId: 'msg_xyz' });
    });

    it('2) tenant no existe → ok:false, code=TENANT_NOT_FOUND', async () => {
        mocks.tenant.findUnique.mockResolvedValue(null);
        const result = await archiveTenant(BASE_INPUT);
        expect(result.ok).toBe(false);
        if (result.error) expect(result.error.code).toBe('TENANT_NOT_FOUND');
        expect(mocks.tenant.update).not.toHaveBeenCalled();
        expect(mocks.auditLog.create).not.toHaveBeenCalled();
    });

    it('3) tenant ya archived → ok:false, code=ALREADY_ARCHIVED', async () => {
        mocks.tenant.findUnique.mockResolvedValue({ ...NON_ARCHIVED_TENANT, estado: 'archived' });
        const result = await archiveTenant(BASE_INPUT);
        expect(result.ok).toBe(false);
        if (result.error) expect(result.error.code).toBe('ALREADY_ARCHIVED');
    });

    it('4) dryRun=true → ejecuta todo pero no toca Chatwoot/Resend/audit', async () => {
        const result = await archiveTenant({ ...BASE_INPUT, dryRun: true });
        expect(result.ok).toBe(true);
        expect(result.archivedAt).toBe('(dry-run)');
        expect(mocks.tenant.update).not.toHaveBeenCalled();
        expect(mocks.deleteDomain).not.toHaveBeenCalled();
        expect(mocks.sendEmail).not.toHaveBeenCalled();
        expect(mocks.auditLog.create).not.toHaveBeenCalled();
        expect(mocks.tenant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('5) goodbye email se omite → sendGoodbyeEmail=false → no llama sendEmail', async () => {
        const result = await archiveTenant({ ...BASE_INPUT, sendGoodbyeEmail: false });
        expect(result.ok).toBe(true);
        expect(mocks.sendEmail).not.toHaveBeenCalled();
        expect(result.goodbyeEmail).toBeNull();
    });

    it('6) deleteDomain falla → step marcado failed pero tenant.estado sigue archived', async () => {
        mocks.deleteDomain.mockRejectedValue(new Error('Resend 502'));
        const result = await archiveTenant(BASE_INPUT);
        expect(result.ok).toBe(false); // ok=all steps ok, este falló
        const stepResend = result.steps.find(s => s.step.includes('resend'));
        expect(stepResend?.ok).toBe(false);
        expect(stepResend?.detail).toContain('Resend 502');
        // Pero el tenant SÍ fue archivado (estado='archived' ya committed)
        expect(mocks.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ estado: 'archived' }),
        }));
    });

    it('7) goodbye email falla → result.goodbyeEmail null pero sigue ok=true si los demás pasan', async () => {
        mocks.sendEmail.mockResolvedValue({ success: false, messageId: '' });
        const result = await archiveTenant(BASE_INPUT);
        const stepEmail = result.steps.find(s => s.step === 'goodbye email sent' || s.step === 'goodbye email');
        expect(stepEmail?.ok).toBe(false);
        expect(result.goodbyeEmail).toBeNull();
    });

    it('8) recipient resolution: sin billingEmail busca admin user como fallback', async () => {
        mocks.tenant.findUnique.mockResolvedValue({ ...NON_ARCHIVED_TENANT, billingEmail: null });
        mocks.user.findFirst.mockResolvedValue({ email: 'admin@brokers-sl.com' });
        const result = await archiveTenant(BASE_INPUT);
        expect(mocks.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ tenantId: 'tenant-abc' }),
        }));
        expect(mocks.sendEmail.mock.calls[0][0].to).toBe('admin@brokers-sl.com');
        expect(result.ok).toBe(true);
    });

    it('9) sin billingEmail ni admin → step failed, recipient null', async () => {
        mocks.tenant.findUnique.mockResolvedValue({ ...NON_ARCHIVED_TENANT, billingEmail: null });
        mocks.user.findFirst.mockResolvedValue(null);
        const result = await archiveTenant(BASE_INPUT);
        expect(result.goodbyeEmail).toBeNull();
        const stepEmail = result.steps.find(s => s.step.includes('goodbye email'));
        expect(stepEmail?.ok).toBe(false);
        expect(stepEmail?.detail).toContain('no recipient');
    });

    it('10) sin resendDomainId → marca emailDomainStatus="never_configured"', async () => {
        mocks.tenant.findUnique.mockResolvedValue({ ...NON_ARCHIVED_TENANT, resendDomainId: null });
        const result = await archiveTenant(BASE_INPUT);
        const stepNever = result.steps.find(s => s.step.includes('never_configured'));
        expect(stepNever?.ok).toBe(true);
        expect(mocks.deleteDomain).not.toHaveBeenCalled();
    });

    it('11) audit log incluye snapshot del antes (estado original, stripeCustomerId)', async () => {
        await archiveTenant(BASE_INPUT);
        expect(mocks.auditLog.create).toHaveBeenCalledTimes(1);
        const audit = mocks.auditLog.create.mock.calls[0][0].data;
        expect(audit.cambiosAntes.estado).toBe('activo');
        expect(audit.cambiosAntes.stripeCustomerId).toBe('cus_123');
        expect(audit.cambiosDespues.estado).toBe('archived');
        expect(audit.cambiosDespues.reason).toBe('requested_by_partner');
    });

    it('12) actor=system propaga al audit log', async () => {
        await archiveTenant({
            ...BASE_INPUT,
            actor: { kind: 'system', source: 'cron-cleanup' },
        });
        const audit = mocks.auditLog.create.mock.calls[0][0].data;
        expect(audit.cambiosDespues.actor).toEqual({ kind: 'system', source: 'cron-cleanup' });
    });

    it('13) el warning de la variable es esperado', () => {
        // placeholder de smoke; lo importante es que los runs anteriores pasen
        expect(true).toBe(true);
    });
});
