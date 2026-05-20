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
  const estado = searchParams.get('estado');
  const paymentStatus = searchParams.get('paymentStatus');
  const search = searchParams.get('search');

  const where: any = { tenantId: session.user.tenantId };

  if (estado) where.estado = estado;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  if (search) {
    where.OR = [
      { numero: { contains: search, mode: 'insensitive' } },
      { referenciaCliente: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.ordenVenta.findMany({
      where,
      skip,
      take: limit,
      orderBy: { fechaCreacion: 'desc' },
      include: {
        contact: { select: { nombre: true, email: true } },
        invoice: { select: { numero: true, aeatStatus: true } },
        _count: { select: { items: true } },
      }
    }),
    prisma.ordenVenta.count({ where }),
  ]);

  return NextResponse.json({
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { orderId, estado, paymentStatus, trackingNumber, trackingUrl, shippingCarrier, notasInternas } = body;

  if (!orderId) {
    return NextResponse.json({ error: "orderId es requerido" }, { status: 400 });
  }

  const existing = await prisma.ordenVenta.findFirst({
    where: { id: orderId, tenantId: session.user.tenantId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }

  const updated = await prisma.ordenVenta.update({
    where: { id: orderId },
    data: {
      estado: estado || existing.estado,
      paymentStatus: paymentStatus || existing.paymentStatus,
      trackingNumber: trackingNumber !== undefined ? trackingNumber : existing.trackingNumber,
      trackingUrl: trackingUrl !== undefined ? trackingUrl : existing.trackingUrl,
      shippingCarrier: shippingCarrier !== undefined ? shippingCarrier : existing.shippingCarrier,
      notasInternas: notasInternas !== undefined ? notasInternas : existing.notasInternas,
    }
  });

  return NextResponse.json({ success: true, order: updated });
}
