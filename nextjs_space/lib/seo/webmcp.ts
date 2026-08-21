/**
 * WebMCP — utilidades para exponer tools de Volkern a agentes del navegador.
 *
 * - searchStaticPages: búsqueda pura sobre las rutas públicas estáticas (usada
 *   por GET /api/public/search, sin tocar la BD).
 */

export interface PublicPageHit {
  url: string
  title: string
  description: string
}

export const STATIC_PAGES: { path: string; title: string; description: string }[] = [
  { path: '/', title: 'Volkern — Infraestructura Soberana para tu Empresa', description: 'Unifica Marketing, Ventas y Operaciones con IA propia y datos protegidos.' },
  { path: '/precios', title: 'Precios', description: 'Planes y precios de Volkern.' },
  { path: '/soluciones', title: 'Soluciones', description: 'Soluciones de Volkern por módulo y vertical.' },
  { path: '/ecosistema', title: 'Ecosistema', description: 'Ecosistema de Volkern e integraciones.' },
  { path: '/signup', title: 'Registro', description: 'Crea tu cuenta en Volkern.' },
  { path: '/booking', title: 'Agendar cita', description: 'Agenda una cita con un agente de Volkern.' },
  { path: '/privacy', title: 'Aviso de privacidad', description: 'Aviso de privacidad de Volkern.' },
  { path: '/terms', title: 'Términos y condiciones', description: 'Términos y condiciones de Volkern.' },
]

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/$/, '')

/** Búsqueda pura sobre las rutas estáticas. Devuelve hits ordenados por relevancia (posición). */
export function searchStaticPages(query: string): PublicPageHit[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []

  const hits: PublicPageHit[] = []
  for (const p of STATIC_PAGES) {
    if (`${p.path} ${p.title} ${p.description}`.toLowerCase().includes(q)) {
      hits.push({ url: `${APP_URL}${p.path}`, title: p.title, description: p.description })
    }
  }
  return hits
}
