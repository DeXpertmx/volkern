/**
 * Volkern Real Estate — API de Sincronización MLS Internacional
 *
 * Endpoint dedicado para integración con MLS Internacional y otros
 * portales que necesitan sincronización bidireccional.
 *
 * POST /api/real-estate/sync
 *   Body: { previousIds: string[], format?: 'json' | 'xml' }
 *   Response: SyncDelta { added, updated, removed, total, lastSyncAt }
 *
 * GET  /api/real-estate/sync?format=json&status=disponible
 *   Response: MLSFeed completo
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getProperties } from '@/lib/real-estate/property-helpers';
import { generateMLSJsonFeed, generateSyncDelta, getMLSJsonFilename } from '@/lib/real-estate/exporters/json-exporter';
import { generateIdealistaFeed, getIdealistaFilename } from '@/lib/real-estate/exporters/xml-exporter';
import { generateFotocasaCSV, getFotocasaFilename } from '@/lib/real-estate/exporters/csv-exporter';

// ─── GET: Feed completo (compatible con MLS Internacional) ────────────────────

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const status = searchParams.get('status') || undefined;
    const operationType = searchParams.get('operationType') || undefined;
    const limit = Math.min(Number(searchParams.get('limit')) || 10000, 50000);

    const tenantId = auth.tenant!.id;

    // El feed sólo incluye lo marcado para portales.
    const { properties: todas } = await getProperties(tenantId, {
      status,
      operationType,
      limit,
    });
    const properties = todas.filter((p) => p.publicableEnPortales);

    if (format === 'xml') {
      const xmlContent = generateIdealistaFeed(properties, {
        tenantName: auth.tenant!.nombre,
        tenantEmail: auth.user?.email || 'info@volkern.app',
      });
      return new NextResponse(xmlContent, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="${getIdealistaFilename()}"`,
        },
      });
    }

    if (format === 'csv') {
      const csvContent = generateFotocasaCSV(properties);
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${getFotocasaFilename()}"`,
        },
      });
    }

    // Default: JSON MLS
    const jsonContent = generateMLSJsonFeed(properties, {
      tenantName: auth.tenant!.nombre,
      tenantEmail: auth.user?.email || 'info@volkern.app',
      portalUrl: auth.tenant?.slug
        ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/p/${auth.tenant.slug}`
        : process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app',
    });

    return new NextResponse(jsonContent, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `inline; filename="${getMLSJsonFilename()}"`,
      },
    });
  } catch (error: any) {
    console.error('[RealEstate Sync GET] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener feed de propiedades' },
      { status: 500 }
    );
  }
}, ['real-estate:read']);

// ─── POST: Sincronización delta ──────────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const {
      previousIds = [] as string[],
      format = 'json',
      status,
      operationType,
    } = body;

    if (!Array.isArray(previousIds)) {
      return NextResponse.json(
        { error: 'previousIds debe ser un array de strings' },
        { status: 400 }
      );
    }

    const tenantId = auth.tenant!.id;

    // Obtener propiedades activas marcadas para portales
    const { properties: todas } = await getProperties(tenantId, {
      status,
      operationType,
      limit: 50000,
    });
    const properties = todas.filter((p) => p.publicableEnPortales);
    const total = properties.length;

    const feedOptions = {
      tenantName: auth.tenant!.nombre,
      tenantEmail: auth.user?.email || 'info@volkern.app',
      portalUrl: auth.tenant?.slug
        ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/p/${auth.tenant.slug}`
        : process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app',
    };

    // Generar delta de sincronización
    let delta;

    if (format === 'xml') {
      // Para XML: devolvemos feed completo + metadatos de delta
      const xmlContent = generateIdealistaFeed(properties, {
        tenantName: feedOptions.tenantName,
        tenantEmail: feedOptions.tenantEmail,
      });
      const currentIds = new Set(properties.map(p => p.id));
      const previousSet = new Set(previousIds);
      const removedIds = previousIds.filter(id => !currentIds.has(id));

      return NextResponse.json({
        feed: xmlContent,
        delta: {
          added: properties.filter(p => !previousSet.has(p.id)).length,
          updated: properties.filter(p => previousSet.has(p.id)).length,
          removed: removedIds,
          removedCount: removedIds.length,
          total,
          lastSyncAt: new Date().toISOString(),
        },
        format: 'xml',
      });
    }

    if (format === 'csv') {
      // CSV: devolvemos contenido CSV + metadatos de delta
      const csvContent = generateFotocasaCSV(properties);
      const currentIds = new Set(properties.map(p => p.id));
      const previousSet = new Set(previousIds);
      const removedIds = previousIds.filter(id => !currentIds.has(id));

      return NextResponse.json({
        feed: csvContent,
        delta: {
          added: properties.filter(p => !previousSet.has(p.id)).length,
          updated: properties.filter(p => previousSet.has(p.id)).length,
          removed: removedIds,
          removedCount: removedIds.length,
          total,
          lastSyncAt: new Date().toISOString(),
        },
        format: 'csv',
      });
    }

    // Default JSON: delta completo con propiedades
    delta = generateSyncDelta(properties, previousIds, feedOptions);

    return NextResponse.json({
      success: true,
      delta,
      format: 'json',
      tenant: {
        id: auth.tenant!.id,
        name: auth.tenant!.nombre,
        slug: auth.tenant?.slug,
      },
      syncUrl: `/api/real-estate/sync?format=json&t=${Date.now()}`,
    });
  } catch (error: any) {
    console.error('[RealEstate Sync POST] Error:', error);
    return NextResponse.json(
      { error: 'Error al sincronizar propiedades' },
      { status: 500 }
    );
  }
}, ['real-estate:write']);
