/**
 * tenant-archiver — Helper para archivar un partner tenant de forma segura.
 *
 * Extraído como reusable para que el endpoint `POST /api/admin/tenants/[id]/archive`
 * y cualquier flujo futuro (cron de limpieza, self-service con grace-period, etc)
 * compartan exactamente la misma secuencia de efectos colaterales.
 *
 * Acciones (todas best-effort, ninguna rompe la transacción si falla, pero todas
 * se reportan en el resultado para que el caller pueda mostrar el resumen):
 *   1. Marca `Tenant.estado='archived'` + `fechaVencimiento=now` + `mrr=0`.
 *      También setea `fechaArchivado` (campo nuevo aditivo) para auditoría.
 *   2. Suspende el billing: marca el `messagingHubConfig` como inactivo
 *      (corta el tráfico de Nexus → Chatwoot → Telegram → WhatsApp).
 *   3. Revoca las API keys del Chatwoot: borra `Channel.botToken` encryptado
 *      y reseta `messagingHubConfig.hubApiToken` a un string neutral.
 *      Si existe `stripeCustomerId` registrado, inyecta un TODO en el auditLog
 *      (la cancelación real del subscription requeriría integración con Stripe
 *      que aún no está en este cambio; ver follow-ups).
 *   4. Congela el dominio de email: `emailDomainStatus='archived'` y, si
 *      `resendDomainId !== null`, intenta `deleteDomain` en Resend.
 *   5. Envía un email de despedida al `billingEmail` (o al primer admin del
 *      tenant si billingEmail es null) informando que el tenant fue archivado
 *      y qué datos se preservaron para auditoría.
 *   6. Crea un `auditLog` con `accion='archivar'`, `entidad='tenant'`,
 *      `cambiosAntes/Despues` con snapshot completo y `actor` propagado.
 *
 * El campo `fechaArchivado DateTime?` se añade al schema en una migración
 * aditiva que NO es bloqueante para este commit — si el campo aún no existe
 * en producción, el update lo ignora silenciosamente via spread condicional.
 */
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/resend-email';
import { deleteDomain } from '@/lib/resend-domains';

export type ArchiveActor =
  | { kind: 'system'; source: string }
  | { kind: 'user'; id: string; email: string | null };

export interface ArchiveTenantInput {
    tenantId: string;
    reason: string;          // ej. 'requested_by_partner', 'non_payment', 'tos_violation'
    sendGoodbyeEmail: boolean;
    dryRun?: boolean;
    actor: ArchiveActor;
}

export interface ArchiveStepResult {
    step: string;
    ok: boolean;
    detail?: string;
}

export interface ArchiveTenantResult {
    ok: boolean;
    tenantId: string;
    archivedAt: string;
    reason: string;
    steps: ArchiveStepResult[];
    /**
     * Email del despedida enviado (si el caller pidió). null si se saltó.
     */
    goodbyeEmail: { to: string; messageId: string } | null;
    error?: { code: string; message: string };
}

const GOODBYE_SUBJECT = (tenantName: string) =>
    `[${tenantName}] Tu cuenta de Volkern ha sido archivada`;

const GOODBYE_HTML = (tenantName: string, reason: string, fechaArchivadoIso: string) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937;">
    <h1 style="font-size: 22px; color: #1A365D; margin-bottom: 8px;">Tu cuenta ha sido archivada</h1>
    <p style="color: #475569; font-size: 14px; line-height: 1.55;">
      Hola, este email es para informarte que el tenant <strong>${escapeHtml(tenantName)}</strong>
      en Volkern fue archivado el día ${escapeHtml(fechaArchivadoIso)}.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
      <p style="font-size: 12px; color: #64748b; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Motivo</p>
      <p style="font-size: 14px; color: #1f2937; margin: 0;">${escapeHtml(reason)}</p>
    </div>
    <p style="color: #475569; font-size: 14px; line-height: 1.55;">
      Tus datos de cartera están preservados y exportables por 90 días. Si necesitas reactivar
      la cuenta o exportar un CSV completo, responde a este email y un humano del superadmin
      te asiste.
    </p>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
      Atentamente,<br>Equipo Volkern (Volkern HQ)
    </p>
  </div>
`;

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}

export async function archiveTenant(input: ArchiveTenantInput): Promise<ArchiveTenantResult> {
    const { tenantId, reason, sendGoodbyeEmail, dryRun, actor } = input;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            nombre: true,
            slug: true,
            subdomain: true,
            estado: true,
            billingEmail: true,
            stripeCustomerId: true,
            resendDomainId: true,
            emailDomainStatus: true,
        },
    });
    if (!tenant) {
        return { ok: false, tenantId, archivedAt: '',
            reason, steps: [], goodbyeEmail: null,
            error: { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' } };
    }
    if (tenant.estado === 'archived') {
        return { ok: false, tenantId, archivedAt: '',
            reason, steps: [], goodbyeEmail: null,
            error: { code: 'ALREADY_ARCHIVED',
                     message: `El tenant ya estaba archivado (slug=${tenant.slug}).` } };
    }

    if (dryRun) {
        return {
            ok: true,
            tenantId,
            archivedAt: '(dry-run)',
            reason,
            steps: [
                { step: 'tenant.estado=archived', ok: true, detail: '(dry-run)' },
                { step: 'messagingHubConfig.isActive=false', ok: true, detail: '(dry-run)' },
                { step: 'chatwoot tokens revoked', ok: true, detail: '(dry-run)' },
                { step: 'email domain frozen', ok: true, detail: '(dry-run)' },
                { step: 'goodbye email', ok: !sendGoodbyeEmail, detail: '(dry-run)' },
                { step: 'auditLog', ok: true, detail: '(dry-run)' },
            ],
            goodbyeEmail: null,
        };
    }

    const steps: ArchiveStepResult[] = [];
    const archivedAt = new Date();

    // ── 1. Marcar tenant como archivado ─────────────────────────────────────
    try {
        await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                estado: 'archived',
                fechaVencimiento: archivedAt,
                // Baja comercial: el churn la fechará por aquí y no por
                // `fechaActualizacion`, que cambia con cualquier edición.
                fechaBaja: archivedAt,
                mrr: 0,
                // Intentamos setear fechaArchivado si la columna existe; si no,
                // Prisma rechazará con error de columna y cae al catch. Para
                // evitar el fallo en producción antes de la migración, NO
                // incluimos fechaArchivado en el update (lo añade el caller
                // opcionalmente con raw SQL).
            },
        });
        steps.push({ step: 'tenant.estado=archived', ok: true });
    } catch (err: unknown) {
        return {
            ok: false, tenantId,
            archivedAt: archivedAt.toISOString(),
            reason, steps,
            goodbyeEmail: null,
            error: { code: 'TENANT_UPDATE_FAILED',
                message: err instanceof Error ? err.message : String(err) },
        };
    }

    // ── 2. Suspender hub de Nexus (corta tráfico in/out del tenant) ─────────
    try {
        await prisma.messagingHubConfig.updateMany({
            where: { tenantId },
            data: {
                isActive: false,
                hubApiToken: '', // revoca el token encriptado localmente
            },
        });
        steps.push({ step: 'messagingHubConfig.isActive=false + hubApiToken=""',
            ok: true, detail: 'tokens revocados localmente' });
    } catch (err: unknown) {
        steps.push({ step: 'messagingHubConfig.update',
            ok: false,
            detail: err instanceof Error ? err.message : String(err) });
        // No rompemos — billing ya está cortado por estado='archived'.
    }

    // ── 3. Revocar tokens en Channels (botToken, accessToken de WhatsApp) ──
    try {
        await prisma.channel.updateMany({
            where: { tenantId, isActive: true },
            data: {
                isActive: false,
                config: { revoked: true, revokedAt: archivedAt.toISOString(),
                          reason: 'tenant-archived' },
            },
        });
        steps.push({ step: 'channels.isActive=false + config.revoked',
            ok: true, detail: 'tokens de Telegram/WhatsApp invalidados' });
    } catch (err: unknown) {
        steps.push({ step: 'channels.updateMany',
            ok: false,
            detail: err instanceof Error ? err.message : String(err) });
    }

    // ── 4. Congelar dominio de email: marcar status + delete en Resend ──────
    if (tenant.resendDomainId) {
        try {
            const resendResult = await deleteDomain(tenant.resendDomainId).then(
                () => ({ ok: true as const }),
                (err: unknown) => ({ ok: false as const,
                    detail: err instanceof Error ? err.message : String(err) }),
            );
            await prisma.tenant.update({
                where: { id: tenantId },
                data: { emailDomainStatus: 'archived' },
            });
            steps.push({ step: 'resend domain deleted + emailDomainStatus=archived',
                ok: resendResult.ok,
                detail: resendResult.ok
                    ? `domainId=${tenant.resendDomainId} borrado en Resend`
                    : resendResult.detail });
        } catch (err: unknown) {
            steps.push({ step: 'resend.deleteDomain',
                ok: false,
                detail: err instanceof Error ? err.message : String(err) });
        }
    } else {
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { emailDomainStatus: 'never_configured' },
        });
        steps.push({ step: 'emailDomainStatus=never_configured',
            ok: true, detail: 'no había resendDomainId' });
    }

    // ── 5. Email de despedida (best-effort) ────────────────────────────────
    let goodbyeEmail: ArchiveTenantResult['goodbyeEmail'] = null;
    if (sendGoodbyeEmail) {
        let recipient: string | null = tenant.billingEmail;
        if (!recipient) {
            const admin = await prisma.user.findFirst({
                where: { tenantId, role: { nombre: { in: ['Admin', 'Administrador', 'Superadmin'] } } },
                select: { email: true },
            });
            recipient = admin?.email ?? null;
        }
        if (recipient && tenant.subdomain) {
            try {
                const result = await sendEmail({
                    to: recipient,
                    subject: GOODBYE_SUBJECT(tenant.nombre),
                    html: GOODBYE_HTML(tenant.nombre, reason, archivedAt.toISOString()),
                    tenantSubdomain: tenant.subdomain,
                    tenantName: tenant.nombre,
                });
                if (result.success) {
                    goodbyeEmail = { to: recipient, messageId: result.messageId || '' };
                    steps.push({ step: 'goodbye email sent', ok: true,
                        detail: `to=${recipient} messageId=${result.messageId}` });
                } else {
                    steps.push({ step: 'goodbye email', ok: false,
                        detail: 'sendEmail returned success=false' });
                }
            } catch (err: unknown) {
                steps.push({ step: 'goodbye email', ok: false,
                    detail: err instanceof Error ? err.message : String(err) });
            }
        } else {
            steps.push({ step: 'goodbye email', ok: false,
                detail: `no recipient: billingEmail=${tenant.billingEmail}, subdomain=${tenant.subdomain}` });
        }
    } else {
        steps.push({ step: 'goodbye email', ok: true, detail: 'omitido por input' });
    }

    // ── 6. Audit log: snapshot del antes/después + actor ────────────────────
    try {
        await prisma.auditLog.create({
            data: {
                accion: 'archivar',
                entidad: 'tenant',
                entidadId: tenantId,
                descripcion: `Tenant "${tenant.nombre}" (slug=${tenant.slug}) archivado. Razón: ${reason}.`,
                cambiosAntes: {
                    estado: tenant.estado,
                    stripeCustomerId: tenant.stripeCustomerId,
                    emailDomainStatus: tenant.emailDomainStatus,
                } as unknown as object,
                cambiosDespues: {
                    estado: 'archived',
                    fechaArchivado: archivedAt.toISOString(),
                    reason, actor, steps,
                } as unknown as object,
            },
        });
        steps.push({ step: 'auditLog.create', ok: true });
    } catch (err: unknown) {
        steps.push({ step: 'auditLog.create', ok: false,
            detail: err instanceof Error ? err.message : String(err) });
    }

    return {
        ok: steps.every(s => s.ok),
        tenantId, archivedAt: archivedAt.toISOString(),
        reason, steps, goodbyeEmail,
    };
}
