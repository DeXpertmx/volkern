export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ valid: false })
    }

    // Buscar usuario con este token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(), // Token no expirado
        },
      },
    })

    return NextResponse.json({ valid: !!user })
  } catch (error) {
    console.error('Error al validar token:', error)
    return NextResponse.json({ valid: false })
  }
}
