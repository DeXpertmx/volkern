export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { logger } from '@/lib/logger';
import { encryptPortalCredentials, isPortalCryptoConfigured } from '@/lib/portals/crypto';
import {
  conexionDTO,
  generarFeedToken,
  normalizarConfig,
  normalizarFrecuencia,
} from '@/lib/portals/connections';
import { getAdapter } from '@/lib/portals/registry';

/**
 * PATCH /api/portal-connections/[key]
 *
 * Actualiza una conexión existente. Campos:
 *   enabled, config, syncFrequencyMinutes, credentials, revokeFeedToken,
 *   rotateFeedToken
 *
 * `credentials: null` borra las credenciales; un objeto las reemplaza (cifradas).
 * Los tokens del feed se rotan o revocan explícitamente, nunca solos.
 */
export const PATCH = withTenantAuth(async (req, auth, { params }: { params: Promise<{ key: string }> }) => {
  const tenantId = auth.tenant!.id;
  const { key: portalKey } = await params;

  const adapter = getAdapter(portalKey);
  if (!adapter) {
    return NextResponse.json({ error: 'Portal no soportado' }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => null)) as Record<string, any> | null;
    if (!body) {
      return NextResponse.json({ error: 'Cuerpo JSON requerido' }, { status: 400 });
    }

    const existing = await prisma.portalConnection.findUnique({
      where: { tenantId_portalKey: { tenantId, portalKey } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'La conexión no existe' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (body.enabled !== undefined) data.enabled = body.enabled === true;

    if (body.config !== undefined) {
      // Mezcla con lo guardado: el panel solo edita ubicación y URL base y no
      // debe borrar los mapeos de tipo configurados por API.
      const previo = normalizarConfig(existing.config);
      const nuevo = normalizarConfig(body.config);
      const config = {
        ...previo,
        ...nuevo,
        defaults: { ...previo.defaults, ...nuevo.defaults },
        typeMap: Object.keys(nuevo.typeMap || {}).length > 0 ? nuevo.typeMap : previo.typeMap,
      };
      const check = adapter.validateConfig(config);
      if (!check.valid) {
        return NextResponse.json(
          { error: 'Configuración incompleta', errors: check.errors },
          { status: 400 }
        );
      }
      data.config = config;
    }

    if (body.syncFrequencyMinutes !== undefined) {
      data.syncFrequencyMinutes = normalizarFrecuencia(
        body.syncFrequencyMinutes,
        existing.syncFrequencyMinutes
      );
    }

    if (body.credentials !== undefined) {
      if (body.credentials === null) {
        data.credentialsEnc = null;
      } else {
        if (typeof body.credentials !== 'object' || Array.isArray(body.credentials)) {
          return NextResponse.json({ error: 'credentials debe ser un objeto' }, { status: 400 });
        }
        if (!isPortalCryptoConfigured()) {
          return NextResponse.json(
            { error: 'Falta PORTAL_ENCRYPTION_KEY en el servidor: no se pueden guardar credenciales.' },
            { status: 503 }
          );
        }
        data.credentialsEnc = encryptPortalCredentials(body.credentials);
      }
    }

    if (body.rotateFeedToken === true) {
      if (adapter.mode !== 'pull') {
        return NextResponse.json(
          { error: 'Este portal no usa feed público' },
          { status: 400 }
        );
      }
      data.feedToken = generarFeedToken();
      data.feedTokenRevokedAt = null;
    } else if (body.revokeFeedToken === true) {
      if (!existing.feedToken) {
        return NextResponse.json({ error: 'La conexión no tiene feed token' }, { status: 400 });
      }
      data.feedTokenRevokedAt = new Date();
      data.enabled = false;
    }

    const connection = await prisma.portalConnection.update({
      where: { tenantId_portalKey: { tenantId, portalKey } },
      data: data as any,
    });

    return NextResponse.json(conexionDTO(connection));
  } catch (error) {
    logger.error({ err: error, portalKey }, '[portals] Error actualizando conexión');
    return NextResponse.json({ error: 'Error al actualizar la conexión' }, { status: 500 });
  }
}, ['real-estate:write']);
