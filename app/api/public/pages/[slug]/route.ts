export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

// GET /api/public/pages/[slug] - Obtener página pública por slug o subdominio
// Este endpoint es especial porque debe resolver el Tenant ANTES de poder consultar la página
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const { searchParams } = new URL(req.url);
    const subdomain = searchParams.get('subdomain');
    const customDomain = searchParams.get('domain');

    // 1. Resolver el TenantId desde la Base de Datos Global
    // Buscamos cuál tenant es dueño de este slug de página o subdominio
    let tenantId: string | null = null;

    if (subdomain) {
      // Intentar encontrar el tenant por su slug (que suele ser el subdominio por defecto)
      const tenant = await globalPrisma.tenant.findUnique({
        where: { slug: subdomain },
        select: { id: true }
      });
      tenantId = tenant?.id || null;
    }

    if (!tenantId) {
      // Si no es por subdominio, buscamos la página en la DB Global para ver a quién pertenece
      // Nota: En migración total, las páginas ya no estarán aquí, pero podemos tener un 
      // mapeo pequeño de 'slug -> tenantId' en la Global DB si es necesario.
      // Por ahora, asumimos que el cliente envía el tenantId o subdominio.
      tenantId = searchParams.get('tenantId');
    }

    if (!tenantId) {
      // Fallback: Buscar en todas las bases de datos es costoso. 
      // Se recomienda que el middleware inyecte el tenantId basado en el Host.
      return NextResponse.json(
        { error: "No se pudo identificar el tenant para esta página pública" },
        { status: 400 }
      );
    }

    // 2. Ejecutar la consulta real en la Base de Datos del Tenant
    const tenantClient = await getTenantDb(tenantId);

    return await dbContext.run({ tenantId, client: tenantClient }, async () => {
      // Ahora 'prisma' apunta a la DB del tenant
      let pagina;
      
      if (subdomain) {
        pagina = await prisma.page.findFirst({
          where: {
            subdomain: subdomain,
            estado: "published",
          },
        });
      } else {
        pagina = await prisma.page.findFirst({
          where: {
            slug: slug,
            estado: "published",
          },
        });
      }

      if (!pagina) {
        return NextResponse.json(
          { error: "Página no encontrada o no publicada en este tenant" },
          { status: 404 }
        );
      }

      // Incrementar contador de vistas de forma aislada
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
