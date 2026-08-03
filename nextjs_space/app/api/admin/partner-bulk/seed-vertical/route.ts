export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { VERTICALS, type Vertical } from '@/lib/plans';
import {
    runSeedVerticalBulk,
    type SeedVerticalActor,
} from '@/lib/provisioning/seed-vertical-bulk';

/**
 * POST /api/admin/partner-bulk/seed-vertical
 *
 * Siembra el "starter pack" de módulos verticales (insurance / real_estate
 * / accounting / general) en N tenants a la vez, con concurrencia=3.
 *
 * Casos de uso:
 *   • CTA "Seed verticals in bulk" del paso Done del wizard
 *     `/admin/partner-onboarding/bulk` — el operator hace 1 click tras
 *     haber creado N tenants y en lugar de entrar a
 *     `/admin/saas/tenants/{id}/modulos` N veces, activa los módulos del
 *     vertical elegido para todos los recién creados.
 *   • Scripts CLI / cron: el devops puede usar este endpoint para
 *     activar verticales en masa tras una migración o un seed inicial.
 *
 * Auth dual (mismo patrón que `/api/admin/partner-bulk`):
 *   1. Cookie session + rol Superadmin.
 *   2. Header `Authorization: Bearer ${CRON_SECRET}` para uso
 *      server-to-server (devops, n8n, GitHub Actions).
 *
 * Headers opcionales:
 *   • `X-Dry-Run: true|1`  → simula el upsert sin tocar BD.
 *
 * Body (JSON):
 *   {
 *     tenantIds: string[],                          // requerido, mínimo 1
 *     vertical: 'insurance' | 'real_estate' |       // requerido
 *               'accounting' | 'general',
 *     modules?: string[],                          // opcional — override
 *                                                    // (default: VERTICAL_DEFINITIONS[vertical].modules)
 *     dryRun?: boolean,                            // default false
 *     concurrency?: number,                        // default 3, cap 1..10
 *   }
 *
 * Respuestas:
 *   200 con `{ ok, dryRun, vertical, total, succeeded, partial, failed,
 *             totalSeeded, totalSkipped, tenants:[...] }`.
 *
 *   400 INVALID_VERTICAL            → vertical no está en VERTICALS.
 *   400 INVALID_TENANT_IDS         → tenantIds vacío o no es array.
 *   400 MISSING_TENANT_FIELDS      → body no trae tenantIds o vertical.
 *   401 UNAUTHORIZED               → sin auth (ni session ni Bearer).
 *   403 FORBIDDEN                  → session sin rol Superadmin.
 *   500 UNEXPECTED                 → algo explotó fuera del try/catch.
 *
 * Idempotente: re-correr el endpoint con los mismos tenantIds + vertical
 * devuelve `ok=true` con `totalSeeded=0` y `totalSkipped=N*modules`, sin
 * duplicar audit entries.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    return handlePost(req);
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
    try {
        // ─── Auth dual ─────────────────────────────────────────────────────
        const auth = await authenticate(req);
        if (!auth.ok) {
            return NextResponse.json(
                { error: auth.error, code: auth.code },
                { status: auth.status },
            );
        }

        // ─── Body parsing ─────────────────────────────────────────────────
        let body: Record<string, unknown>;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: 'Body debe ser JSON con { tenantIds, vertical }' },
                { status: 400 },
            );
        }

        const tenantIdsRaw = body.tenantIds;
        const verticalRaw = body.vertical;
        const modulesRaw = body.modules;

        // ─── Validación de verticales ────────────────────────────────────
        if (typeof verticalRaw !== 'string' || verticalRaw.trim().length === 0) {
            return NextResponse.json(
                { error: 'El campo `vertical` es requerido' },
                { status: 400 },
            );
        }
        const vertical = verticalRaw.trim().toLowerCase();
        if (!(VERTICALS as readonly string[]).includes(vertical)) {
            return NextResponse.json(
                {
                    error: `Vertical inválida. Recibida: ${vertical}. Soportadas: ${VERTICALS.join(', ')}`,
                    code: 'INVALID_VERTICAL',
                },
                { status: 400 },
            );
        }

        // ─── Validación de tenantIds ─────────────────────────────────────
        if (!Array.isArray(tenantIdsRaw) || tenantIdsRaw.length === 0) {
            return NextResponse.json(
                {
                    error: '`tenantIds` debe ser un array con al menos 1 ID de tenant',
                    code: 'INVALID_TENANT_IDS',
                },
                { status: 400 },
            );
        }
        const tenantIds = tenantIdsRaw
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            .map(s => s.trim());
        if (tenantIds.length === 0) {
            return NextResponse.json(
                {
                    error: '`tenantIds` debe ser un array con strings no-vacíos',
                    code: 'INVALID_TENANT_IDS',
                },
                { status: 400 },
            );
        }

        // Cap defensivo
        if (tenantIds.length > 200) {
            return NextResponse.json(
                {
                    error: `Máximo 200 tenantIds por request (recibido: ${tenantIds.length})`,
                    code: 'TOO_MANY_TENANT_IDS',
                },
                { status: 400 },
            );
        }

        // ─── DryRun: X-Dry-Run tiene prioridad si viene seteado ────────────
        // Cualquier valor truthy (true|1) o falsy explícito (false|0) gana;
        // si el header no viene, caemos al body.dryRun. De este modo el
        // operator puede forzar dryRun=false desde la línea de comandos
        // aunque el body diga true (e.g. cancela un script que venía
        // configurado mal).
        const headerDryRunRaw = req.headers.get('x-dry-run')?.toLowerCase().trim();
        const headerDryRunExplicit = headerDryRunRaw === 'true' || headerDryRunRaw === '1'
                                  || headerDryRunRaw === 'false' || headerDryRunRaw === '0';
        const headerDryRunValue = headerDryRunRaw === 'true' || headerDryRunRaw === '1';
        const bodyDryRun = Boolean(body.dryRun);
        const dryRun = headerDryRunExplicit ? headerDryRunValue : bodyDryRun;

        // ─── Módulos custom (opcional) ───────────────────────────────────
        const modules = Array.isArray(modulesRaw)
            ? modulesRaw.filter((m): m is string => typeof m === 'string')
            : undefined;

        // ─── Concurrency (default 3, cap 1..10) ──────────────────────────
        const rawConcurrency = typeof body.concurrency === 'number' && Number.isFinite(body.concurrency)
            ? Math.floor(body.concurrency)
            : 3;

        // ─── Run orchestrator ────────────────────────────────────────────
        // Cast modules a readonly CrmModule[] — el route lo recibimos como
        // string[] genérico del body JSON. La validación real la hace el
        // provisioner (seedTenantModulesFromVertical) que rechaza unknown
        // ids al intentar el upsert.
        const result = await runSeedVerticalBulk({
            tenantIds,
            vertical: vertical as Vertical,
            ...(modules ? { modules: modules as unknown as readonly ('leads' | 'contactos' | 'empresas' | 'pipeline' | 'tareas' | 'analytics' | 'mensajes' | 'citas' | 'catalogo' | 'campanas' | 'email_marketing' | 'cms' | 'builder_premium' | 'automatizaciones' | 'cursos' | 'estudiantes' | 'cotizaciones' | 'contratos' | 'ordenes_venta' | 'pronosticos' | 'scoring' | 'chatbot_whatsapp' | 'integraciones' | 'mi_tarjeta' | 'equipo' | 'configuracion' | 'white_label' | 'custom_domain' | 'whatsapp' | 'meta_integration' | 'sms' | 'telegram' | 'google_calendar' | 'api_access' | 'telefonia' | 'social_manager' | 'rrhh' | 'finanzas' | 'finanzas_consolidado' | 'insurance' | 'calidad' | 'produccion' | 'inventario' | 'proyectos' | 'taskforce' | 'activos' | 'conocimiento' | 'estrategia' | 'conciliacion' | 'logistica' | 'formularios' | 'ads' | 'agency' | 'compliance_pro')[] } : {}),
            dryRun,
            concurrency: rawConcurrency,
            actor: auth.actor,
        });

        return NextResponse.json(result, {
            headers: {
                'X-Seed-Vertical': result.vertical,
                'X-Seed-Total': String(result.total),
                'X-Seed-Succeeded': String(result.succeeded),
                'X-Seed-Partial': String(result.partial),
                'X-Seed-Failed': String(result.failed),
                'X-Seed-Total-Seeded': String(result.totalSeeded),
                'X-Seed-Total-Skipped': String(result.totalSkipped),
                'X-Seed-Dry-Run': String(result.dryRun),
            },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado';
        return NextResponse.json(
            { code: 'UNEXPECTED', error: message },
            { status: 500 },
        );
    }
}

// ─── Helpers internos ────────────────────────────────────────────────────────

interface AuthSuccess { ok: true; actor: SeedVerticalActor }
interface AuthFailure {
    ok: false;
    status: 401 | 403;
    code: 'UNAUTHORIZED' | 'FORBIDDEN';
    error: string;
}

async function authenticate(req: NextRequest): Promise<AuthSuccess | AuthFailure> {
    const authHeader = req.headers.get('authorization')?.trim() ?? '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length).trim();
        const expected = process.env.CRON_SECRET;
        if (expected && token === expected) {
            return { ok: true, actor: { kind: 'system', source: 'cron-secret' } };
        }
        return {
            ok: false,
            status: 401,
            code: 'UNAUTHORIZED',
            error: 'Bearer token inválido. Recarga CRON_SECRET del vault.',
        };
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { ok: false, status: 401, code: 'UNAUTHORIZED', error: 'No autorizado' };
    }
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { role: true },
    });
    if (user?.role?.nombre !== 'Superadmin') {
        return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Acceso denegado' };
    }
    return {
        ok: true,
        actor: { kind: 'user', id: session.user.id, email: user?.email ?? null },
    };
}
