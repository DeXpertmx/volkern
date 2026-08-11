/**
 * API auth compartida para las rutas REST de conectores de aseguradoras
 * (Fase 5.2): GET /api/insurance/connectors, POST .../[slug]/sync y
 * POST .../[slug]/emitir.
 *
 * Mismo patrón que /api/insurance/siniestros:
 *   1. Bearer CRON_SECRET (header Authorization) — flujos server-to-server:
 *      scripts de migración, ingesta masiva programada, n8n/Make.
 *   2. Session de next-auth — el tenantId se infiere del usuario.
 *
 * También centraliza el mapeo de `ConnectorError` a códigos HTTP para que
 * los tres handlers devuelvan respuestas consistentes.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ConnectorError, type ConnectorErrorCode } from './InsurerConnector';

export type ConnectorAuth =
  | { kind: 'bearer'; actor: 'cron-secret' }
  | { kind: 'session'; tenantId: string; userId: string };

export type ConnectorAuthResult =
  | { ok: true; auth: ConnectorAuth }
  | { ok: false; status: number; error: string };

/**
 * Valida la autenticación de una petición contra un conector.
 * `bodyTenantId` es el tenantId explícito que llega en body/query — obligatorio
 * con Bearer (no hay sesión de la cual inferirlo).
 */
export async function authenticateConnector(
  req: NextRequest,
  bodyTenantId?: string,
): Promise<ConnectorAuthResult> {
  const authHeader = req.headers.get('authorization') || '';

  // Path 1: Bearer CRON_SECRET
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return { ok: false, status: 500, error: 'CRON_SECRET no configurado en el servidor.' };
    }
    if (token !== expected) {
      return { ok: false, status: 401, error: 'Bearer token inválido. Recarga CRON_SECRET del vault.' };
    }
    if (!bodyTenantId) {
      return {
        ok: false,
        status: 400,
        error: 'Con Bearer CRON_SECRET debes indicar el tenantId en el body (no hay sesión de la cual inferirlo).',
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
    select: { id: true, tenantId: true },
  });
  if (!user?.tenantId) {
    return { ok: false, status: 401, error: 'Usuario sin tenantId asociado.' };
  }
  return { ok: true, auth: { kind: 'session', tenantId: user.tenantId, userId: user.id } };
}

/** Resuelve el tenantId efectivo desde la auth + el body (Bearer trae explícito). */
export function resolveConnectorTenant(auth: ConnectorAuth, bodyTenantId?: string): string {
  if (auth.kind === 'bearer') return bodyTenantId as string;
  return auth.tenantId;
}

/** Mapea un ConnectorError (o error genérico) a { status, code, message }. */
export function connectorErrorToResponse(
  error: unknown,
): { status: number; body: { error: string; code: string } } {
  if (error instanceof ConnectorError) {
    return { status: connectorErrorCodeToStatus(error.code), body: { error: error.message, code: error.code } };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 500, body: { error: message, code: 'INTERNAL' } };
}

function connectorErrorCodeToStatus(code: ConnectorErrorCode): number {
  switch (code) {
    case 'AUTH_FAILED':
      return 401;
    case 'INVALID_INPUT':
    case 'INVALID_TAX_ID':
    case 'INVALID_RAMO':
      return 400;
    case 'POLICY_NOT_FOUND':
    case 'POLICY_EXPIRED':
      return 404;
    case 'RATE_LIMIT':
      return 429;
    case 'PARTNER_DOWN':
      return 502;
    case 'UNSUPPORTED_CAPABILITY':
      return 501;
    case 'CLAIM_AMOUNT_EXCEEDS_COVERAGE':
      return 422;
    default:
      return 500;
  }
}
