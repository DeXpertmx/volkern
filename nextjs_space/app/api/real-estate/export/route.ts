/**
 * Volkern Real Estate — Export API
 *
 * Endpoints para exportar propiedades a formatos de portales inmobiliarios.
 *
 * GET /api/real-estate/export?format=xml&tenantId=xxx  → Idealista XML
 * GET /api/real-estate/export?format=csv&tenantId=xxx   → Fotocasa CSV
 * POST /api/real-estate/export/upload → Exportar y subir a S3
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import { getProperties } from '@/lib/real-estate/property-helpers';
import { generateIdealistaFeed, getIdealistaFilename } from '@/lib/real-estate/exporters/xml-exporter';
import { generateFotocasaCSV, getFotocasaFilename } from '@/lib/real-estate/exporters/csv-exporter';
import { generateMLSJsonFeed, getMLSJsonFilename } from '@/lib/real-estate/exporters/json-exporter';
import { uploadFile, getDownloadUrl } from '@/lib/s3';

// ─── GET: Download export ─────────────────────────────────────────────────────

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xml';
    const status = searchParams.get('status') || undefined;
    const operationType = searchParams.get('operationType') || undefined;

    const tenantId = auth.tenant!.id;

    // Obtener todas las propiedades del tenant con filtros opcionales
    const { properties } = await getProperties(tenantId, {
      status,
      operationType,
      limit: 10000,
    });

    if (properties.length === 0) {
      return NextResponse.json(
        { error: 'No hay propiedades para exportar' },
        { status: 404 }
      );
    }

    if (format === 'csv') {
      const csvContent = generateFotocasaCSV(properties);
      const filename = getFotocasaFilename();

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    if (format === 'json') {
      const jsonContent = generateMLSJsonFeed(properties, {          tenantName: auth.tenant!.nombre,
          tenantEmail: auth.user?.email || 'info@volkern.app',
          portalUrl: auth.tenant?.slug
            ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/p/${auth.tenant.slug}`
            : process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app',
        });
      const filename = getMLSJsonFilename();

      return new NextResponse(jsonContent, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: XML Idealista
    const xmlContent = generateIdealistaFeed(properties, {
      tenantName: auth.tenant!.nombre,
      tenantEmail: auth.user?.email || 'info@volkern.app',
    });

    const filename = getIdealistaFilename();

    return new NextResponse(xmlContent, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[RealEstate Export] Error:', error);
    return NextResponse.json(
      { error: 'Error al exportar propiedades' },
      { status: 500 }
    );
  }
}, ['real-estate:read']);

// ─── POST: Export and upload to S3 ─────────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { format = 'xml', status, operationType } = body;

    const tenantId = auth.tenant!.id;

    // Obtener todas las propiedades
    const { properties } = await getProperties(tenantId, {
      status,
      operationType,
      limit: 10000,
    });

    if (properties.length === 0) {
      return NextResponse.json(
        { error: 'No hay propiedades para exportar' },
        { status: 404 }
      );
    }

    let content: string;
    let contentType: string;
    let filename: string;

    if (format === 'csv') {
      content = generateFotocasaCSV(properties);
      contentType = 'text/csv; charset=utf-8';
      filename = getFotocasaFilename();
    } else if (format === 'json') {
      content = generateMLSJsonFeed(properties, {
        tenantName: auth.tenant!.nombre,
        tenantEmail: auth.user?.email || 'info@volkern.app',
        portalUrl: auth.tenant?.slug
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app'}/p/${auth.tenant.slug}`
          : process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app',
      });
      contentType = 'application/json; charset=utf-8';
      filename = getMLSJsonFilename();
    } else {
      content = generateIdealistaFeed(properties, {
        tenantName: auth.tenant!.nombre,
        tenantEmail: auth.user?.email || 'info@volkern.app',
      });
      contentType = 'application/xml; charset=utf-8';
      filename = getIdealistaFilename();
    }

    // Subir a S3
    const s3Key = `exports/${tenantId}/portales/${Date.now()}-${filename}`;
    await uploadFile(Buffer.from(content, 'utf-8'), s3Key, contentType);

    // Generar URL firmada para descarga (7 días de validez)
    const downloadUrl = await getDownloadUrl(s3Key, 7 * 24 * 3600);

    return NextResponse.json({
      success: true,
      filename,
      s3Key,
      downloadUrl,
      totalProperties: properties.length,
      format,
    });
  } catch (error: any) {
    console.error('[RealEstate Export Upload] Error:', error);
    return NextResponse.json(
      { error: 'Error al exportar y subir propiedades' },
      { status: 500 }
    );
  }
}, ['real-estate:write']);
