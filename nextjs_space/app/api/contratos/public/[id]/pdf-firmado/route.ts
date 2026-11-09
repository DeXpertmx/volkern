export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * GET /api/contratos/public/[id]/pdf-firmado
 * Devuelve el PDF ya firmado (el que LibreSign devuelve en el webhook) si
 * existe una SignatureRequest firmada con documento, o 404 si aún no hay.
 */
export async function GET(request: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.id },
      select: {
        id: true,
        numero: true,
        firmadoPorCliente: true,
        signatureRequests: {
          where: { status: 'signed', signedPdfBase64: { not: null } },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { signedPdfBase64: true, completedAt: true },
        },
      },
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404, headers: publicHeaders() });
    }

    const signed = contrato.signatureRequests[0];
    if (!signed?.signedPdfBase64) {
      return NextResponse.json(
        { error: 'Aún no hay un PDF firmado disponible para este contrato' },
        { status: 404, headers: publicHeaders() },
      );
    }

    const pdfBuffer = Buffer.from(signed.signedPdfBase64, 'base64');
    if (pdfBuffer.length === 0) {
      return NextResponse.json({ error: 'El PDF firmado está vacío' }, { status: 500, headers: publicHeaders() });
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${contrato.numero}-firmado.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
        ...publicHeaders(),
      },
    });
  } catch (error) {
    console.error('Error sirviendo PDF firmado del contrato:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500, headers: publicHeaders() });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicHeaders() });
}
