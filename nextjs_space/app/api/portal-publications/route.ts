export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/portal-publications
 *
 * Estado por inmueble y portal. Filtros: `portalKey`, `status`, `limit`,
 * `offset`. El nombre del inmueble se resuelve del registro maestro en una
 * segunda consulta (no hay relación Prisma para no tocar el modelo).
 */
export const GET = withTenantAuth(async (req, auth) => {
  const tenantId = auth.tenant!.id;

  try {
    const url = new URL(req.url);
    const portalKey = url.searchParams.get('portalKey');
    const status = url.searchParams.get('status');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

    const where = {
      tenantId,
      ...(portalKey ? { portalKey } : {}),
      ...(status ? { status } : {}),
    };

    const [total, filas] = await Promise.all([
      prisma.portalPublication.count({ where }),
      prisma.portalPublication.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
    ]);

    const inmuebles = await prisma.catalogoItem.findMany({
      where: { tenantId, id: { in: filas.map((f) => f.propertyId) } },
      select: { id: true, nombre: true },
    });
    const nombres = new Map(inmuebles.map((i) => [i.id, i.nombre]));

    return NextResponse.json({
      total,
      limit,
      offset,
      publicaciones: filas.map((fila) => ({
        id: fila.id,
        propertyId: fila.propertyId,
        propertyName: nombres.get(fila.propertyId) || null,
        portalKey: fila.portalKey,
        externalId: fila.externalId,
        status: fila.status,
        lastDeliveredAt: fila.lastDeliveredAt?.toISOString() ?? null,
        lastError: fila.lastError,
        attempts: fila.attempts,
        updatedAt: fila.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, '[portals] Error listando publicaciones');
    return NextResponse.json({ error: 'Error al listar las publicaciones' }, { status: 500 });
  }
}, ['real-estate:read']);
