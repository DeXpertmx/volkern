import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { rateLimiter } from '@/lib/rate-limiter'

const RESERVED = new Set(['www', 'app', 'api', 'auth', 'login', 'register', 'dashboard', 'webcreator', 'admin'])

function getSubdomain(host: string): string | null {
  if (!host) return null
  const h = host.replace(/:.*/, '')
  
  if (h === 'localhost') return null
  if (h.endsWith('localhost')) return h.split('.')[0]
  if (h.includes('.volkern.app')) return h.split('.')[0]
  return null
}

const PUBLIC = new Set(['/', '/pricing', '/features', '/about', '/contact', '/login', '/signup', '/booking'])

// Rate limiting: endpoints públicos más expuestos a abuso
const PUBLIC_API_RATE_LIMITED = [
  '/api/chatbot/widget',
  '/api/public/',
  '/api/webhooks/',
  '/api/cotizacion',
  '/api/tarjeta',
  '/api/signup',
  '/api/onboarding',
  '/api/skills',
  '/api/plans',
  '/api/subscriptions',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''
  const subdomain = getSubdomain(host)

  // Extract tenant ID from header
  const xTenantId = request.headers.get('x-tenant-id');
  const apiKey = request.headers.get('x-api-key');

  // Subdomain handling for root path
  if (pathname === '/' && subdomain && !['www', 'app', 'api'].includes(subdomain)) {
    const token = await getToken({ 
      req: request, 
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.session-token'
    })
    
    if (token) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Public paths - allow through
  if (
    PUBLIC.has(pathname) || 
    pathname.startsWith('/public/') || 
    pathname.startsWith('/auth/') || 
    pathname.startsWith('/booking/') || 
    pathname.startsWith('/embed/') ||
    pathname.startsWith('/tarjeta/') ||
    pathname.startsWith('/p/')
  ) {
    return NextResponse.next()
  }



  // Redirect root path without subdomain to landing (if needed) or landing page
  // (Assuming / is already the landing page)


  // Allow .well-known paths (AI plugin discovery, etc.)
  if (pathname.startsWith('/.well-known/')) {
    return NextResponse.next()
  }

  // Check if it's an API route that requires no auth
  if (pathname.startsWith('/api/')) {
    // Rate limiting para endpoints públicos expuestos (basado en IP, sin tenant)
    const needsRateLimit = PUBLIC_API_RATE_LIMITED.some(prefix =>
      pathname.startsWith(prefix)
    )
    
    if (needsRateLimit) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                 request.headers.get('x-real-ip') ||
                 'anonymous'
      const result = await rateLimiter.checkLimit(`ip:${ip}`, 'api_request_minute', 30)
      
      if (!result.allowed) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: `Demasiadas solicitudes. Límite: ${result.limit} por minuto. Reintenta en ${Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)}s.`,
            code: 'RATE_LIMIT_EXCEEDED',
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(result.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': result.resetAt.toISOString(),
              'Retry-After': String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
            },
          }
        )
      }
    }

    // Allow webhooks, public API, and auth routes
    if (
      pathname.includes('/webhooks/') ||
      pathname.includes('/public/') ||
      pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/public/') ||
      pathname.startsWith('/api/signup') ||
      pathname.startsWith('/api/onboarding') ||
      pathname.startsWith('/api/configuracion/fiscal') ||
      pathname.startsWith('/api/cotizacion') ||
      pathname.startsWith('/api/tarjeta') ||
      pathname.startsWith('/api/plans') ||
      pathname.startsWith('/api/subscriptions/status') ||
      pathname.startsWith('/api/subscriptions/create') ||
      pathname === '/api/subscriptions' ||
      pathname.startsWith('/api/users/me') ||
      pathname.startsWith('/api/tenant/modules') ||
      pathname.startsWith('/api/notifications') ||
      pathname.startsWith('/api/guide') ||
      pathname.startsWith('/api/skills')
    ) {
      // Set headers for downstream even for public API routes
      const res = NextResponse.next()
      res.headers.set('x-tenant-subdomain', subdomain || '')
      if (xTenantId) {
        res.headers.set('x-tenant-id', xTenantId)
      }
      if (apiKey) {
        res.headers.set('x-api-key', apiKey)
      }
      return res
    }
    // Other API routes need auth - let them through to handler (headers will be set below)
  }

  // Static files and images - allow through
  if (
    pathname.startsWith('/_next/') ||
    pathname.includes('.') ||
    pathname.startsWith('/static/')
  ) {
    return NextResponse.next()
  }

  // Allow dashboard paths but require auth
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/app') || pathname.startsWith('/admin')) {
    const token = await getToken({ 
      req: request, 
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.session-token'
    })
    if (!token) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Set headers for downstream
  const res = NextResponse.next()
  res.headers.set('x-tenant-subdomain', subdomain || '')
  if (xTenantId) {
    res.headers.set('x-tenant-id', xTenantId)
  }
  if (apiKey) {
    res.headers.set('x-api-key', apiKey)
  }
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}