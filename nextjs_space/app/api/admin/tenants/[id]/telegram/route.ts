export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
    addTelegramChannelToTenant,
    type TelegramActor,
} from '@/lib/provisioning/tenant-provisioner';
import { decrypt } from '@/lib/core/crypto';
import crypto from 'crypto';

/**
 * POST /api/admin/tenants/{id}/telegram
 *
 * Conecta el canal de Telegram a un partner tenant que se creó sin bot
 * (e.g. wizard /admin/partner-onboarding con toggle OFF).
 *
 * Auth: superadmin (chequeo idéntico a los endpoints `/admin/tenants/[id]/features`
 * y `/admin/tenants/[id]/modules` para preservar el patrón).
 *
 * Body:
 *   { botName: string, botToken: string }
 *
 * Returns 200 con { state, telegramInboxId, telegramChannelId, hubConfigId }
 *   o 200 con { state: 'already-exists', ... } si ya estaba conectado.
 *
 * Códigos de error:
 *   401 UNAUTHORIZED, 403 FORBIDDEN, 404 TENANT_NOT_FOUND,
 *   409 TENANT_LACKS_CHATWOOT (no hay messagingHubConfig.chatwootAccountId),
 *   422 TELEGRAM_BOTNAME_INVALID / TELEGRAM_BOTTOKEN_INVALID / TELEGRAM_BAD_TOKEN,
 *   500 TELEGRAM_INBOX_ERROR / UNEXPECTED.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { role: true },
        });
        if (user?.role?.nombre !== 'Superadmin') {
            return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: params.id },
            select: { id: true, nombre: true, slug: true },
        });
        if (!tenant) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
        }

        const body = await req.json().catch(() => ({}));
        const botName = String(body?.botName ?? '').trim();
        const botToken = String(body?.botToken ?? '').trim();
        if (!botName || !botToken) {
            return NextResponse.json(
                { error: 'botName y botToken son requeridos' },
                { status: 400 },
            );
        }

        // Validar contra el API de Telegram (fallo temprano antes de tocar Chatwoot)
        try {
            const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const getMe = await getMeRes.json();
            if (!getMe.ok) {
                return NextResponse.json(
                    { code: 'TELEGRAM_BAD_TOKEN',
                      error: getMe.description || 'Token de Telegram rechazado por getMe' },
                    { status: 422 },
                );
            }
        } catch (err: unknown) {
            return NextResponse.json(
                { code: 'TELEGRAM_BAD_TOKEN',
                  error: err instanceof Error ? err.message : 'No pude validar el token con Telegram' },
                { status: 422 },
            );
        }

        // Necesitamos chatwootAccountId + chatwootApiToken del messagingHubConfig
        // (que se creó en el paso 3 del provisioner aunque Telegram hubiera sido skip).
        const hub = await prisma.messagingHubConfig.findUnique({
            where: { tenantId: tenant.id },
        });
        if (!hub || !hub.chatwootAccountId) {
            return NextResponse.json(
                { code: 'TENANT_LACKS_CHATWOOT',
                  error: 'El tenant no tiene una cuenta de Chatwoot asociada. '
                       + 'Esto puede suceder sólo si el provisioning inicial falló '
                       + 'en el paso 3; en ese caso recrea el tenant.' },
                { status: 409 },
            );
        }

        // webhookSecret puede no existir si el hub original fue creado sin
        // Telegram; regenerar uno nuevo y persistir en este mismo request.
        const webhookUrl = hub.webhookUrl
            || `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/api/webhooks/nexus-sync`;
        const webhookSecret = hub.webhookSecret || crypto.randomBytes(32).toString('hex');

        const actor: TelegramActor = {
            kind: 'user',
            id: session.user.id,
            email: user?.email ?? null,
        };

        const result = await addTelegramChannelToTenant({
            tenantId: tenant.id,
            tenantName: tenant.nombre,
            chatwootAccountId: hub.chatwootAccountId,
            chatwootApiToken: decrypt(hub.hubApiToken),
            botName,
            botToken,
            webhookUrl,
            webhookSecret,
            actor,
        });

        if (!result.ok) {
            const status =
                result.code === 'TELEGRAM_INBOX_ERROR' ? 500 :
                result.code === 'TELEGRAM_BOTNAME_INVALID' ? 422 :
                result.code === 'TELEGRAM_BOTTOKEN_INVALID' ? 422 :
                422;
            return NextResponse.json(
                { code: result.code, error: result.message },
                { status },
            );
        }

        return NextResponse.json({
            success: true,
            state: result.state,
            telegramInboxId: result.telegramInboxId,
            telegramChannelId: result.telegramChannelId,
            hubConfigId: result.hubConfigId,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error inesperado';
        return NextResponse.json({ code: 'UNEXPECTED', error: message }, { status: 500 });
    }
}
