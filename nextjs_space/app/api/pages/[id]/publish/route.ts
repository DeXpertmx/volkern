export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma } from "@/lib/db";
import { withTenantAuth } from "@/lib/api-key-auth";
import { checkFeatureLimit } from "@/lib/subscription";

// POST /api/pages/[id]/publish - Publicar una página
export const POST = withTenantAuth(async (req, auth, params: { id: string }) => {
  try {
    const tenantId = auth.tenant!.id;

    // Verificar si la página ya está publicada antes de chequear el límite.
    // Se trae también tenantId para verificar tenencia (BD compartida).
    const currentPage = await prisma.page.findUnique({
      where: { id: params.id },
      select: { estado: true, tenantId: true }
    })

    // Tenencia (BD compartida): publicar una página ajena solo con conocer su
    // id sería una fuga entre tenants. Con BD aislada la física ya separa.
    if (!currentPage) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }
    const tenantInfo = await globalPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dbUrl: true },
    });
    const esGlobal = currentPage.tenantId === null;
    if (
      !tenantInfo?.dbUrl &&
      currentPage.tenantId !== tenantId &&
      !(auth.user?.role?.nombre === 'Superadmin' && esGlobal)
    ) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    if (currentPage.estado !== 'published') {
      const limitCheck = await checkFeatureLimit(tenantId, 'published_pages', 1)
      if (!limitCheck.allowed) {
        return NextResponse.json(
          { error: `Has alcanzado el límite de ${limitCheck.limit} landing pages publicadas en tu plan actual.` },
          { status: 403 }
        )
      }
    }

    const body = await req.json();
    const { subdominio, dominioPersonalizado, generarEmbed } = body;
    console.log(`POST /api/pages/${params.id}/publish - Received body:`, body);

    // 1. Validar unicidad del subdominio si se proporciona
    if (subdominio) {
      const existingSubdomain = await globalPrisma.pagePublishing.findFirst({
        where: {
          subdominio,
          NOT: { paginaId: params.id }
        }
      });

      if (existingSubdomain) {
        console.warn(`Subdomain already in use: ${subdominio}`);
        return NextResponse.json(
          { error: "Este subdominio ya está en uso por otra página." },
          { status: 400 }
        );
      }
    }

    // 2. Validar unicidad del dominio personalizado si se proporciona
    if (dominioPersonalizado) {
      const existingDomain = await globalPrisma.pagePublishing.findFirst({
        where: {
          dominioPersonalizado,
          NOT: { paginaId: params.id }
        }
      });

      if (existingDomain) {
        console.warn(`Custom domain already in use: ${dominioPersonalizado}`);
        return NextResponse.json(
          { error: "Este dominio personalizado ya está vinculado a otra página." },
          { status: 400 }
        );
      }
    }

    // Realizar operaciones en una transacción para asegurar consistencia
    console.log('Starting transaction for page publishing...');
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar estado de la página a publicado
      const pagina = await tx.page.update({
        where: { id: params.id },
        data: {
          estado: "published",
          publicadoEn: new Date(),
          subdomain: subdominio,
          dominioPersonalizado,
        },
      });

      // Crear o actualizar configuración de publicación
      const publicacion = await tx.pagePublishing.upsert({
        where: { paginaId: params.id },
        update: {
          subdominio,
          subdomainActivo: !!subdominio,
          dominioPersonalizado,
          dominioVerificado: false,
          embedActivo: generarEmbed || false,
          codigoEmbed: generarEmbed
            ? generateEmbedCode(pagina.slug, subdominio)
            : null,
        },
        create: {
          paginaId: params.id,
          subdominio,
          subdomainActivo: !!subdominio,
          dominioPersonalizado,
          dominioVerificado: false,
          embedActivo: generarEmbed || false,
          codigoEmbed: generarEmbed
            ? generateEmbedCode(pagina.slug, subdominio)
            : null,
        },
      });

      return { pagina, publicacion };
    });

    const { pagina, publicacion } = result;
    console.log('Publishing transaction completed successfully.');

    // Obtener slug del tenant para la URL pública
    // En BD aislada, pagina.tenantId puede ser null, usamos el tenantId del contexto auth
    const effectiveTenantId = pagina.tenantId || tenantId;
    const tenantSlugInfo = await globalPrisma.tenant.findUnique({
      where: { id: effectiveTenantId },
      select: { slug: true },
    });
    const tenantSlug = tenantSlugInfo?.slug || effectiveTenantId;

    // Generar URL pública
    const baseUrl = process.env.NEXTAUTH_URL || 'https://volkern.app';
    const urlPublica = `${baseUrl}/p/${tenantSlug}/${pagina.slug}`;

    return NextResponse.json({
      success: true,
      pagina,
      publicacion,
      urlPublica,
      subdominioUrl: subdominio ? `https://${subdominio}.volkern.app` : null,
      dominioUrl: dominioPersonalizado ? `https://${dominioPersonalizado}` : null,
    });
  } catch (error: any) {
    console.error("Error publicando página:", error);
    return NextResponse.json(
      { error: `Error interno al publicar la página: ${error.message || 'Inténtalo de nuevo'}` },
      { status: 500 }
    );
  }
}, ['cms:write']);

// Generar código embed HTML
function generateEmbedCode(slug: string, subdominio?: string): string {
  const url = subdominio
    ? `https://${subdominio}.volkern.app/${slug}`
    : `https://volkern.app/${slug}`;

  return `<!-- Volkern Page Embed -->
<iframe 
  src="${url}" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  style="border:none; min-height: 600px;"
  title="Volkern Page"
></iframe>`;
}
