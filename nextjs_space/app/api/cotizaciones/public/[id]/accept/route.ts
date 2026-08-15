export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withPublicTenant } from '@/lib/api-key-auth'

const publicHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * La aceptación pública directa queda deshabilitada.
 * La cotización debe pasar por /verification y /verification/verify para
 * demostrar que el cliente controla el email o WhatsApp registrado.
 */
export const POST = withPublicTenant(async () => {
  return NextResponse.json(
    {
      error: 'La aceptación requiere un código de verificación enviado al email o WhatsApp registrado',
      verificationRequired: true,
    },
    { status: 428, headers: publicHeaders },
  )
})

export async function OPTIONS() {
  return NextResponse.json({}, { headers: publicHeaders })
}
