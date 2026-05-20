export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenant');
    const email = searchParams.get('email');

    if (!tenantSlug) {
      return NextResponse.json(
        { error: "tenant es requerido" },
        { status: 400 }
      );
    }

    const tenantRecord = await globalPrisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true }
    });

    if (!tenantRecord) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const tenantClient = await getTenantDb(tenantRecord.id);

    return await dbContext.run({ tenantId: tenantRecord.id, client: tenantClient }, async () => {
      const where: any = {};

      if (email) {
        const contact = await prisma.contact.findFirst({
          where: { email: email.toLowerCase() },
          select: { id: true }
        });

        if (contact) {
          where.contactId = contact.id;
        } else {
          return NextResponse.json({ orders: [], foundContact: false });
        }
      }

      const orders = await prisma.ordenVenta.findMany({
        where,
        orderBy: { fechaCreacion: 'desc' },
        take: 50,
        select: {
          id: true,
          numero: true,
          estado: true,
          paymentStatus: true,
          total: true,
          moneda: true,
          fechaCreacion: true,
          trackingNumber: true,
          trackingUrl: true,
          shippingCarrier: true,
          shippingMethod: true,
          invoice: {
            select: {
              id: true,
              numero: true,
              fingerprint: true,
              aeatStatus: true,
            }
          },
          items: {
            select: {
              concepto: true,
              cantidad: true,
              precioUnitario: true,
              total: true,
              catalogItem: {
                select: {
                  slug: true,
                  media: true,
                }
              }
            }
          },
          shippingAddress: {
            select: {
              nombre: true,
              linea1: true,
              ciudad: true,
              codigoPostal: true,
              pais: true,
            }
          }
        }
      });

      return NextResponse.json({
        orders,
        foundContact: !!email,
      });
    });

  } catch (error) {
    console.error("Error obteniendo órdenes:", error);
    return NextResponse.json({ error: "Error al obtener los pedidos" }, { status: 500 });
  }
}
