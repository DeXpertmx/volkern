import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'

/**
 * Lookups públicos de slugs (booking y tarjeta digital) con scoping por tenant.
 *
 * Desde la migración `20260828110000_tenant_scoped_slugs`, `bookingSlug` y
 * `urlUnica` son únicos POR TENANT (`@@unique([tenantId, slug])`), no globales:
 * dos tenants pueden usar el mismo slug sin conflicto.
 *
 * Estrategia de resolución:
 *   1. Si la request viene del subdominio del tenant (`x-tenant-subdomain`,
 *      fijado por middleware.ts), se busca primero dentro de ese tenant.
 *   2. Fallback GLOBAL: los QRs ya impresos con slugs de otros tenants (o
 *      accesados desde el apex / dominios custom) siguen resolviendo.
 *
 * Así los QRs existentes nunca se rompen y los nuevos slugs se resuelven
 * primero en el contexto del tenant que los sirve.
 */

type UserQueryArgs = {
  select?: Prisma.UserSelect
  include?: Prisma.UserInclude
}

type CardQueryArgs = {
  select?: Prisma.DigitalCardSelect
  include?: Prisma.DigitalCardInclude
}

async function resolveTenantIdFromSubdomain(
  subdomain: string | null | undefined
): Promise<string | null> {
  if (!subdomain) return null
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain },
    select: { id: true },
  })
  return tenant?.id ?? null
}

export async function findBookingUserBySlug<T extends UserQueryArgs>(
  slug: string,
  subdomain: string | null | undefined,
  args: T
): Promise<Prisma.UserGetPayload<T> | null> {
  const tenantId = await resolveTenantIdFromSubdomain(subdomain)
  if (tenantId) {
    const scoped = await prisma.user.findFirst({
      ...args,
      where: { bookingSlug: slug, tenantId },
    })
    if (scoped) return scoped as Prisma.UserGetPayload<T>
  }
  // Fallback global (QRs impresos antes del scoping por tenant)
  const global = await prisma.user.findFirst({
    ...args,
    where: { bookingSlug: slug },
  })
  return (global as Prisma.UserGetPayload<T>) ?? null
}

export async function findDigitalCardByUrlUnica<T extends CardQueryArgs>(
  urlUnica: string,
  subdomain: string | null | undefined,
  args: T
): Promise<Prisma.DigitalCardGetPayload<T> | null> {
  const tenantId = await resolveTenantIdFromSubdomain(subdomain)
  if (tenantId) {
    const scoped = await prisma.digitalCard.findFirst({
      ...args,
      where: { urlUnica, tenantId },
    })
    if (scoped) return scoped as Prisma.DigitalCardGetPayload<T>
  }
  // Fallback global (QRs impresos antes del scoping por tenant)
  const global = await prisma.digitalCard.findFirst({
    ...args,
    where: { urlUnica },
  })
  return (global as Prisma.DigitalCardGetPayload<T>) ?? null
}

/**
 * Verifica si un alias de tarjeta está disponible para un usuario.
 * Con el scoping por tenant, un alias solo entra en conflicto si otra
 * tarjeta del MISMO tenant lo usa.
 */
export async function isCardAliasAvailable(
  urlUnica: string,
  tenantId: string | null | undefined,
  excludeUserId: string
): Promise<boolean> {
  if (!tenantId) return true
  const existing = await prisma.digitalCard.findFirst({
    where: {
      urlUnica,
      tenantId,
      NOT: { userId: excludeUserId },
    },
    select: { id: true },
  })
  return !existing
}
