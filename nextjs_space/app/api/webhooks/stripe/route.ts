export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { createVerifactuInvoice } from "@/lib/ecommerce/verifactu-service";
import { sendOrderConfirmationEmail } from "@/lib/ecommerce/notifications/email-service";

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const { orderId, tenantId, tenantSlug } = session.metadata;

    if (orderId && tenantId) {
      try {
        const tenantClient = await getTenantDb(tenantId);

        await dbContext.run({ tenantId, client: tenantClient }, async () => {
          const orden = await prisma.ordenVenta.findUnique({
            where: { id: orderId },
            include: {
              items: { include: { catalogItem: true } },
              shippingAddress: true,
              emisor: true,
            }
          });

          if (!orden) return;

          await prisma.ordenVenta.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'paid',
              estado: 'confirmada',
              paidAt: new Date(),
            }
          });

          if (orden.emisor && orden.emisor.verifactuEnabled) {
            const address = orden.shippingAddress;
            await createVerifactuInvoice({
              tenantId,
              ordenVentaId: orderId,
              emisorId: orden.emisorId!,
              numero: `F-${orden.numero}`,
              fechaEmision: new Date(),
              subtotal: orden.subtotal,
              totalImpuestos: orden.totalImpuestos,
              total: orden.total,
              moneda: orden.moneda,
              clienteNombre: address?.nombre || 'Cliente',
              clienteNif: 'N/A',
              clienteDireccion: `${address?.linea1}, ${address?.ciudad}, ${address?.codigoPostal}`,
              items: orden.items.map((item) => ({
                concepto: item.concepto,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                total: item.total,
              })),
            });
          }

          // Decrement inventory
          for (const item of orden.items) {
            if (item.catalogItem && item.catalogItem.isStockable) {
              await prisma.catalogoItem.update({
                where: { id: item.catalogItem.id },
                data: {
                  inventarioPublico: {
                    decrement: item.cantidad
                  }
                }
              });
            }
          }

          // Send confirmation email
          const sessionEmail = session.customer_details?.email || session.customer_email;
          if (sessionEmail && orden.shippingAddress) {
            try {
              const invoice = await prisma.invoice.findFirst({
                where: { tenantId, metadata: { path: ['orderId'], equals: orderId } },
                select: { numero: true }
              });

              await sendOrderConfirmationEmail({
                orderNumber: orden.numero,
                customerName: orden.shippingAddress.nombre,
                customerEmail: sessionEmail,
                total: orden.total,
                currency: orden.moneda,
                items: orden.items.map((item) => ({
                  concepto: item.concepto,
                  cantidad: item.cantidad,
                  precioUnitario: item.precioUnitario,
                  total: item.total,
                })),
                shippingAddress: {
                  nombre: orden.shippingAddress.nombre,
                  linea1: orden.shippingAddress.linea1,
                  ciudad: orden.shippingAddress.ciudad,
                  codigoPostal: orden.shippingAddress.codigoPostal,
                  pais: orden.shippingAddress.pais,
                },
                invoiceNumber: invoice?.numero,
              });
            } catch (e) {
              console.error('[Webhook] Error sending confirmation email:', e);
            }
          }
        });

        console.log(`[Webhook] Orden ${orderId} pagada y factura VeriFactu creada`);
      } catch (error) {
        console.error(`[Webhook] Error procesando pago para orden ${orderId}:`, error);
      }
    }
  }

  return NextResponse.json({ received: true });
}
