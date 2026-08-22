import { redirect } from 'next/navigation'

/**
 * Redirección de compatibilidad: Cloudflare sirve /.well-known/security.txt
 * con `Policy: https://volkern.app/security-policy`. La página canónica es
 * /security; este alias evita que el enlace de la política dé 404.
 */
export default function SecurityPolicyAlias() {
  redirect('/security')
}
