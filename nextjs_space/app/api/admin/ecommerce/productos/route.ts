export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, getServerSession } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search');

  const where: any = { tenantId: session.user.tenantId };

  if (search) {
    where.OR = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.catalogoItem.findMany({
      where,
      skip,
      take: limit,
      orderBy: { fechaCreacion: 'desc' },
      include: {
        category: { select: { name: true } },
        _count: { select: { variants: true, reviews: true } },
      }
    }),
    prisma.catalogoItem.count({ where }),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    nombre,
    descripcion,
    sku,
    tipo,
    precioBase,
    moneda,
    categoriaFiscal,
    categoriaId,
    slug,
    precioComparativo,
    peso,
    largo,
    ancho,
    alto,
    marca,
    estadoProducto,
    tipoEntrega,
    minOrderQty,
    maxOrderQty,
    seoTitle,
    seoDescription,
    inventarioPublico,
    media,
    categorias,
    etiquetas,
  } = body;

  if (!nombre || precioBase === undefined) {
    return NextResponse.json({ error: "nombre y precioBase son requeridos" }, { status: 400 });
  }

  const item = await prisma.catalogoItem.create({
    data: {
      tenantId: session.user.tenantId,
      nombre,
      descripcion,
      sku,
      tipo: tipo || 'producto',
      precioBase,
      moneda: moneda || 'EUR',
      categoriaFiscal: categoriaFiscal || 'general',
      categoryId: categoriaId || null,
      slug,
      precioComparativo,
      peso,
      largo,
      ancho,
      alto,
      marca,
      estadoProducto,
      tipoEntrega,
      minOrderQty: minOrderQty || 1,
      maxOrderQty,
      seoTitle,
      seoDescription,
      inventarioPublico: inventarioPublico || 0,
      media,
      categorias: categorias || [],
      etiquetas: etiquetas || [],
    }
  });

  return NextResponse.json({ success: true, item });
}
