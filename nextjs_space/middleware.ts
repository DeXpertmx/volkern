import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { checkEdgeRateLimit } from '@/lib/edge-rate-limiter'
import {
  PARTNER_RATE_LIMITS,
  getScopeFromPath,
  hashApiKeyEdge,
  extractApiKeyFromHeaders,
} from '@/lib/rate-limit/partner-rate-limit-config'
import { checkPartnerRateLimit } from '@/lib/rate-limit/upstash-edge-rate-limit'

const RESERVED = new Set(['www', 'app', 'api', 'auth', 'login', 'register', 'dashboard', 'webcreator', 'admin'])

function getSubdomain(host: string): string | null {
  if (!host) return null
  const h = host.replace(/:.*/, '')
  
  if (h === 'localhost') return null
  if (h.endsWith('localhost')) return h.split('.')[0]
  if (h.includes('.volkern.app')) return h.split('.')[0]
  return null
}

function isCustomDomain(host: string): boolean {
  if (!host) return false
  const h = host.replace(/:.*/, '').toLowerCase()
  const appHost = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/https?:\/\//, '')
  if (h === 'localhost' || h === appHost) return false
  if (h.endsWith('.localhost')) return false
  if (h.endsWith('.volkern.app') || h.endsWith('.volkern.com')) return false
  return true
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

  // ─── Custom domain resolution ─────────────────────────────────────────
  // Detecta dominios personalizados (no locales, no volkern.app, no subdominios)
  // y reescribe internamente a /p/{tenantSlug}{pathname}
  if (
    isCustomDomain(host) &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/p/') &&
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/.well-known/') &&
    !pathname.match(/\.\w+$/)
  ) {
    try {
      const cleanHost = host.replace(/:.*/, '')
      const resolveUrl = new URL('/api/configuracion/resolve-domain', request.nextUrl.origin)
      resolveUrl.searchParams.set('domain', cleanHost)
      const domainRes = await fetch(resolveUrl.toString(), { signal: AbortSignal.timeout(5000) })
      if (domainRes.ok) {
        const { tenantSlug } = await domainRes.json()
        if (tenantSlug) {
          const rewritten = new URL(request.url)
          // Si es la raíz, redirige a propiedades por defecto
          const targetPath = pathname === '/' ? '/propiedades' : pathname
          rewritten.pathname = `/p/${tenantSlug}${targetPath}`
          return NextResponse.rewrite(rewritten)
        }
      }
    } catch (e) {
      console.error('[middleware] custom domain resolution error:', e)
    }
  }

  // Generate requestId for tracing
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  // Extract tenant ID from header
  const xTenantId = request.headers.get('x-tenant-id');
  const apiKey = request.headers.get('x-api-key');

  // ─── CORS ──────────────────────────────────────────────────────────────
  // La app Gemma se conecta desde otro origen (ej: http://192.168.0.22:3000)
  // y necesita cabeceras CORS para que el navegador permita la respuesta.
  const origin = request.headers.get('origin') || ''
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Tenant-Id, x-request-id',
    'Access-Control-Allow-Credentials': 'true',
  }

  // Responder inmediatamente a OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return NextResponse.json({}, { headers: corsHeaders })
  }

  // Helper: creates response with requestId + CORS headers
  const withHeaders = (res: NextResponse) => {
    res.headers.set('x-request-id', requestId)
    for (const [key, val] of Object.entries(corsHeaders)) {
      res.headers.set(key, val)
    }
    return res
  }

  // Subdomain handling for root path — set header and pass through;
  // the redirect happens server-side in the page component (app/page.tsx)
  // which has reliable session access.
  if (pathname === '/' && subdomain && !['www', 'app', 'api'].includes(subdomain)) {
    const res = NextResponse.next()
    res.headers.set('x-tenant-subdomain', subdomain)
    return withHeaders(res)
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
    return withHeaders(NextResponse.next())
  }

  // ─── Rutas legacy /[tenant]/<seccion>/* (modo subdominio revertido) ──
  // app/[tenant]/<seccion> eran copias del modo multi-tenant con slug en
  // el path (revertido a subdominios). El acceso real usa subdominio
  // (rewrite a /p/ o rutas canónicas). Redirigimos cualquier URL con el
  // slug en el path a la canónica, PERO solo cuando el primer segmento NO
  // es una ruta top-level real de la app: /academy/dashboard,
  // /soluciones/marketing y /admin/marketing son canónicas y deben pasar.
  // Los slugs de tenant no colisionan: los nombres reservados (www, app,
  // api, auth, login, register, dashboard, webcreator, admin) y todas las
  // rutas top-level están excluidos.
  const TOP_LEVEL = new Set([
    'academy', 'admin', 'api', 'auth', 'booking', 'checkout', 'cita',
    'compliance-pro', 'contrato', 'cotizacion', 'dashboard', 'delete-data',
    'docs', 'ecosistema', 'embed', 'estudiante', 'login', 'marketing',
    'marketing-template-editor', 'member', 'neting', 'p', 'payment', 'portal',
    'precios', 'privacy', 'reembolsos', 'register', 'resolve-payment', 'signup',
    'soluciones', 'tarjeta', 'template-editor', 'terms', 'test-post',
    'verifactu', 'verify', 'webcreator', 'www', 'app',
  ])

  const tenantSectionMatch = pathname.match(/^\/([^/]+)\/(academy|booking|cita|contrato|estudiante|member|marketing|portal|tarjeta|webcreator)(\/.*)?$/)
  if (tenantSectionMatch && !TOP_LEVEL.has(tenantSectionMatch[1]) && !PUBLIC.has(pathname)) {
    const section = tenantSectionMatch[2]
    const rest = tenantSectionMatch[3] || ''
    const dest = new URL(`/${section}${rest}`, request.nextUrl.origin)
    return withHeaders(NextResponse.redirect(dest, 308))
  }

  // ─── Rutas legacy /[tenant]/dashboard/* ──────────────────────────────
  // El árbol app/[tenant]/dashboard/... era el mecanismo viejo de
  // multi-tenant (slug del tenant en el path). El flujo actual redirige a
  // /dashboard/... que resuelve el tenant por sesión/subdominio, y varias
  // de esas páginas legacy eran copias viejas SIN features recientes
  // (trato fiscal, retenciones, escaneo de gastos, etc.). Redirigimos
  // cualquier URL con el slug en el path a su canónica para que nadie vea
  // una versión desactualizada. Igual que arriba, el primer segmento no
  // debe ser una ruta top-level (p. ej. /academy/dashboard es canónica).
  const tenantDashMatch = pathname.match(/^\/([^/]+)\/dashboard(\/.*)?$/)
  if (tenantDashMatch && !TOP_LEVEL.has(tenantDashMatch[1])) {
    const rest = tenantDashMatch[2] || ''
    // Sub-rutas legacy sin canónica directa → su sección padre
    const LEGACY_PARENT: Record<string, string> = {
      '/support/analytics': '/dashboard/support',
      '/configuracion/accounting': '/dashboard/configuracion',
      '/configuracion/agency': '/dashboard/configuracion',
      // Páginas raíz sin canónica directa (módulos accesibles por hubs)
      '/equality': '/dashboard/perfil',
      '/sales': '/dashboard/sales/billing',
    }
    const target = LEGACY_PARENT[rest] || `/dashboard${rest}`
    const dest = new URL(target, request.nextUrl.origin)
    return withHeaders(NextResponse.redirect(dest, 308))
  }

  // ─── Rutas legacy /[tenant]/[pageSlug] (páginas públicas por path) ──
  // app/[tenant]/[pageSlug] era la forma vieja de servir páginas públicas
  // del tenant (slug en el path). La canónica es /p/[tenantSlug]/[pageSlug]
  // (favicon dinámico + resolveTenantBySlug). Redirigimos /{slug}/{page}
  // → /p/{slug}/{page} cuando el primer segmento NO es una ruta top-level
  // real de la app (para no capturar /tarjeta/{id}, /booking/{slug}, etc.).
  // Debe ir DESPUÉS de la regla de dashboard para que /{slug}/dashboard
  // caiga en esta y no en /p/.
  const pageSlugMatch = pathname.match(/^\/([^/]+)\/([^/]+)$/)
  if (pageSlugMatch && !TOP_LEVEL.has(pageSlugMatch[1]) && !PUBLIC.has(pathname)) {
    const [, slug, page] = pageSlugMatch
    const dest = new URL(`/p/${slug}/${page}`, request.nextUrl.origin)
    return withHeaders(NextResponse.redirect(dest, 308))
  }

  // Allow .well-known paths (AI plugin discovery, etc.)
  if (pathname.startsWith('/.well-known/')) {
    return withHeaders(NextResponse.next())
  }

  // Check if it's an API route that requires no auth
  if (pathname.startsWith('/api/')) {
    // --- Rate-limit per-API-key (Redis via Upstash) ---
    if (pathname.startsWith('/api/v1/partner/')) {
      const apiKey = extractApiKeyFromHeaders(request.headers);
      if (apiKey) {
        const scope = getScopeFromPath(pathname, request.method);
        const policy = PARTNER_RATE_LIMITS[scope] ?? PARTNER_RATE_LIMITS.default;
        const apiKeyId = await hashApiKeyEdge(apiKey);
        const rl = await checkPartnerRateLimit(apiKeyId, scope, policy);
        if (!rl.allowed) {
          const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
          return NextResponse.json(
            {
              error: rl.error === 'RATE_LIMITER_UNAVAILABLE' ? 'Service Unavailable' : 'Rate limit exceeded',
              message: rl.error === 'RATE_LIMITER_UNAVAILABLE'
                ? 'No se pudo verificar capacidad para esta operación de nóminas. Intenta en 1 minuto.'
                : `Demasiadas solicitudes. Límite: ${rl.limit} req/min por API key (scope=${scope}). Reintenta en ${retryAfter}s.`,
              code: rl.error ?? 'RATE_LIMIT_EXCEEDED',
            },
            {
              status: 429,
              headers: {
                ...corsHeaders,
                'X-RateLimit-Limit': String(rl.limit),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
                'Retry-After': String(retryAfter),
                'x-request-id': requestId,
                'x-rate-limit-scope': scope,
                // Propaga también el apiKeyId hashado en el 429 para que
                // observaciones del SaaS (Datadog/Honeycomb custom headers,
                // logs de error) puedan correlacionar 429 → bucket en Upstash
                // sin requerir una segunda request a GET /api/v1/partner/usage.
                'x-rate-limit-key': apiKeyId,
              },
            }
          );
        }
        const res = NextResponse.next();
        res.headers.set('X-RateLimit-Limit', String(rl.limit));
        res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
        res.headers.set('X-RateLimit-Reset', String(Math.floor(rl.resetAt / 1000)));
        res.headers.set('x-rate-limit-scope', scope);
        // Propaga el apiKeyId (hash SHA-256) para que handlers Partner
        // posteriores como GET /api/v1/partner/usage lo reusen sin re-hash.
        res.headers.set('x-rate-limit-key', apiKeyId);
        res.headers.set('x-tenant-subdomain', subdomain || '');
        if (xTenantId) res.headers.set('x-tenant-id', xTenantId);
        res.headers.set('x-api-key', apiKey);
        return withHeaders(res);
      }
    }
    // Rate limiting para endpoints públicos expuestos (basado en IP, sin tenant)
    const needsRateLimit = PUBLIC_API_RATE_LIMITED.some(prefix =>
      pathname.startsWith(prefix)
    )
    
    if (needsRateLimit) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                 request.headers.get('x-real-ip') ||
                 'anonymous'
      const result = checkEdgeRateLimit(`ip:${ip}`, 30, 60_000)
      
      if (!result.allowed) {
        const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: `Demasiadas solicitudes. Límite: ${result.limit} por minuto. Reintenta en ${retryAfter}s.`,
            code: 'RATE_LIMIT_EXCEEDED',
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(result.limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
              'Retry-After': String(retryAfter),
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
      return withHeaders(res)
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
      // Usar la URL pública en vez de request.url: el standalone de Next.js
      // reconstruye request.url con HOSTNAME=0.0.0.0 y mandaría al login 0.0.0.0:3000
      const loginUrl = new URL('/auth/login', process.env.NEXTAUTH_URL || 'https://volkern.app')
      loginUrl.searchParams.set('callbackUrl', pathname)
      return withHeaders(NextResponse.redirect(loginUrl))
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
  return withHeaders(res)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}