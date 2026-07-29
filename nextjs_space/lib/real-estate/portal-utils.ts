import { globalPrisma } from '@/lib/db';

export async function resolveTenantBySlug(slug: string) {
  const bySlug = await globalPrisma.tenant.findUnique({
    where: { slug },
  });

  if (bySlug) return bySlug;

  // If no tenant matches by slug, check if this is a custom portalSlug
  const config = await globalPrisma.configuracion.findFirst({
    where: { clave: 'portalSlug', valor: slug },
    select: { tenantId: true },
  });

  if (!config?.tenantId) return null;

  return globalPrisma.tenant.findUnique({
    where: { id: config.tenantId },
  });
}

export async function resolveTenantByCustomDomain(domain: string) {
  const config = await globalPrisma.configuracion.findFirst({
    where: { clave: 'portalCustomDomain', valor: domain },
    select: { tenantId: true },
  });

  if (!config?.tenantId) return null;

  return globalPrisma.tenant.findUnique({
    where: { id: config.tenantId },
    select: { id: true, slug: true, nombre: true },
  });
}
