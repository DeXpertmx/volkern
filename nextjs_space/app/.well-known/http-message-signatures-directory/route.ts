export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { webBotAuthJwks } from '@/lib/seo/web-bot-auth'

/**
 * /.well-known/http-message-signatures-directory — Web Bot Auth
 * (draft-meunier-http-message-signatures-directory).
 *
 * Publica el JWKS con la clave pública Ed25519 de Volkern para que
 * los receptores puedan verificar las firmas de las requests que
 * Volkern envía como bot/agente.
 */
export async function GET() {
  const jwks = webBotAuthJwks()

  return NextResponse.json(jwks, {
    status: 200,
    headers: {
      'Content-Type': 'application/http-message-signatures-directory+json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
