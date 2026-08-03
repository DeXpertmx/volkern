export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
    parseBulkCsv,
    buildBulkResultCsv,
    type BulkParseError,
} from '@/lib/insurance/csv-bulk';
import {
    runBulkOnboarding,
    generateBulkPassword,
    type BulkActor,
} from '@/lib/provisioning/partner-bulk-runner';

/**
 * POST /api/admin/partner-bulk
 *
 * Crea N tenants en bulk a partir de un CSV, server-side, sin pasar por
 * el wizard web. Pensado para integraciones externas:
 *
 *   • Scripts CLI / cron jobs del superadmin (no necesitan browser).
 *   • Pipelines de sales-ops que reciben listas de nuevos brokers desde
 *     un CRM externo (HubSpot, Pipedrive, etc.) y quieren hacer onboarding
 *     directo sin tener que descargar/pegar un wizard.
 *   • Tools internas tipo n8n que orquestan provisioning de N tenants.
 *
 * Auth dual (cualquiera de las dos):
 *   1. Cookie session + rol Superadmin — para uso humano desde el browser
 *      con ayuda de un script que copia-pega el session cookie (curl --cookie).
 *   2. Header `Authorization: Bearer ${CRON_SECRET}` — para uso server-to-server
 *      (cron job, GitHub Actions, n8n). Funciona incluso cuando no hay sesión.
 *
 * Content-Type (cualquiera):
 *   • `text/csv` o `text/plain`  → body es el CSV crudo.
 *   • `application/json`          → body es `{ csv: "...", dryRun?: bool,
 *                                              concurrency?: number }`.
 *
 * Headers opcionales:
 *   • `X-Dry-Run: true|1`        → simula sin mutar la BD. Equivalente a
 *                                  `dryRun: true` en el body JSON.
 *                                  Tiene prioridad sobre el body si ambos vienen.
 *
 * Body (JSON) — opcional:
 *   {
 *     csv: string,                    // requerido cuando content-type=json
 *     dryRun?: boolean,               // default false
 *     concurrency?: number,           // default 3, cap 10
 *   }
 *
 * Respuestas (éxito, 200):
 *   {
 *     ok: boolean,                    // false si failed > 0
 *     dryRun: boolean,
 *     total: number,
 *     created: number,
 *     simulated: number,
 *     failed: number,
 *     hadUnexpectedErrors: boolean,
 *     report: BulkResultRow[],        // mismo shape que el wizard web
 *     reportCsv: string,              // RFC-4180 + BOM para Excel
 *     parseErrors: BulkParseError[],  // filas del CSV que el parser descartó
 *     emptyRows: number[],            // 1-indexed row numbers de filas vacías
 *     generatedPasswords: Record<number,string>,  // rowNum → password
 *   }
 *
 * Códigos de error:
 *   401 No autorizado (ni session ni CRON_SECRET).
 *   403 Acceso denegado (sesión sin rol Superadmin).
 *   415 Unsupported Media Type (content-type no es csv/text/json).
 *   422 CSV_NO_VALID_ROWS (parseó 0 filas válidas).
 *   500 UNEXPECTED.
 *
 * Side-effects en mode dry-run = false:
 *   • Un `auditLog` por cada tenant creado (vía provisionTenant ya audita).
 *   • Posible creación de canales Telegram si el CSV trae `telegramBotToken`.
 *   • NO cancelación de tenants duplicados (idempotencia cliente):
 *     si un subdominio ya existe, la fila se marca como error con
 *     `errorCode='SUBDOMAIN_TAKEN'` (o el código que devuelva provisionTenant).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    return handlePost(req);
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
    try {
        // ─── Auth dual ─────────────────────────────────────────────────────
        const auth = await authenticateBulkRequest(req);
        if (!auth.ok) {
            return NextResponse.json(
                { error: auth.error, code: auth.code },
                { status: auth.status },
            );
        }

        // ─── Body parsing (con sniff) ─────────────────────────────────────
        const bodyResult = await readCsvBody(req);
        if ('error' in bodyResult) {
            return NextResponse.json({ error: bodyResult.error }, { status: 415 });
        }

        // ─── Dry-run: header tiene prioridad sobre body ───────────────────
        const headerDryRun = req.headers.get('x-dry-run')?.toLowerCase().trim();
        const headerDryRunActive = headerDryRun === 'true' || headerDryRun === '1';
        const bodyDryRun = Boolean((bodyResult as { dryRun?: boolean }).dryRun);
        const dryRun = headerDryRunActive || bodyDryRun;

        const concurrency = (bodyResult as { concurrency?: number }).concurrency ?? 3;

        // ─── Parseo CSV (reutiliza lib/insurance/csv-bulk.ts) ─────────────
        const parsed = parseBulkCsv(bodyResult.csv);
        if (parsed.rows.length === 0) {
            return NextResponse.json(
                {
                    code: 'CSV_NO_VALID_ROWS',
                    errors: parsed.errors,
                    emptyRows: parsed.emptyRows,
                },
                { status: 422 },
            );
        }

        // ─── Auto-generar passwords para filas sin password ──────────────
        const passwords: Record<number, string> = {};
        for (const row of parsed.rows) {
            passwords[row.rowNum] = row.password?.trim() || generateBulkPassword();
        }

        const result = await runBulkOnboarding({
            rows: parsed.rows,
            autoGeneratedPasswords: passwords,
            dryRun,
            concurrency,
            actor: auth.actor,
        });

        const reportCsv = buildBulkResultCsv(result.report);

        return NextResponse.json(
            {
                ok: result.ok,
                dryRun: result.dryRun,
                total: result.total,
                created: result.created,
                simulated: result.simulated,
                failed: result.failed,
                hadUnexpectedErrors: result.hadUnexpectedErrors,
                report: result.report,
                reportCsv,
                parseErrors: parsed.errors,
                emptyRows: parsed.emptyRows,
                generatedPasswords: passwords,
            },
            {
                headers: {
                    'X-Bulk-Total': String(result.total),
                    'X-Bulk-Created': String(result.created),
                    'X-Bulk-Simulated': String(result.simulated),
                    'X-Bulk-Failed': String(result.failed),
                    'X-Bulk-Dry-Run': String(result.dryRun),
                    'X-Bulk-Contains-Generated-Passwords': String(
                        Object.values(passwords).some(p => p.length >= 8),
                    ),
                },
            },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error inesperado';
        return NextResponse.json(
            { code: 'UNEXPECTED', error: message },
            { status: 500 },
        );
    }
}

// ─── Helpers internos ────────────────────────────────────────────────────────

interface AuthSuccess {
    ok: true;
    actor: BulkActor;
}
interface AuthFailure {
    ok: false;
    status: 401 | 403;
    code: 'UNAUTHORIZED' | 'FORBIDDEN';
    error: string;
}

/**
 * Autentica el request por CUALQUIERA de los dos paths:
 *   1. session cookie con rol Superadmin (next-auth).
 *   2. Header `Authorization: Bearer ${CRON_SECRET}` — usado por scripts
 *      externos y cron jobs.
 *
 * El path Bearer es independiente de NODE_ENV: si CRON_SECRET está
 * configurado, vale. Si no, 401.
 * (Difiere del patrón `/api/cron/*` que sólo lo activa en producción;
 * aquí queremos que los scripts de staging/dev también funcionen.)
 */
async function authenticateBulkRequest(req: NextRequest): Promise<AuthSuccess | AuthFailure> {
    const authHeader = req.headers.get('authorization')?.trim() ?? '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length).trim();
        const expected = process.env.CRON_SECRET;
        if (expected && token === expected) {
            return {
                ok: true,
                actor: { kind: 'system', source: 'cron-secret' },
            };
        }
        // Bearer presente pero inválido: NO caer al session path.
        return {
            ok: false,
            status: 401,
            code: 'UNAUTHORIZED',
            error: 'Bearer token inválido. Recarga CRON_SECRET del vault.',
        };
    }

    // Path con sesión next-auth.
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

interface BodySuccess {
    csv: string;
    dryRun?: boolean;
    concurrency?: number;
}
interface BodyFailure {
    error: string;
}

/**
 * Lee el body del request respetando el Content-Type. Aceptamos:
 *   • text/csv | text/plain  → body crudo como string.
 *   • application/json       → body con `{ csv: "...", dryRun?, concurrency? }`.
 *
 * Cualquier otro content-type → 415 con mensaje accionable.
 *
 * Cap defensivo: limitar a 5 MB para impedir DoS por upload gigante.
 * (50.000 filas × ~150 bytes ≈ 7.5 MB está en el límite, pero 100.000
 * filas debe ser suficiente para cualquier uso razonable.)
 */
async function readCsvBody(req: NextRequest): Promise<BodySuccess | BodyFailure> {
    const ctHeader = req.headers.get('content-type')?.toLowerCase() ?? '';
    const ct = ctHeader.split(';')[0].trim();

    // Cap defensivo via Content-Length si viene (lectura secuencial hasta el cap).
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength && contentLength > 5 * 1024 * 1024) {
        return { error: 'Body demasiado grande (>5 MB). Divide el CSV en lotes más pequeños.' };
    }

    if (ct === 'text/csv' || ct === 'text/plain') {
        try {
            const csv = await req.text();
            return { csv };
        } catch (err: unknown) {
            return {
                error: `No pude leer el CSV del body: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    if (ct === 'application/json') {
        const parsed: unknown = await req.json().catch(() => ({}));
        if (typeof parsed !== 'object' || parsed === null) {
            return { error: 'Body JSON debe ser un objeto con campo "csv".' };
        }
        const obj = parsed as Record<string, unknown>;
        const csv = typeof obj.csv === 'string' ? obj.csv : '';
        if (!csv) {
            return { error: 'Body JSON debe incluir el campo "csv" con el texto del CSV.' };
        }
        const dryRun = typeof obj.dryRun === 'boolean' ? obj.dryRun : undefined;
        const concurrency =
            typeof obj.concurrency === 'number' && Number.isFinite(obj.concurrency)
                ? obj.concurrency
                : undefined;
        return { csv, dryRun, concurrency };
    }

    return {
        error: `Content-Type "${ct || '(none)'}" no soportado. Use "text/csv", "text/plain" o "application/json" con { "csv": "..." }.`,
    };
}

// (Re-export parseError type for callers who want to typecheck the response.)
export type { BulkParseError };
