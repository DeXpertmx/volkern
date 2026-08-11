export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  createSiniestro,
  listSiniestros,
  type CreateSiniestroInput,
  type EstadoSiniestro,
} from '@/lib/skills/siniestros-skills';

/**
 * POST /api/insurance/siniestros
 * GET  /api/insurance/siniestros
 *
 * Auth dual (mismo patrón que /api/admin/partner-bulk, sin dry-run):
 *   1. Bearer CRON_SECRET (header Authorization) — requiere tenantId en body.
 *      Para uso server-to-server: scripts de migración, ingesta masiva, n8n/Make.
 *   2. Session de next-auth — usa el tenantId del usuario autenticado.
 *
 * Por qué ambos: los siniestros también se crean desde flujos automatizados
 * (cuando la aseguradora manda un aviso vía Evolution API o webhook en Fase 5+),
 * no sólo desde la UI. El Bearer es para esos casos.
 */

// ─── Auth helper ────────────────────────────────────────────────────────────

type SiniestrosAuth =
  | { kind: 'bearer'; actor: 'cron-secret' }
  | { kind: 'session'; tenantId: string; userId: string };

async function authenticateSiniestros(
  req: NextRequest,
  body: { tenantId?: string },
): Promise<{ ok: true; auth: SiniestrosAuth } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('authorization') || '';

  // Path 1: Bearer CRON_SECRET
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return { ok: false, status: 500, error: 'CRON_SECRET no configurado en el servidor.' };
    }
    if (token !== expected) {
      return {
        ok: false,
        status: 401,
        error: 'Bearer token inválido. Recarga CRON_SECRET del vault.',
      };
    }
    // CRON_SECRET válido pero requiere tenantId explícito para no mutar global.
    if (!body.tenantId) {
      return {
        ok: false,
        status: 400,
        error:
          'Con Bearer CRON_SECRET el body debe incluir tenantId (no hay sesión de la cual inferirlo).',
      };
    }
    return { ok: true, auth: { kind: 'bearer', actor: 'cron-secret' } };
  }

  // Path 2: Session
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: 'No autorizado. Sin sesión ni Bearer CRON_SECRET.' };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, tenantId: true, role: { select: { nombre: true } } },
  });
  if (!user?.tenantId) {
    return { ok: false, status: 401, error: 'Usuario sin tenantId asociado.' };
  }
  return {
    ok: true,
    auth: { kind: 'session', tenantId: user.tenantId, userId: user.id },
  };
}

function resolveTenantId(auth: SiniestrosAuth, body: { tenantId?: string }): string {
  if (auth.kind === 'bearer') {
    // Ya validado en authenticateSiniestros (lanza 400 si falta).
    return body.tenantId as string;
  }
  return auth.tenantId;
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const authResult = await authenticateSiniestros(req, body);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const tenantId = resolveTenantId(authResult.auth, body);

    const input: CreateSiniestroInput = {
      tenantId,
      polizaId: String(body.polizaId ?? '').trim(),
      descripcion: String(body.descripcion ?? '').trim(),
      fechaSuceso: body.fechaSuceso,
      fechaReporte: body.fechaReporte,
      numeroSiniestro: body.numeroSiniestro,
      montoReclamado: body.montoReclamado,
      deducible: body.deducible,
      moneda: body.moneda,
      clienteId: body.clienteId,
      aseguradoraId: body.aseguradoraId,
      estado: body.estado,
      motivoRechazo: body.motivoRechazo,
      notas: body.notas,
      createdById: authResult.auth.kind === 'session' ? authResult.auth.userId : undefined,
    };

    const result = await createSiniestro(input);

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        siniestro: result.siniestro,
      },
      { status: 201 },
    );
  } catch (error: any) {
    const code = mapErrorToCode(error);
    const status = ['VALIDATION', 'MISSING', 'NOT_FOUND'].includes(code) ? 422 : 500;
    return NextResponse.json(
      { error: error?.message ?? 'Error interno', code },
      { status },
    );
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // GET no trae body; el tenantId viene de query si es Bearer, o de session.
    const url = new URL(req.url);
    const tenantIdFromQuery = url.searchParams.get('tenantId') ?? undefined;

    const authResult = await authenticateSiniestros(req, { tenantId: tenantIdFromQuery });
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const tenantId = resolveTenantId(authResult.auth, { tenantId: tenantIdFromQuery });

    const estado = url.searchParams.get('estado') as EstadoSiniestro | null;
    const result = await listSiniestros({
      tenantId,
      estado: estado ?? undefined,
      clienteId: url.searchParams.get('clienteId') ?? undefined,
      polizaId: url.searchParams.get('polizaId') ?? undefined,
      aseguradoraId: url.searchParams.get('aseguradoraId') ?? undefined,
      page: url.searchParams.get('page') ? Number(url.searchParams.get('page')) : undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Error interno', code: mapErrorToCode(error) },
      { status: 500 },
    );
  }
}

// ─── Mapeo simple de errores a códigos tipados ─────────────────────────────

function mapErrorToCode(error: any): string {
  const msg = String(error?.message ?? '');
  // Reglas específicas por estado PRIMERO — sus mensajes también contienen
  // "obligatori[o/a]" y deben ganar sobre la validación genérica.
  if (msg.includes('motivoRechazo')) return 'INVALID_RULE';
  if (msg.includes('montoIndemnizado')) return 'INVALID_RULE';
  if (msg.includes('no permitida')) return 'INVALID_TRANSITION';
  if (/obligatori[oa]/.test(msg)) return 'VALIDATION';
  if (msg.includes('No se encontró')) return 'NOT_FOUND';
  return 'INTERNAL';
}
