export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { parseInmueble } from "@/lib/real-estate/property-helpers";
import { applyRateLimit, RATE_LIMIT_ACTIONS } from "@/lib/rate-limit-middleware";

/**
 * GET /api/public/real-estate/properties/[id]
 * 
 * Ficha detallada de una propiedad inmobiliaria.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const tenantIdParam = searchParams.get("tenantId");

    let tenantId: string | null = null;

    if (slug) {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      tenantId = tenant?.id || null;
    }

    if (!tenantId && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Se requiere slug del tenant" },
        { status: 400 }
      );
    }

    // Rate limiting
    const rateLimitReq = new NextRequest(req.url, {
      headers: { "x-tenant-id": tenantId },
    });
    const rateLimitResult = await applyRateLimit(rateLimitReq, {
      action: "api_request_minute",
      customLimit: 120,
    });
    if (rateLimitResult) return rateLimitResult;

    const clientTenantId: string = tenantId!;
    const tenantClient = await getTenantDb(clientTenantId);

    return await dbContext.run({ tenantId: clientTenantId, client: tenantClient }, async () => {
      const property = await prisma.catalogoItem.findFirst({
        where: {
          id,
          tenantId: clientTenantId,
          tipo: "inmueble",
          activo: true,
        },
      });

      if (!property) {
        return NextResponse.json(
          { error: "Propiedad no encontrada" },
          { status: 404 }
        );
      }

      // Incrementar vistas
      await prisma.catalogoItem.update({
        where: { id: property.id },
        data: { metadata: { ...(typeof property.metadata === 'object' ? property.metadata : {}), visits: ((property.metadata as any)?.visits || 0) + 1 } },
      });

      return NextResponse.json({
        property: {
          ...parseInmueble(property),
          media: property.media,
          metadata: property.metadata,
        },
      });
    });
  } catch (error) {
    console.error("[Real Estate API] Error getting property:", error);
    return NextResponse.json(
      { error: "Error al obtener la propiedad" },
      { status: 500 }
    );
  }
}
