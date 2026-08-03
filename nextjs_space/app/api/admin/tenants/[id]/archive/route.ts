export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { archiveTenant, type ArchiveActor } from '@/lib/provisioning/tenant-archiver';

/**
 * POST /api/admin/tenants/{id}/archive
 *
 * Archiva un partner tenant. Marca estado='archived', suspende el hub de
 * Nexus, revoca tokens de canales, congela el dominio de email y envía un
 * email de despedida al billingEmail (o al primer admin del tenant).
 *
 * Auth: Superadmin (mismo patrón que /admin/tenants/[id]/{features,modules,telegram}).
 *
 * Body:
 *   {
 *     reason: string,            // ej. "requested_by_partner", "non_payment"
 *     sendGoodbyeEmail?: boolean,// default true
 *     dryRun?: boolean           // default false
 *   }
 *
 * Respuestas:
 *   200 { ok: true, archivedAt, steps: [...], goodbyeEmail: { to, messageId } }
 *   200 { ok: false, ... } cuando pasos secundarios fallaron pero el tenant
 *       ya quedó archived (el caller decide si rollback).
 *   401 / 403 / 404 / 409 / 500 según el caso.
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

        const body = await req.json().catch(() => ({}));
        const reason = String(body?.reason ?? '').trim();
        if (!reason || reason.length < 3) {
            return NextResponse.json(
                { error: 'reason es requerido (mínimo 3 caracteres)' },
                { status: 400 },
            );
        }
        const sendGoodbyeEmail = body?.sendGoodbyeEmail !== false;
        const dryRun = Boolean(body?.dryRun);

        const actor: ArchiveActor = {
            kind: 'user',
            id: session.user.id,
            email: user?.email ?? null,
        };

        const result = await archiveTenant({
            tenantId: params.id,
            reason,
            sendGoodbyeEmail,
            dryRun,
            actor,
        });

        if (result.error) {
            const status =
                result.error.code === 'TENANT_NOT_FOUND' ? 404 :
                result.error.code === 'ALREADY_ARCHIVED' ? 409 :
                result.error.code === 'TENANT_UPDATE_FAILED' ? 500 :
                500;
            return NextResponse.json(
                { code: result.error.code, error: result.error.message },
                { status },
            );
        }

        return NextResponse.json(result, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error inesperado';
        return NextResponse.json({ code: 'UNEXPECTED', error: message }, { status: 500 });
    }
}
