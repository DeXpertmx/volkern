export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

// GET /api/public/pages/[slug] - Obtener página pública por slug
// Resuelve el tenant a través del query param ?tenant=<tenantSlug>
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const { searchParams } = new URL(req.url);
    const tenantSlugParam = searchParams.get('tenant');
    const customDomain = searchParams.get('domain');

    // 1. Resolver el TenantId desde la Base de Datos Global
    let tenantId: string | null = null;

    if (tenantSlugParam) {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { slug: tenantSlugParam },
        select: { id: true }
      });
      tenantId = tenant?.id || null;
    }

    // Fallback: buscar por tenantId directo (para compatibilidad)
    if (!tenantId) {
      tenantId = searchParams.get('tenantId');
    }

    // Fallback: buscar la página por dominio personalizado
    if (!tenantId && customDomain) {
      const pageByDomain = await globalPrisma.page.findFirst({
        where: { dominioPersonalizado: customDomain, estado: 'published' },
        select: { id: true, tenantId: true }
      });
      if (pageByDomain?.tenantId) {
        tenantId = pageByDomain.tenantId;
      }
    }

    // Último fallback: buscar la página directamente en la DB global (shared DB)
    if (!tenantId) {
      const pageInGlobal = await globalPrisma.page.findFirst({
        where: { slug, estado: 'published' },
        select: { tenantId: true }
      });
      if (pageInGlobal?.tenantId) {
        tenantId = pageInGlobal.tenantId;
      }
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Página no encontrada" },
        { status: 404 }
      );
    }
    // Estrecho el tipo para poder usarlo dentro del closure asíncrono.
    const tenantIdResuelto: string = tenantId;

    // 2. Ejecutar la consulta en la Base de Datos del Tenant
    const tenantClient = await getTenantDb(tenantId);

    return await dbContext.run({ tenantId, client: tenantClient }, async () => {
      const pagina = await prisma.page.findFirst({
        where: {
          slug: slug,
          estado: "published",
        },
      });

      // BD compartida: una página publicada de OTRO tenant no debe servirse
      // bajo este (fuga entre tenants). Las globales (tenantId null) sí.
      if (pagina && pagina.tenantId !== null && pagina.tenantId !== tenantIdResuelto) {
        const tenantInfo = await globalPrisma.tenant.findUnique({
          where: { id: tenantIdResuelto },
          select: { dbUrl: true },
        });
        if (!tenantInfo?.dbUrl) {
          return NextResponse.json(
            { error: "Página no encontrada o no publicada" },
            { status: 404 }
          );
        }
      }

      if (!pagina) {
        return NextResponse.json(
          { error: "Página no encontrada o no publicada" },
          { status: 404 }
        );
      }

      // Incrementar contador de vistas
      await prisma.page.update({
        where: { id: pagina.id },
        data: { vistas: { increment: 1 } },
      });

      return NextResponse.json(pagina);
    });

  } catch (error) {
    console.error("Error obteniendo página pública:", error);
    return NextResponse.json(
      { error: "Error al obtener la página" },
      { status: 500 }
    );
  }
}
