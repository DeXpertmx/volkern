export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendFirmaCode } from '@/lib/contratos/firma';

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// POST /api/firma/[token]/code - Enviar código de verificación al firmante
export async function POST(request: Request, { params }: { params: { token: string } }) {
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.token },
      include: { signatureRequests: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404, headers: publicHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const result = await sendFirmaCode({
      contratoId: contrato.id,
      tenantId: contrato.tenantId,
      email: body.email || null,
    });

    return NextResponse.json(result, { headers: publicHeaders() });
  } catch (error: any) {
    const status = error.status || 500;
    const message = error.message || 'No se pudo enviar el código de verificación';
    const extra = error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {};
    return NextResponse.json({ error: message, ...extra }, { status, headers: publicHeaders() });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicHeaders() });
}
