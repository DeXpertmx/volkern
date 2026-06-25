export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { parseInmueble } from "@/lib/real-estate/property-helpers";
import { applyRateLimit, RATE_LIMIT_ACTIONS } from "@/lib/rate-limit-middleware";

/**
 * GET /api/public/real-estate/properties
 * 
 * Listado público de propiedades inmobiliarias con filtros.
 * Se autentica mediante ?slug=<tenantSlug> para identificar al tenant.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Resolver tenant
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
    } else if (tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Se requiere slug del tenant" },
        { status: 400 }
      );
    }

    // 2. Rate limiting
    const rateLimitReq = new NextRequest(req.url, {
      headers: { "x-tenant-id": tenantId },
    });
    const rateLimitResult = await applyRateLimit(rateLimitReq, {
      action: RATE_LIMIT_ACTIONS.API_MINUTE,
      customLimit: 120,
    });
    if (rateLimitResult) return rateLimitResult;

    // 3. Parsear filtros
    const operationType = searchParams.get("operation") || undefined;
    const propertyType = searchParams.get("type") || undefined;
    const city = searchParams.get("city") || undefined;
    const minPrice = parseInt(searchParams.get("minPrice") || "0");
    const maxPrice = parseInt(searchParams.get("maxPrice") || "999999999");
    const bedrooms = parseInt(searchParams.get("bedrooms") || "0");
    const status = searchParams.get("status") || "disponible";
    const featuredParam = searchParams.get("featured");
    const featured = featuredParam === "true" ? true : featuredParam === "false" ? false : undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const sort = searchParams.get("sort") || "createdAt_desc";

    // 4. Consultar con Prisma estándar (evita el proxy $ → globalPrisma)
    const clientTenantId: string = tenantId!;
    const tenantClient = await getTenantDb(clientTenantId);

    return await dbContext.run({ tenantId: clientTenantId, client: tenantClient }, async () => {
      // Fetch all active inmueble properties
      const allProperties = await prisma.catalogoItem.findMany({
        where: {
          tenantId: clientTenantId,
          tipo: "inmueble",
          activo: true,
        },
      });

      // 5. Aplicar filtros en memoria
      const filtered = allProperties.filter((p) => {
        const f = (p.customFieldValues as Record<string, any>) || {};

        // Status
        const itemStatus = f.estado || "disponible";
        if (status && itemStatus !== status) return false;

        // Operation type
        if (operationType && f.tipo_operacion !== operationType) return false;

        // Property type
        if (propertyType && f.tipo_inmueble !== propertyType) return false;

        // City (exact match, originalmente = en SQL)
        if (city) {
          const itemZona = f.zona || "";
          const itemCiudad = f.ciudad || "";
          if (itemZona !== city && itemCiudad !== city) return false;
        }

        // Price range
        if (p.precioBase < minPrice || p.precioBase > maxPrice) return false;

        // Bedrooms
        if (bedrooms > 0) {
          const itemBedrooms = f.habitaciones ? Number(f.habitaciones) : 0;
          if (itemBedrooms < bedrooms) return false;
        }

        // Featured
        if (featured !== undefined) {
          const itemFeatured = f.destacada === true || f.destacada === "true";
          if (itemFeatured !== featured) return false;
        }

        return true;
      });

      // 6. Ordenar en memoria
      const sorted = [...filtered];
      switch (sort) {
        case "precio_asc":
          sorted.sort((a, b) => a.precioBase - b.precioBase);
          break;
        case "precio_desc":
          sorted.sort((a, b) => b.precioBase - a.precioBase);
          break;
        case "superficie_desc":
          sorted.sort((a, b) => {
            const aF = (a.customFieldValues as Record<string, any>) || {};
            const bF = (b.customFieldValues as Record<string, any>) || {};
            const aM2 = aF.superficie_total ? Number(aF.superficie_total) : 0;
            const bM2 = bF.superficie_total ? Number(bF.superficie_total) : 0;
            return bM2 - aM2;
          });
          break;
        case "destacados":
          sorted.sort((a, b) => {
            const aF = (a.customFieldValues as Record<string, any>) || {};
            const bF = (b.customFieldValues as Record<string, any>) || {};
            const aFeatured = aF.destacada === true || aF.destacada === "true" ? 0 : 1;
            const bFeatured = bF.destacada === true || bF.destacada === "true" ? 0 : 1;
            if (aFeatured !== bFeatured) return aFeatured - bFeatured;
            return b.fechaCreacion.getTime() - a.fechaCreacion.getTime();
          });
          break;
        default: // createdAt_desc
          sorted.sort((a, b) => b.fechaCreacion.getTime() - a.fechaCreacion.getTime());
          break;
      }

      // 7. Paginación
      const total = sorted.length;
      const paginated = sorted.slice(offset, offset + limit);

      const mapped = paginated.map((p) => ({
        ...parseInmueble(p),
        media: p.media,
      }));

      return NextResponse.json({
        properties: mapped,
        pagination: {
          limit,
          offset,
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
      });
    });
  } catch (error) {
    console.error("[Real Estate API] Error listing properties:", error);
    return NextResponse.json(
      { error: "Error al obtener propiedades" },
      { status: 500 }
    );
  }
}
