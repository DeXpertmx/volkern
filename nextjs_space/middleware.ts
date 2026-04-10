
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // Si no hay token, redirigir al login
    if (!token && !isPublicPath(path)) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }

    // Rutas que requieren permisos específicos (solo para UI, no API)
    // Las rutas de API verifican permisos en sus propios handlers
    if ((path.startsWith('/dashboard') || path.startsWith('/webcreator')) && token) {
      // Aquí podrías agregar lógica adicional si necesitas verificar permisos a nivel de middleware
      // Por ahora, solo verificamos que el usuario esté autenticado
      // Los permisos específicos se verifican en cada página/API
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        
        // Permitir acceso a rutas públicas
        if (isPublicPath(path)) {
          return true
        }
        
        // Requiere autenticación para todas las demás rutas
        return !!token
      },
    },
  }
)

// Helper para identificar rutas públicas
function isPublicPath(path: string): boolean {
  const publicPaths = [
    '/auth/',
    '/signup',
    '/embed/',
    '/tarjeta/',
    '/booking/',       // Calendario público de agendamiento
    '/api/public/',    // Endpoints públicos para embeds (servicios, leads, citas)
    '/api/leads',
    '/api/citas',      // Agregado para autenticación dual (API Keys)
    '/api/catalogo',   // Catálogo - autenticación dual (API Keys)
    '/api/mcp',        // MCP Server - autenticación via API Key
    '/api/skills',     // Skills API - autenticación dual
    '/api/signup',
    '/api/webhooks/',
    '/api/integrations/webhook/',  // Integration Layer webhooks
    '/api/integrations/telephony/webhook', // Telephony webhooks
    '/api/integraciones/google-calendar/sync-all',  // Endpoint para sincronización automática programada
    '/payment/',
    '/_next/',
    '/favicon',
    '/robots',
    '/og-image',
    '/volkern',
    '/p/',             // Public pages
    '/privacy',
    '/terms'
  ]
  
  // Permitir la landing page (ruta raíz exacta)
  if (path === '/') {
    return true
  }
  
  return publicPaths.some(publicPath => path.startsWith(publicPath))
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!api/auth|_next/static|_next/image).*)',
    '/dashboard/:path*',
    '/webcreator/:path*',
  ],
}
