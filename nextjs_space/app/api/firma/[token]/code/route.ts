export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFirmaChannels, sendFirmaCode } from '@/lib/contratos/firma';

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// GET /api/firma/[token]/code - Canales de verificación disponibles (email/WhatsApp)
export async function GET(request: Request, { params }: { params: { token: string } }) {
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.token },
      select: { id: true, tenantId: true, firmadoPorCliente: true },
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404, headers: publicHeaders() });
    }

    const channels = await getFirmaChannels(contrato.id, contrato.tenantId);
    return NextResponse.json({ channels, firmado: contrato.firmadoPorCliente }, { headers: publicHeaders() });
  } catch (error) {
    console.error('Error consultando canales de firma:', error);
    return NextResponse.json(
      { error: 'No se pudieron consultar los canales de verificación' },
      { status: 500, headers: publicHeaders() },
    );
  }
}

// POST /api/firma/[token]/code - Enviar código de verificación por el canal elegido
export async function POST(request: Request, { params }: { params: { token: string } }) {
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.token },
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404, headers: publicHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const result = await sendFirmaCode({
      contratoId: contrato.id,
      tenantId: contrato.tenantId,
      channel: body.channel || 'email',
      email: body.email || null,
      telefono: body.telefono || null,
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
