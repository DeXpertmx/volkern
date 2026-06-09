export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/mobile-login
 * 
 * Endpoint de login para la app Gemma (React Native).
 * Acepta email + password en JSON y devuelve un JWT que la app
 * usa en el header Authorization: Bearer <token>.
 * 
 * El JWT es validado por authenticateRequest() en lib/api-key-auth.ts
 * usando la misma clave CUSTOMER_JWT_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { CustomerAuthService } from '@/lib/auth/customer-auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 },
      )
    }

    // ── Obtener IP y device info para auditoría ──
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const deviceInfo = request.headers.get('user-agent') || undefined

    // ── Autenticar ──
    const result = await CustomerAuthService.login(
      email,
      password,
      deviceInfo,
      ipAddress,
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[MobileLogin] Error:', error.message)

    if (error.message === 'Credenciales inválidas') {
      return NextResponse.json(
        { error: 'Email o contraseña incorrectos' },
        { status: 401 },
      )
    }

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    )
  }
}
