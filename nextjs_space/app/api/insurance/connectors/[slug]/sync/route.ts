export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateConnector,
  resolveConnectorTenant,
  connectorErrorToResponse,
} from '@/lib/insurance/connectors/api-auth';
import { sync_cartera_desde_aseguradora } from '@/lib/insurance/connectors-skills';

/**
 * POST /api/insurance/connectors/[slug]/sync
 *
 * Importa la cartera de una aseguradora partner a las Pólizas internas.
 * Idempotente por numeroPoliza; soporta dry-run (preview sin escribir) y
 * actualizarExistentes (refresh de fechas/prima/estado).
 *
 * Body (todos opcionales salvo indicarse):
 *   - tenantId (obligatorio con Bearer CRON_SECRET)
 *   - tenantContactId?  — limita a las pólizas de ese Contact Volkern
 *   - externalClienteId? — id de cliente en el sistema del partner
 *   - page? / limit?    — paginación (default 1 / 50, max 100)
 *   - dryRun?           — true = preview sin tocar BD (default false)
 *   - actualizarExistentes? — true = refresca pólizas ya importadas
 *
 * Errores tipados (ConnectorError → HTTP): AUTH_FAILED 401, INVALID_INPUT 400,
 * RATE_LIMIT 429, PARTNER_DOWN 502, UNSUPPORTED_CAPABILITY 501, resto 500.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const authResult = await authenticateConnector(req, body.tenantId);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const tenantId = resolveConnectorTenant(authResult.auth, body.tenantId);

    const result = await sync_cartera_desde_aseguradora({
      slug: params.slug,
      tenantId,
      externalClienteId: body.externalClienteId,
      tenantContactId: body.tenantContactId,
      page: body.page !== undefined ? Number(body.page) : undefined,
      limit: body.limit !== undefined ? Number(body.limit) : undefined,
      dryRun: body.dryRun === true || body.dryRun === 'true',
      actualizarExistentes: body.actualizarExistentes === true || body.actualizarExistentes === 'true',
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const mapped = connectorErrorToResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
