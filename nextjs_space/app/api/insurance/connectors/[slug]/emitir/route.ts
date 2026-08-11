export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateConnector,
  resolveConnectorTenant,
  connectorErrorToResponse,
} from '@/lib/insurance/connectors/api-auth';
import { emitir_poliza_en_aseguradora } from '@/lib/insurance/connectors-skills';

/**
 * POST /api/insurance/connectors/[slug]/emitir
 *
 * Emite una Poliza interna contra el partner (issuePolicy del connector) y
 * guarda la URL del documento externo en `notas` ([doc:URL]).
 *
 * Body:
 *   - tenantId (obligatorio con Bearer CRON_SECRET)
 *   - polizaId (obligatorio) — póliza interna a emitir
 *   - dryRun?           — true = solo simulada, no toca la BD (default false)
 *   - fechaInicio?      — override de fecha de inicio de la emisión
 *   - notas?            — notas que se envían al partner
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

    if (!body.polizaId || typeof body.polizaId !== 'string') {
      return NextResponse.json(
        { error: 'polizaId es obligatorio (la póliza interna a emitir).', code: 'VALIDATION' },
        { status: 400 },
      );
    }

    const result = await emitir_poliza_en_aseguradora({
      slug: params.slug,
      tenantId,
      polizaId: body.polizaId,
      dryRun: body.dryRun === true || body.dryRun === 'true',
      fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : undefined,
      notas: body.notas,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const mapped = connectorErrorToResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
