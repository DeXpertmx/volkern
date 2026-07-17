import { Metadata } from 'next';
import { globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { resolveTenantBySlug } from '@/lib/real-estate/portal-utils';
import PageClient from './PageClient';
import { notFound } from 'next/navigation';

// Habilitar ISR (Revalidar cada 60 segundos)
export const revalidate = 60;

interface PageProps {
  params: {
    tenantSlug: string;
    pageSlug: string;
  };
}

/**
 * Generar Metadatos Dinámicos para SEO
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await getPageData(params.tenantSlug, params.pageSlug);
  
  if (!page) return { title: 'Página no encontrada' };

  return {
    title: page.metaTitulo ?? page.titulo,
    description: page.metaDescripcion ?? page.descripcion,
    keywords: page.metaKeywords ?? undefined,
    openGraph: {
      title: (page.metaTitulo ?? page.titulo) as any,
      description: (page.metaDescripcion ?? page.descripcion) as any,
      images: page.metaImagen ? [{ url: page.metaImagen }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: (page.metaTitulo ?? page.titulo) as any,
      description: (page.metaDescripcion ?? page.descripcion) as any,
      images: page.metaImagen ? [page.metaImagen] : [],
    },
  };
}

/**
 * Helper para obtener datos de la página (Server Side)
 */
async function getPageData(tenantSlug: string, pageSlug: string) {
  const tenant = await resolveTenantBySlug(tenantSlug);

  if (!tenant) return null;

  const { client: tenantClient } = await getTenantDb(tenant.id);
  
  return await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
    return await tenantClient.page.findFirst({
      where: {
        slug: pageSlug,
        estado: "published",
      },
    });
  });
}

export default async function PublicPage({ params }: PageProps) {
  const page = await getPageData(params.tenantSlug, params.pageSlug);

  if (!page) {
    notFound();
  }

  const isGrapes = (page.contenido as any)?.format === 'grapesjs';

  return (
    <>
      {/* Inyectar Scripts y Estilos Críticos en el Servidor */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;0,800;0,900;1,700;1,800;1,900&display=swap" />
      {isGrapes && page.cssPersonalizado && (
        <style dangerouslySetInnerHTML={{ __html: page.cssPersonalizado }} />
      )}
      {!isGrapes && (
        <link rel="stylesheet" href="https://unpkg.com/tailwindcss@3.4.1/dist/tailwind.min.css" />
      )}
      {page.scriptsHead && (
        <div dangerouslySetInnerHTML={{ __html: page.scriptsHead }} />
      )}

      <PageClient page={page} />

      {page.scriptsBody && (
        <div dangerouslySetInnerHTML={{ __html: page.scriptsBody }} />
      )}
    </>
  );
}
