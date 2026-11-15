import { revalidatePath } from 'next/cache';
import { globalPrisma } from '@/lib/db';
import { rutasPortalDeCuenta } from './portal-seo';

/**
 * Revalidación del portal público.
 *
 * Las páginas son ISR: sin esto, una oficina que corrige un precio sigue
 * enseñando el viejo hasta un minuto. Un fallo de revalidación nunca debe hacer
 * fallar el guardado: el dato ya está escrito y la página se refresca sola en
 * el siguiente ciclo.
 */

/** Slug con el que se sirve el portal y su alias opcional (`portalSlug`). */
async function portalDeCuenta(
  tenantId: string
): Promise<{ slug: string; alias: string | null } | null> {
  const tenant = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  if (!tenant?.slug) return null;

  // El portal también responde en el alias: si existe, se invalida igual para
  // que no quede una copia con la marca o el precio viejos.
  const alias = await globalPrisma.configuracion.findFirst({
    where: { tenantId, clave: 'portalSlug' },
    select: { valor: true },
  });

  return { slug: tenant.slug, alias: alias?.valor ?? null };
}

async function invalidarPortal(
  tenantId: string,
  propiedadId?: string | null
): Promise<boolean> {
  const portal = await portalDeCuenta(tenantId);
  if (!portal) return false;

  for (const ruta of rutasPortalDeCuenta({
    ...portal,
    propiedadId: propiedadId || undefined,
  })) {
    revalidatePath(ruta);
  }
  return true;
}

/** Al guardar (o retirar) un inmueble: portada, catálogo y esa ficha. */
export async function revalidarPortalDeInmueble(
  tenantId: string,
  propiedadId?: string | null
): Promise<void> {
  try {
    await invalidarPortal(tenantId, propiedadId);
  } catch (error) {
    console.error('[Portal] No se pudo revalidar el portal:', error);
  }
}

/**
 * Al cambiar la marca: lo anterior más todas las fichas, por patrón de ruta.
 * Next las regenera la próxima vez que alguien las pida, sin recorrer la
 * cartera entera.
 */
export async function revalidarPortalCompleto(tenantId: string): Promise<void> {
  try {
    if (!(await invalidarPortal(tenantId))) return;

    for (const patron of [
      '/p/[tenantSlug]/propiedades/[id]',
      '/p/[tenantSlug]/propiedades/[id]/opengraph-image',
    ]) {
      try {
        revalidatePath(patron, 'page');
      } catch {
        // Algunas rutas de metadatos no admiten invalidación por patrón.
      }
    }
  } catch (error) {
    console.error('[Portal] No se pudo revalidar la marca del portal:', error);
  }
}
