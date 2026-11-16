/**
 * POST /api/mcp/approvals/[id]/verify-code
 *
 * Valida el código de 6 dígitos enviado al WhatsApp del negocio y, si es
 * correcto, aprueba la solicitud MCP y ejecuta el envío de WhatsApp con la
 * identidad de quien lo pidió.
 *
 * Cuerpo: { code: string }
 *
 * Este endpoint es público (no requiere sesión): el código de autorización es
 * el factor de posesión (quien tiene el WhatsApp del negocio lo recibió) y la
 * página pública /mcp/autorizar/[token] es el factor de conocimiento.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAndExecuteWhatsappAuthCode } from '@/lib/mcp/whatsapp-auth'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const { code } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Falta el código de autorización' },
        { status: 400 }
      )
    }

    // El `id` de la ruta puede ser el whatsappVerificationToken o el approvalId.
    // Si parece un token hex de 48 caracteres, lo tratamos como verificationToken;
    // si no, como approvalId (para compatibilidad).
    const verificationToken = /^[0-9a-f]{48}$/.test(id) ? id : undefined

    const resultado = await verifyAndExecuteWhatsappAuthCode({
      verificationToken: verificationToken || '',
      code: code.trim(),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
    })

    if (!resultado.ok) {
      const status = resultado.error?.includes('expiró')
        ? 410
        : resultado.error?.includes('intento')
          ? 429
          : 400
      return NextResponse.json(
        {
          success: false,
          approved: resultado.approved,
          executed: resultado.executed,
          error: resultado.error,
          approvalId: resultado.approvalId,
        },
        { status }
      )
    }

    return NextResponse.json({
      success: true,
      approved: resultado.approved,
      executed: resultado.executed,
      approvalId: resultado.approvalId,
      result: resultado.result,
    })
  } catch (error) {
    console.error('[MCP verify-code] Error:', error)
    return NextResponse.json(
      { error: 'Error interno validando el código' },
      { status: 500 }
    )
  }
}
