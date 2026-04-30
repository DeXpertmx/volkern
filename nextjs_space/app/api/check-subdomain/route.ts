import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const subdomain = searchParams.get('subdomain')

  if (!subdomain) {
    return NextResponse.json({ available: false, error: 'Falta subdominio' }, { status: 400 })
  }

  // Validar formato (solo lowercase, números y guiones)
  const regex = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/
  if (!regex.test(subdomain)) {
    return NextResponse.json({ available: false, error: 'Formato inválido. Solo letras minúsculas, números y guiones.' })
  }

  // Palabras reservadas
  const reserved = ['www', 'app', 'api', 'admin', 'demo', 'auth', 'login', 'register', 'dashboard', 'webcreator']
  if (reserved.includes(subdomain)) {
    return NextResponse.json({ available: false, error: 'Palabra reservada' })
  }

  // Verificar existencia en DB
  const existing = await prisma.tenant.findUnique({
    where: { subdomain }
  })

  return NextResponse.json({ available: !existing })
}