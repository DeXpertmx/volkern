export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getSiniestroById,
  updateEstadoSiniestro,
  type EstadoSiniestro,
} from '@/lib/skills/siniestros-skills';

/**
 * GET   /api/insurance/siniestros/[id]
 * PATCH /api/insurance/siniestros/[id]
 *
 * Auth dual (mismo patrón que /api/insurance/siniestros):
 *   1. Bearer CRON_SECRET
 *   2. Session de next-auth
 *
 * Notas de seguridad:
 *   - El skill getSiniestroById / updateEstadoSiniestro enforza que el
 *     siniestro pertenezca al tenantId — el cliente no puede pasar IDs de
 *     otros tenants porque la query filtra por tenantId.
 *   - PATCH valida la transición de estado dentro del skill antes de tocar
 *     la BD, devolviendo 422 INVALID_TRANSITION si es ilegal.
 */

type SiniestrosAuth =
  | { kind: 'bearer'; actor: 'cron-secret' }
  | { kind: 'session'; tenantId: string; userId: string };

async function authenticateSiniestros(
  req: NextRequest,
  tenantIdFromQuery?: string,
): Promise<{ ok: true; auth: SiniestrosAuth } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('authorization') || '';

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return { ok: false, status: 500, error: 'CRON_SECRET no configurado en el servidor.' };
    }
    if (token !== expected) {
      return { ok: false, status: 401, error: 'Bearer token inválido.' };
    }
    if (!tenantIdFromQuery) {
      return {
        ok: false,
        status: 400,
        error: 'Con Bearer CRON_SECRET el ?tenantId= o body debe indicar el tenant objetivo.',
      };
    }
    return { ok: true, auth: { kind: 'bearer', actor: 'cron-secret' } };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: 'No autorizado.' };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, tenantId: true },
  });
  if (!user?.tenantId) {
    return { ok: false, status: 401, error: 'Usuario sin tenantId.' };
  }
  return { ok: true, auth: { kind: 'session', tenantId: user.tenantId, userId: user.id } };
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  const params = await paramsPromise;
  try {
    const url = new URL(req.url);
    const tenantIdFromQuery = url.searchParams.get('tenantId') ?? undefined;

    const authResult = await authenticateSiniestros(req, tenantIdFromQuery);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const tenantId =
      authResult.auth.kind === 'bearer'
        ? (tenantIdFromQuery as string)
        : authResult.auth.tenantId;

    const result = await getSiniestroById({ tenantId, id: params.id });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = error?.message?.includes('No se encontró') ? 404 : 500;
    return NextResponse.json(
      { error: error?.message ?? 'Error interno', code: mapErrorToCode(error) },
      { status },
    );
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  const params = await paramsPromise;
  try {
    const body = await req.json().catch(() => ({}));
    const authResult = await authenticateSiniestros(req, body.tenantId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const tenantId =
      authResult.auth.kind === 'bearer'
        ? String(body.tenantId)
        : authResult.auth.tenantId;

    if (!body.estado) {
      return NextResponse.json(
        { error: 'estado es obligatorio en PATCH /[id]', code: 'VALIDATION' },
        { status: 400 },
      );
    }

    const result = await updateEstadoSiniestro({
      tenantId,
      id: params.id,
      estado: body.estado as EstadoSiniestro,
      montoIndemnizado: body.montoIndemnizado,
      motivoRechazo: body.motivoRechazo,
      notas: body.notas,
      fechaCierre: body.fechaCierre,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const code = mapErrorToCode(error);
    if (code === 'NOT_FOUND') {
      return NextResponse.json({ error: error.message, code }, { status: 404 });
    }
    if (code === 'INVALID_TRANSITION' || code === 'INVALID_RULE') {
      return NextResponse.json({ error: error.message, code }, { status: 422 });
    }
    if (code === 'VALIDATION') {
      return NextResponse.json({ error: error.message, code }, { status: 422 });
    }
    return NextResponse.json(
      { error: error?.message ?? 'Error interno', code },
      { status: 500 },
    );
  }
}

// ─── Mapeo de errores ───────────────────────────────────────────────────────

function mapErrorToCode(error: any): string {
  const msg = String(error?.message ?? '');
  // Reglas específicas por estado PRIMERO — sus mensajes también contienen
  // "obligatori[o/a]" y deben ganar sobre la validación genérica.
  if (msg.includes('motivoRechazo')) return 'INVALID_RULE';
  if (msg.includes('montoIndemnizado')) return 'INVALID_RULE';
  if (msg.includes('fechaCierre')) return 'INVALID_RULE';
  if (msg.includes('no permitida')) return 'INVALID_TRANSITION';
  if (/obligatori[oa]/.test(msg)) return 'VALIDATION';
  if (msg.includes('No se encontró')) return 'NOT_FOUND';
  return 'INTERNAL';
}
