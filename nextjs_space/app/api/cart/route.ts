export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenant');
    const sessionId = searchParams.get('sessionId');

    if (!tenantSlug || !sessionId) {
      return NextResponse.json({ items: [] });
    }

    const tenant = await globalPrisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const tenantClient = await getTenantDb(tenant.id);

    return await dbContext.run({ tenantId: tenant.id, client: tenantClient }, async () => {
      const cart = await prisma.cart.findFirst({
        where: { sessionId },
        include: {
          items: {
            include: {
              catalogItem: {
                select: {
                  id: true,
                  nombre: true,
                  slug: true,
                  sku: true,
                  precioBase: true,
                  moneda: true,
                  media: true,
                  tipo: true,
                  tipoEntrega: true,
                  inventarioPublico: true,
                  maxOrderQty: true,
                  minOrderQty: true,
                }
              },
              variant: true,
            }
          }
        }
      });

      if (!cart) {
        return NextResponse.json({ items: [] });
      }

      const items = cart.items.map((item) => {
        const product = item.catalogItem;
        const media = product?.media && Array.isArray(product.media)
          ? product.media[0]?.url || product.media[0]?.src || null
          : product?.media && typeof product.media === 'object'
            ? (product.media as any).url || (product.media as any).src || null
            : null;

        return {
          id: item.id,
          catalogoItemId: item.catalogoItemId || '',
          variantId: item.variantId || null,
          nombre: product?.nombre || 'Producto',
          slug: product?.slug || '',
          sku: product?.sku || null,
          precioUnitario: item.precioUnitario,
          cantidad: item.cantidad,
          imagen: item.variant?.imagen || media,
          moneda: product?.moneda || 'EUR',
          maxOrderQty: product?.maxOrderQty || null,
          minOrderQty: product?.minOrderQty || 1,
          tipo: product?.tipo || 'producto',
          tipoEntrega: product?.tipoEntrega || null,
          inventarioPublico: product?.inventarioPublico || 0,
        };
      });

      return NextResponse.json({ items, cartId: cart.id });
    });

  } catch (error) {
    console.error("Error obteniendo carrito:", error);
    return NextResponse.json({ error: "Error al obtener el carrito" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant, sessionId, catalogoItemId, variantId, cantidad = 1 } = body;

    if (!tenant || !sessionId || !catalogoItemId) {
      return NextResponse.json(
        { error: "tenant, sessionId y catalogoItemId son requeridos" },
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
      const product = await prisma.catalogoItem.findUnique({
        where: { id: catalogoItemId },
        select: {
          precioBase: true,
          moneda: true,
          maxOrderQty: true,
          minOrderQty: true,
          inventarioPublico: true,
        }
      });

      if (!product) {
        return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
      }

      let cart = await prisma.cart.findFirst({
        where: { sessionId }
      });

      if (!cart) {
        cart = await prisma.cart.create({
          data: { tenantId: tenantRecord.id, sessionId }
        });
      }

      const existingItem = await prisma.cartItem.findFirst({
        where: { cartId: cart.id, catalogoItemId, variantId: variantId || null }
      });

      if (existingItem) {
        const maxQty = product.maxOrderQty || 999;
        const newCantidad = Math.min(existingItem.cantidad + cantidad, maxQty);

        await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { cantidad: newCantidad }
        });
      } else {
        await prisma.cartItem.create({
          data: {
            cartId: cart.id,
            catalogoItemId,
            variantId: variantId || null,
            cantidad: Math.min(cantidad, product.maxOrderQty || 999),
            precioUnitario: product.precioBase,
          }
        });
      }

      return NextResponse.json({ success: true });
    });

  } catch (error) {
    console.error("Error agregando al carrito:", error);
    return NextResponse.json({ error: "Error al agregar al carrito" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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

      if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      }

      return NextResponse.json({ success: true });
    });

  } catch (error) {
    console.error("Error limpiando carrito:", error);
    return NextResponse.json({ error: "Error al limpiar el carrito" }, { status: 500 });
  }
}
