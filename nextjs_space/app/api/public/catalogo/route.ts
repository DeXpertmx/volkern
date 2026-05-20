export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
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
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const search = searchParams.get('search');
      const categoria = searchParams.get('categoria');
      const marca = searchParams.get('marca');
      const tipo = searchParams.get('tipo');
      const minPrice = searchParams.get('minPrice');
      const maxPrice = searchParams.get('maxPrice');
      const soloDestacados = searchParams.get('destacados') === 'true';
      const soloConStock = searchParams.get('conStock') === 'true';
      const orderBy = searchParams.get('orderBy') || 'fechaCreacion';
      const orderDir = searchParams.get('orderDir') || 'desc';

      const where: any = { activo: true };

      if (search) {
        where.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { descripcion: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { marca: { contains: search, mode: 'insensitive' } },
          { etiquetas: { has: search } },
        ];
      }

      if (categoria) {
        where.category = { slug: categoria };
      }

      if (marca) {
        where.marca = marca;
      }

      if (tipo) {
        where.tipo = tipo;
      }

      if (minPrice || maxPrice) {
        where.precioBase = {};
        if (minPrice) where.precioBase.gte = parseFloat(minPrice);
        if (maxPrice) where.precioBase.lte = parseFloat(maxPrice);
      }

      if (soloDestacados) {
        where.destacado = true;
      }

      if (soloConStock) {
        where.OR = where.OR || [];
        where.AND = [
          ...(where.OR ? [{ OR: where.OR }] : []),
          {
            OR: [
              { tipo: 'servicio' },
              { tipoEntrega: 'digital' },
              { inventarioPublico: { gt: 0 } },
            ],
          },
        ];
        delete where.OR;
      }

      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        prisma.catalogoItem.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [orderBy]: orderDir },
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            slug: true,
            sku: true,
            tipo: true,
            precioBase: true,
            precioComparativo: true,
            moneda: true,
            media: true,
            categorias: true,
            etiquetas: true,
            marca: true,
            estadoProducto: true,
            tipoEntrega: true,
            destacado: true,
            activo: true,
            inventarioPublico: true,
            promedioRating: true,
            totalReviews: true,
            minOrderQty: true,
            maxOrderQty: true,
            fechaCreacion: true,
            category: {
              select: { id: true, name: true, slug: true }
            },
            variants: {
              where: { activo: true },
              select: {
                id: true,
                sku: true,
                nombre: true,
                precio: true,
                stock: true,
                attributes: true,
                imagen: true,
              }
            },
          },
        }),
        prisma.catalogoItem.count({ where }),
      ]);

      return NextResponse.json({
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    });

  } catch (error) {
    console.error("Error obteniendo catálogo público:", error);
    return NextResponse.json(
      { error: "Error al obtener el catálogo" },
      { status: 500 }
    );
  }
}
