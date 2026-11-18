export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { logger } from '@/lib/logger';
import { getAdapter } from '@/lib/portals/registry';
import { PortalNotConfiguredError, runPortalSync } from '@/lib/portals/orchestrator';
import { PortalConfigError, PortalFeedError } from '@/lib/portals/types';
import { PortalCryptoError } from '@/lib/portals/crypto';

/**
 * POST /api/portal-connections/[key]/sync
 *
 * Sincronización manual desde el panel. Fuerza la ejecución aunque la conexión
 * esté desactivada: es la forma de probar la configuración antes de activarla.
 */
export const POST = withTenantAuth(async (_req, auth, { params }: { params: Promise<{ key: string }> }) => {
  const tenantId = auth.tenant!.id;
  const { key: portalKey } = await params;

  if (!getAdapter(portalKey)) {
    return NextResponse.json({ error: 'Portal no soportado' }, { status: 400 });
  }

  try {
    const result = await runPortalSync({ tenantId, portalKey, trigger: 'manual' });

    return NextResponse.json({
      ...result,
      // El documento completo no se devuelve por la API: se sirve en /feeds.
      document: undefined,
      documentBytes: result.document ? Buffer.byteLength(result.document, 'utf8') : 0,
    });
  } catch (error) {
    if (error instanceof PortalNotConfiguredError) {
      return NextResponse.json({ error: 'La conexión no está configurada' }, { status: 404 });
    }
    if (error instanceof PortalConfigError) {
      return NextResponse.json(
        { error: error.message, errors: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof PortalCryptoError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof PortalFeedError) {
      return NextResponse.json(
        { error: error.message, errors: error.errors },
        { status: 422 }
      );
    }

    logger.error({ err: error, portalKey }, '[portals] Error en sincronización manual');
    return NextResponse.json({ error: 'Error en la sincronización' }, { status: 500 });
  }
}, ['real-estate:write']);
