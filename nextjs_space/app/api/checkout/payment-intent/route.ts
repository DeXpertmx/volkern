export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant, orderId, total, moneda, email, address } = body;

    if (!tenant || !orderId || !total) {
      return NextResponse.json(
        { error: "tenant, orderId y total son requeridos" },
        { status: 400 }
      );
    }

    const tenantRecord = await globalPrisma.tenant.findUnique({
      where: { slug: tenant },
      select: { id: true, stripeCustomerId: true }
    });

    if (!tenantRecord) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const tenantClient = await getTenantDb(tenantRecord.id);

    return await dbContext.run({ tenantId: tenantRecord.id, client: tenantClient }, async () => {
      const orden = await prisma.ordenVenta.findUnique({
        where: { id: orderId },
        include: { items: { include: { catalogItem: true, variant: true } } }
      });

      if (!orden) {
        return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
      }

      const currency = (moneda || 'eur').toLowerCase();
      const amountInCents = Math.round(total * 100);

      const lineItems = orden.items.map((item) => ({
        price_data: {
          currency,
          product_data: {
            name: item.concepto,
            description: item.descripcion || undefined,
          },
          unit_amount: Math.round(item.precioUnitario * 100),
        },
        quantity: item.cantidad,
      }));

      if (orden.shippingCost > 0) {
        lineItems.push({
          price_data: {
            currency,
            product_data: { name: "Envío" },
            unit_amount: Math.round(orden.shippingCost * 100),
          },
          quantity: 1,
        });
      }

      if (orden.couponDiscount > 0) {
        lineItems.push({
          price_data: {
            currency,
            product_data: { name: `Descuento (${orden.couponCode || "Cupón"})` },
            unit_amount: -Math.round(orden.couponDiscount * 100),
          },
          quantity: 1,
        });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        customer_email: email,
        success_url: `${appUrl}/${tenant}/orden/${orden.id}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/${tenant}/checkout`,
        metadata: {
          orderId: orden.id,
          tenantId: tenantRecord.id,
          tenantSlug: tenant,
        },
      });

      return NextResponse.json({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
      });
    });

  } catch (error) {
    console.error("Error creando payment intent:", error);
    return NextResponse.json({ error: "Error al crear el pago" }, { status: 500 });
  }
}
