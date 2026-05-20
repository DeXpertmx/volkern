export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { sendShippingEmail, sendOrderDeliveredEmail } from "@/lib/ecommerce/notifications/email-service";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant, orderId, estado, trackingNumber, trackingUrl, shippingCarrier } = body;

    if (!tenant || !orderId) {
      return NextResponse.json(
        { error: "tenant y orderId son requeridos" },
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
      const orden = await prisma.ordenVenta.findUnique({
        where: { id: orderId },
        include: {
          contact: true,
          shippingAddress: true,
          items: true,
          invoice: true,
        }
      });

      if (!orden) {
        return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
      }

      const updateData: any = {};

      if (estado) updateData.estado = estado;
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (trackingUrl) updateData.trackingUrl = trackingUrl;
      if (shippingCarrier) updateData.shippingCarrier = shippingCarrier;

      const updated = await prisma.ordenVenta.update({
        where: { id: orderId },
        data: updateData,
      });

      // Send notifications
      const customerEmail = orden.contact?.email || orden.shippingAddress?.nombre ? '' : '';
      const emailData = {
        orderNumber: orden.numero,
        customerName: orden.shippingAddress?.nombre || orden.contact?.nombre || 'Cliente',
        customerEmail: orden.contact?.email || '',
        total: orden.total,
        currency: orden.moneda,
        items: orden.items.map((i) => ({
          concepto: i.concepto,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          total: i.total,
        })),
        shippingAddress: orden.shippingAddress
          ? {
              nombre: orden.shippingAddress.nombre,
              linea1: orden.shippingAddress.linea1,
              ciudad: orden.shippingAddress.ciudad,
              codigoPostal: orden.shippingAddress.codigoPostal,
              pais: orden.shippingAddress.pais,
            }
          : { nombre: '', linea1: '', ciudad: '', codigoPostal: '', pais: '' },
        trackingNumber: updated.trackingNumber || undefined,
        trackingUrl: updated.trackingUrl || undefined,
        shippingCarrier: updated.shippingCarrier || undefined,
        invoiceNumber: orden.invoice?.numero,
      };

      if (trackingNumber && emailData.customerEmail) {
        try {
          await sendShippingEmail(emailData);
        } catch (e) {
          console.error('Error sending shipping email:', e);
        }
      }

      if (estado === 'completada' && emailData.customerEmail) {
        try {
          await sendOrderDeliveredEmail(emailData);
        } catch (e) {
          console.error('Error sending delivered email:', e);
        }
      }

      return NextResponse.json({ success: true, order: updated });
    });

  } catch (error) {
    console.error("Error actualizando orden:", error);
    return NextResponse.json({ error: "Error al actualizar la orden" }, { status: 500 });
  }
}
