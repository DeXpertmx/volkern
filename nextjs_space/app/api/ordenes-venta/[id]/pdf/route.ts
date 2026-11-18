export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { generatePdf } from '@/lib/pdf-generator';
import { generateOrdenVentaHTML } from '@/lib/ordenes-venta/orden-pdf';
import { getEffectiveBranding } from '@/lib/branding';
import { getPublicUrl } from '@/lib/s3-public-url';

// GET /api/ordenes-venta/[id]/pdf — Descargar el documento oficial en PDF
export async function GET(request: NextRequest, contextPromise: { params: Promise<{ id: string }> }) {
  const { params } = await contextPromise;
  const { id } = await params;
  try {
    const auth = await authenticateRequest(request, ['deals:read', 'orders:read']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const orden = await prisma.ordenVenta.findFirst({
      where: { id, tenantId: auth.tenant.id },
      include: {
        lead: { select: { id: true, nombre: true, email: true, telefono: true, empresa: true } },
        contact: { select: { id: true, nombre: true, email: true, telefono: true } },
        emisor: {
          select: {
            id: true, razonSocial: true, nombreComercial: true,
            idFiscal: true, tipoIdFiscal: true, pais: true,
            direccion: true, ciudad: true, codigoPostal: true,
            email: true, telefono: true, logoUrl: true,
          },
        },
        items: { orderBy: { orden: 'asc' } },
      },
    });

    if (!orden) {
      return NextResponse.json({ error: 'Orden de venta no encontrada' }, { status: 404 });
    }

    // Marca efectiva del tenant (Identidad Visual → logo_corporativo incluido)
    const branding = await getEffectiveBranding(auth.tenant.id);
    let logoUrl = branding.logoUrl || '/volkern-logo.png';
    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/')) {
      logoUrl = getPublicUrl(logoUrl);
    }

    const pdfBuffer = await generatePdf(generateOrdenVentaHTML(orden, {
      companyName: branding.companyName,
      logoUrl,
    }), {
      format: 'A4',
      margin: { top: '18mm', right: '15mm', bottom: '18mm', left: '15mm' },
      printBackground: true,
    });

    const filename = `${orden.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generando PDF de orden de venta:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
