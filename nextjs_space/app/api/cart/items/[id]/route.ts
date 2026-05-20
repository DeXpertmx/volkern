export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { tenant, sessionId, cantidad } = body;

    if (!tenant || !sessionId || cantidad === undefined) {
      return NextResponse.json(
        { error: "tenant, sessionId y cantidad son requeridos" },
        { status: 400 }
      );
    }

    const tenantRecord = await globalPrisma.tenant.findUnique({
      where: { slug: tenant },
      select: { id: true }
    });

    if (!tenantRecord) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const tenantClient = await getTenantDb(tenantRecord.id);

    return await dbContext.run({ tenantId: tenantRecord.id, client: tenantClient }, async () => {
      const cart = await prisma.cart.findFirst({ where: { sessionId } });

      if (!cart) {
        return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });
      }

      const item = await prisma.cartItem.findFirst({
        where: { id: params.id, cartId: cart.id },
        include: { catalogItem: true }
      });

      if (!item) {
        return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
      }

      const maxQty = item.catalogItem?.maxOrderQty || 999;
      const minQty = item.catalogItem?.minOrderQty || 1;
      const newCantidad = Math.max(minQty, Math.min(cantidad, maxQty));

      if (newCantidad <= 0) {
        await prisma.cartItem.delete({ where: { id: params.id } });
      } else {
        await prisma.cartItem.update({
          where: { id: params.id },
          data: { cantidad: newCantidad }
        });
      }

      return NextResponse.json({ success: true });
    });

  } catch (error) {
    console.error("Error actualizando item del carrito:", error);
    return NextResponse.json({ error: "Error al actualizar el carrito" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const tenant = searchParams.get('tenant');
    const sessionId = searchParams.get('sessionId');

    if (!tenant || !sessionId) {
      return NextResponse.json({ error: "tenant y sessionId son requeridos" }, { status: 400 });
    }

    const tenantRecord = await globalPrisma.tenant.findUnique({
      where: { slug: tenant },
      select: { id: true }
    });

    if (!tenantRecord) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const tenantClient = await getTenantDb(tenantRecord.id);

    return await dbContext.run({ tenantId: tenantRecord.id, client: tenantClient }, async () => {
      const cart = await prisma.cart.findFirst({ where: { sessionId } });

      if (!cart) {
        return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });
      }

      await prisma.cartItem.delete({
        where: { id: params.id, cartId: cart.id }
      });

      return NextResponse.json({ success: true });
    });

  } catch (error) {
    console.error("Error eliminando item del carrito:", error);
    return NextResponse.json({ error: "Error al eliminar del carrito" }, { status: 500 });
  }
}
