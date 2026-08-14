/**
 * Lógica pura de redirección de rutas legacy `/[tenant]/...` del modo
 * multi-tenant con slug en el path (revertido a subdominios).
 *
 * El acceso real usa subdominios (rewrite a /p/ o rutas canónicas). Estas
 * reglas redirigen CUALQUIER URL con el slug del tenant en el path a su
 * canónica con 308, PERO solo cuando el primer segmento NO es una ruta
 * top-level real de la app: /academy/dashboard, /soluciones/marketing y
 * /admin/marketing son canónicas y deben pasar. Los slugs de tenant no
 * colisionan: los nombres reservados (www, app, api, auth, login, register,
 * dashboard, webcreator, admin) y todas las rutas top-level están excluidos.
 *
 * Las 3 reglas, en orden de prioridad:
 *  1. Secciones legacy:  /{slug}/<seccion>/*            → /<seccion>/*
 *  2. Dashboard legacy:  /{slug}/dashboard/*            → /dashboard/*
 *  3. PageSlug legacy:   /{slug}/{page}                 → /p/{slug}/{page}
 */

// Rutas top-level reales de la app. El primer segmento de una URL nunca
// debe redirigirse si coincide con una de estas (es una ruta canónica).
export const TOP_LEVEL = new Set([
  'academy', 'admin', 'api', 'auth', 'booking', 'checkout', 'cita',
  'compliance-pro', 'contrato', 'cotizacion', 'dashboard', 'delete-data',
  'docs', 'ecosistema', 'embed', 'estudiante', 'login', 'marketing',
  'marketing-template-editor', 'member', 'neting', 'p', 'payment', 'portal',
  'precios', 'privacy', 'reembolsos', 'register', 'resolve-payment', 'signup',
  'soluciones', 'tarjeta', 'template-editor', 'terms', 'test-post',
  'verifactu', 'verify', 'webcreator', 'www', 'app',
])

// Secciones que existían como copias legacy dentro de [tenant]/...
export const LEGACY_SECTIONS = [
  'academy', 'booking', 'cita', 'contrato', 'estudiante', 'member',
  'marketing', 'portal', 'tarjeta', 'webcreator',
]

// Sub-rutas legacy sin canónica directa → su sección padre
const LEGACY_PARENT: Record<string, string> = {
  '/support/analytics': '/dashboard/support',
  '/configuracion/accounting': '/dashboard/configuracion',
  '/configuracion/agency': '/dashboard/configuracion',
  // Páginas raíz sin canónica directa (módulos accesibles por hubs)
  '/equality': '/dashboard/perfil',
  '/sales': '/dashboard/sales/billing',
}

export interface LegacyRedirect {
  /** Path canónico de destino (relativo) */
  to: string
}

/**
 * Devuelve el destino de redirección si el pathname coincide con una ruta
 * legacy `/[tenant]/...`, o `null` si es una ruta canónica que debe pasar.
 */
export function resolveLegacyRedirect(pathname: string): LegacyRedirect | null {
  // Solo evaluamos el path (sin query string ni fragmento). El middleware
  // pasa request.nextUrl.pathname (ya sin query), pero la función debe ser
  // robusta si se le pasa una URL completa.
  const p = pathname.split('?')[0].split('#')[0]

  // 1. Secciones legacy: /{slug}/<seccion>/*
  const sectionMatch = p.match(
    new RegExp(`^/([^/]+)/(${LEGACY_SECTIONS.join('|')})(/.*)?$`)
  )
  if (sectionMatch && !TOP_LEVEL.has(sectionMatch[1])) {
    const section = sectionMatch[2]
    const rest = sectionMatch[3] || ''
    return { to: `/${section}${rest}` }
  }

  // 2. Dashboard legacy: /{slug}/dashboard/*
  const dashMatch = p.match(/^\/([^/]+)\/dashboard(\/.*)?$/)
  if (dashMatch && !TOP_LEVEL.has(dashMatch[1])) {
    const rest = dashMatch[2] || ''
    return { to: LEGACY_PARENT[rest] || `/dashboard${rest}` }
  }

  // 3. PageSlug legacy: /{slug}/{page} → /p/{slug}/{page}
  const pageSlugMatch = p.match(/^\/([^/]+)\/([^/]+)$/)
  if (pageSlugMatch && !TOP_LEVEL.has(pageSlugMatch[1])) {
    const [, slug, page] = pageSlugMatch
    return { to: `/p/${slug}/${page}` }
  }

  return null
}
