export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePdf } from '@/lib/pdf-generator';
import { authenticateRequest } from '@/lib/api-key-auth';
import { generateCotizacionHTML } from '@/lib/cotizaciones/cotizacion-pdf';
import { getEffectiveBranding } from '@/lib/branding';
import { getPublicUrl } from '@/lib/s3-public-url';

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(request, ['cotizaciones:read']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: context.params.id,
        tenantId: auth.tenant.id,
      },
      include: {
        deal: true,
        lead: true,
        items: true,
      },
    });

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenant.id },
    });

    const branding = await getEffectiveBranding(auth.tenant.id)
    let logoUrl = branding.logoUrl || ''
    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('/')) {
      logoUrl = getPublicUrl(logoUrl)
    }

    const pdfBuffer = await generatePdf(generateCotizacionHTML(cotizacion, tenant, {
      logoUrl,
      companyName: branding.companyName || tenant?.nombre,
    }), {
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      printBackground: true,
    });

    const filename = `${cotizacion.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
