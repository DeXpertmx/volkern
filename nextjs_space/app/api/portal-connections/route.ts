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
import { PORTALES_DISPONIBLES, getAdapter } from '@/lib/portals/registry';

/**
 * GET /api/portal-connections
 *
 * Devuelve los portales soportados cruzados con las conexiones de la cuenta.
 * Las credenciales NUNCA salen: solo `hasCredentials`.
 */
export const GET = withTenantAuth(async (_req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    const connections = await prisma.portalConnection.findMany({ where: { tenantId } });
    const porPortal = new Map(connections.map((c) => [c.portalKey, c]));

    const conteos = await prisma.portalPublication.groupBy({
      by: ['portalKey', 'status'],
      where: { tenantId },
      _count: { _all: true },
    });

    const stats: Record<string, Record<string, number>> = {};
    for (const fila of conteos) {
      stats[fila.portalKey] = stats[fila.portalKey] || {};
      stats[fila.portalKey][fila.status] = fila._count._all;
    }

    const portales = PORTALES_DISPONIBLES.map((portal) => {
      const connection = porPortal.get(portal.key);
      return {
        ...portal,
        ...(connection
          ? conexionDTO(connection)
          : {
              portalKey: portal.key,
              enabled: false,
              config: normalizarConfig({}),
              syncFrequencyMinutes: 360,
              hasCredentials: false,
              feedUrl: null,
              feedTokenRevoked: false,
              cryptoConfigured: isPortalCryptoConfigured(),
              lastSyncAt: null,
              lastSuccessAt: null,
              lastError: null,
              consecutiveFailures: 0,
            }),
        stats: stats[portal.key] || {},
      };
    });

    return NextResponse.json({ portales, cryptoConfigured: isPortalCryptoConfigured() });
  } catch (error) {
    logger.error({ err: error }, '[portals] Error listando conexiones');
    return NextResponse.json({ error: 'Error al listar las conexiones de portal' }, { status: 500 });
  }
}, ['real-estate:read']);

/**
 * POST /api/portal-connections
 *
 * Crea (o reemplaza la configuración de) la conexión de un portal.
 * body: { portalKey, config?, syncFrequencyMinutes?, enabled?, credentials? }
 */
export const POST = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo JSON requerido' }, { status: 400 });
    }

    const portalKey = String((body as any).portalKey || '');
    const adapter = getAdapter(portalKey);
    if (!adapter) {
      return NextResponse.json(
        { error: `Portal no soportado. Válidos: ${PORTALES_DISPONIBLES.map((p) => p.key).join(', ')}` },
        { status: 400 }
      );
    }

    const config = normalizarConfig((body as any).config);
    const configCheck = adapter.validateConfig(config);
    if (!configCheck.valid) {
      return NextResponse.json(
        { error: 'Configuración incompleta', errors: configCheck.errors },
        { status: 400 }
      );
    }

    let credentialsEnc: string | undefined;
    const credentials = (body as any).credentials;
    if (credentials !== undefined && credentials !== null) {
      if (typeof credentials !== 'object' || Array.isArray(credentials)) {
        return NextResponse.json({ error: 'credentials debe ser un objeto' }, { status: 400 });
      }
      if (!isPortalCryptoConfigured()) {
        return NextResponse.json(
          { error: 'Falta PORTAL_ENCRYPTION_KEY en el servidor: no se pueden guardar credenciales.' },
          { status: 503 }
        );
      }
      credentialsEnc = encryptPortalCredentials(credentials);
    }

    const existing = await prisma.portalConnection.findUnique({
      where: { tenantId_portalKey: { tenantId, portalKey } },
    });

    const connection = await prisma.portalConnection.upsert({
      where: { tenantId_portalKey: { tenantId, portalKey } },
      create: {
        tenantId,
        portalKey,
        enabled: (body as any).enabled === true,
        config,
        syncFrequencyMinutes: normalizarFrecuencia((body as any).syncFrequencyMinutes),
        credentialsEnc,
        feedToken: adapter.mode === 'pull' ? generarFeedToken() : null,
      },
      update: {
        ...(existing && (body as any).enabled !== undefined
          ? { enabled: (body as any).enabled === true }
          : {}),
        config,
        syncFrequencyMinutes: normalizarFrecuencia(
          (body as any).syncFrequencyMinutes,
          existing?.syncFrequencyMinutes ?? 360
        ),
        ...(credentialsEnc ? { credentialsEnc } : {}),
        // Un token revocado no se regenera solo: se rota explícitamente.
        ...(!existing && adapter.mode === 'pull' ? { feedToken: generarFeedToken() } : {}),
      },
    });

    return NextResponse.json(conexionDTO(connection), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, '[portals] Error guardando conexión');
    return NextResponse.json({ error: 'Error al guardar la conexión de portal' }, { status: 500 });
  }
}, ['real-estate:write']);
