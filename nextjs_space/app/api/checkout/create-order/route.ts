export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenant,
      sessionId,
      address,
      shippingMethod,
      shippingCost = 0,
      couponCode,
      couponDiscount = 0,
      paymentMethod,
      notasCliente,
    } = body;

    if (!tenant || !sessionId || !address) {
      return NextResponse.json(
        { error: "tenant, sessionId y address son requeridos" },
        { status: 400 }
      );
    }

    const tenantRecord = await globalPrisma.tenant.findUnique({
      where: { slug: tenant },
      select: { id: true, moneda: true }
    });

    if (!tenantRecord) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const tenantClient = await getTenantDb(tenantRecord.id);

    return await dbContext.run({ tenantId: tenantRecord.id, client: tenantClient }, async () => {
      // Get cart
      const cart = await prisma.cart.findFirst({
        where: { sessionId },
        include: {
          items: {
            include: {
              catalogItem: true,
              variant: true,
            }
          }
        }
      });

      if (!cart || cart.items.length === 0) {
        return NextResponse.json({ error: "Carrito vacío" }, { status: 400 });
      }

      // Validate stock
      for (const item of cart.items) {
        if (item.catalogItem) {
          const cat = item.catalogItem;
          if ((cat.tipo === 'producto' || cat.tipoEntrega === 'fisico') && cat.inventarioPublico < item.cantidad) {
            return NextResponse.json(
              { error: `Stock insuficiente para ${cat.nombre}` },
              { status: 400 }
            );
          }
        }
      }

      // Create or get shipping address
      let shippingAddress = await prisma.shippingAddress.create({
        data: {
          tenantId: tenantRecord.id,
          nombre: address.nombre,
          telefono: address.telefono,
          linea1: address.linea1,
          linea2: address.linea2 || null,
          ciudad: address.ciudad,
          estado: address.estado || null,
          codigoPostal: address.codigoPostal,
          pais: address.pais || 'España',
        }
      });

      // Get fiscal emitter
      const emisor = await prisma.configuracionFiscalEmisor.findFirst({
        where: { tenantId: tenantRecord.id, activo: true, esPrincipal: true }
      });

      // Calculate totals
      let subtotal = 0;
      const orderItems = cart.items.map((item) => {
        const precio = item.variant?.precio ?? item.catalogItem?.precioBase ?? 0;
        const lineTotal = precio * item.cantidad;
        subtotal += lineTotal;

        return {
          concepto: item.catalogItem?.nombre || 'Producto',
          descripcion: item.catalogItem?.descripcion || undefined,
          cantidad: item.cantidad,
          unidad: item.catalogItem?.unidad || 'unidad',
          precioUnitario: precio,
          subtotal: lineTotal,
          total: lineTotal,
          catalogoItemId: item.catalogoItemId,
          variantId: item.variantId,
          pesoUnitario: item.catalogItem?.peso,
          dimensiones: item.catalogItem
            ? { largo: item.catalogItem.largo, ancho: item.catalogItem.ancho, alto: item.catalogItem.alto }
            : undefined,
        };
      });

      const total = subtotal - couponDiscount + shippingCost;

      // Generate order number
      const numero = `EC-${Date.now()}`;

      // Create order
      const orden = await prisma.ordenVenta.create({
        data: {
          tenantId: tenantRecord.id,
          numero,
          estado: 'pendiente',
          emisorId: emisor?.id || null,
          subtotal,
          descuentoGlobal: couponDiscount,
          tipoDescuento: couponCode ? 'cupon' : 'ninguno',
          totalImpuestos: 0,
          totalRetenciones: 0,
          total,
          moneda: tenantRecord.moneda,
          notasCliente: notasCliente || null,
          paymentMethod,
          paymentStatus: 'pending',
          shippingAddressId: shippingAddress.id,
          shippingMethod,
          shippingCost,
          couponCode: couponCode || null,
          couponDiscount,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: true,
        }
      });

      // Clear cart
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

      return NextResponse.json({
        success: true,
        orderId: orden.id,
        tokenPublico: orden.tokenPublico,
        total,
        moneda: tenantRecord.moneda,
      });
    });

  } catch (error) {
    console.error("Error creando orden:", error);
    return NextResponse.json({ error: "Error al crear la orden" }, { status: 500 });
  }
}
