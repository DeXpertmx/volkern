export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const { searchParams } = new URL(req.url);
    const tenantSlugParam = searchParams.get('tenant');
    const tenantIdParam = searchParams.get('tenantId');

    let tenantId: string | null = null;

    if (tenantSlugParam) {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { slug: tenantSlugParam },
        select: { id: true }
      });
      tenantId = tenant?.id || null;
    }

    if (!tenantId && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant o tenantId es requerido" },
        { status: 400 }
      );
    }

    const tenantClient = await getTenantDb(tenantId);

    return await dbContext.run({ tenantId, client: tenantClient }, async () => {
      const product = await prisma.catalogoItem.findFirst({
        where: {
          slug,
          activo: true,
        },
        include: {
          category: {
            select: { id: true, name: true, slug: true }
          },
          tasaImpuesto: true,
          variants: {
            where: { activo: true },
            orderBy: { fechaCreacion: 'asc' },
          },
          reviews: {
            where: { aprobado: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              contact: {
                select: { nombre: true, email: true }
              }
            }
          },
        },
      });

      if (!product) {
        return NextResponse.json(
          { error: "Producto no encontrado" },
          { status: 404 }
        );
      }

      let relatedProducts: any[] = [];
      if (product.relatedProducts && product.relatedProducts.length > 0) {
        relatedProducts = await prisma.catalogoItem.findMany({
          where: {
            id: { in: product.relatedProducts },
            activo: true,
          },
          select: {
            id: true,
            nombre: true,
            slug: true,
            precioBase: true,
            precioComparativo: true,
            moneda: true,
            media: true,
            marca: true,
            promedioRating: true,
          },
          take: 4,
        });
      } else if (product.categoryId) {
        relatedProducts = await prisma.catalogoItem.findMany({
          where: {
            categoryId: product.categoryId,
            activo: true,
            id: { not: product.id },
          },
          select: {
            id: true,
            nombre: true,
            slug: true,
            precioBase: true,
            precioComparativo: true,
            moneda: true,
            media: true,
            marca: true,
            promedioRating: true,
          },
          take: 4,
        });
      }

      return NextResponse.json({
        ...product,
        relatedProducts,
      });
    });

  } catch (error) {
    console.error("Error obteniendo producto:", error);
    return NextResponse.json(
      { error: "Error al obtener el producto" },
      { status: 500 }
    );
  }
}
