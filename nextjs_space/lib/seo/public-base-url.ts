/**
 * Resuelve la URL pública base de la app en rutas server-side.
 *
 * Dentro del contenedor Docker el `req.url` apunta al host interno
 * (0.0.0.0:3000), así que el orden de precedencia es:
 *
 *   1. NEXTAUTH_URL  — URL pública canónica configurada (https://volkern.app)
 *   2. x-forwarded-proto + x-forwarded-host — dominio real del request cuando
 *      Traefik/Cloudflare reenvían (cubre dominios personalizados)
 *   3. req.url — último recurso (dev local)
 */
export function resolvePublicBaseUrl(req: Request): string {
  const fromEnv = process.env.NEXTAUTH_URL
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '')
  }

  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost = req.headers.get('x-forwarded-host')
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}
