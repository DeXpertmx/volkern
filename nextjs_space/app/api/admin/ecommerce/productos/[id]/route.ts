export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, getServerSession } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const item = await prisma.catalogoItem.findFirst({
    where: { id: params.id, tenantId: session.user.tenantId },
    include: {
      category: true,
      variants: true,
      reviews: true,
      tasaImpuesto: true,
    }
  });

  if (!item) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const existing = await prisma.catalogoItem.findFirst({
    where: { id: params.id, tenantId: session.user.tenantId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const updated = await prisma.catalogoItem.update({
    where: { id: params.id },
    data: {
      ...body,
      media: body.media !== undefined ? body.media : existing.media,
      categorias: body.categorias !== undefined ? body.categorias : existing.categorias,
      etiquetas: body.etiquetas !== undefined ? body.etiquetas : existing.etiquetas,
      relatedProducts: body.relatedProducts !== undefined ? body.relatedProducts : existing.relatedProducts,
    }
  });

  return NextResponse.json({ success: true, item: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.catalogoItem.findFirst({
    where: { id: params.id, tenantId: session.user.tenantId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  await prisma.catalogoItem.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
