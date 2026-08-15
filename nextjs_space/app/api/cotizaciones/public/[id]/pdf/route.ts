export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePdf } from '@/lib/pdf-generator';
import { generateCotizacionHTML } from '@/lib/cotizaciones/cotizacion-pdf';

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const cotizacion = await prisma.cotizacion.findUnique({
      where: { tokenPublico: context.params.id },
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
      where: { id: cotizacion.tenantId },
    });

    const pdfBuffer = await generatePdf(generateCotizacionHTML(cotizacion, tenant), {
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
    console.error('Error generating public PDF:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
