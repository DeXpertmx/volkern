import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const RESERVED = new Set(['www', 'app', 'api', 'auth', 'login', 'register', 'dashboard', 'webcreator'])

function getSubdomain(host: string): string | null {
  if (!host) return null
  const h = host.replace(/:.*/, '')
  
  if (h === 'localhost') return null
  if (h.endsWith('localhost')) return h.split('.')[0]
  if (h.includes('.volkern.app')) return h.split('.')[0]
  return null
}

const PUBLIC = new Set(['/', '/pricing', '/features', '/about', '/contact'])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''
  const subdomain = getSubdomain(host)

  // Rutas que no necesitan tenant
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Sin subdominio = landing pública
  if (!subdomain) {
    if (PUBLIC.has(pathname)) return NextResponse.next()
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/auth/')) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // subdominios reservados
  if (RESERVED.has(subdomain)) {
    return NextResponse.next()
  }

  // Pages que siempre permiten acceso
  const isAuthOrRoot = pathname === '/' || pathname.startsWith('/auth/')

  // Solo verificar token si no es auth page
  const token = isAuthOrRoot ? null : await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  // No autenticado → login
  if (!token && !pathname.startsWith('/auth/')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Autenticado en auth page → dashboard
  if (token && pathname.startsWith('/auth/')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Autenticado en raíz → dashboard
  if (token && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Validar cruzadasimplificada (solo si hay token)
  if (token && (token.tenantSubdomain as string) !== subdomain) {
    console.warn(`[Seguridad] ${token.email} de ${token.tenantSubdomain} → ${subdomain}`)
    return NextResponse.redirect(new URL('/auth/login?error=tenant_mismatch', request.url))
  }

  // Continuar con header
  const res = NextResponse.next()
  res.headers.set('x-tenant-subdomain', subdomain)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}