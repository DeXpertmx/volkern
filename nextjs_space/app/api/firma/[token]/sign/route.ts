export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { signContratoConCodigo } from '@/lib/contratos/firma';

function publicHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// POST /api/firma/[token]/sign - Verificar código y firmar el contrato
export async function POST(request: Request, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.token },
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404, headers: publicHeaders() });
    }

    const body = await request.json();
    const { challengeId, challengeToken, code, nombreFirma } = body;

    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';

    const result = await signContratoConCodigo({
      contratoId: contrato.id,
      tenantId: contrato.tenantId,
      challengeId,
      challengeToken,
      code,
      nombreFirma,
      ip,
    });

    return NextResponse.json({ success: true, ...result }, { headers: publicHeaders() });
  } catch (error: any) {
    const status = error.status || 500;
    const message = error.message || 'Error al firmar el contrato';
    const extra = error.remainingAttempts !== undefined ? { remainingAttempts: error.remainingAttempts } : {};
    return NextResponse.json({ error: message, ...extra }, { status, headers: publicHeaders() });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicHeaders() });
}
