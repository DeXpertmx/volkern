export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, getServerSession } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const coupons = await prisma.coupon.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { validoDesde: 'desc' },
  });

  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    code,
    type,
    value,
    minPurchase,
    maxDiscount,
    maxUses,
    maxUsesPerUser,
    validoDesde,
    validoHasta,
    aplicaProductos,
    aplicaCategorias,
    activo,
  } = body;

  if (!code || type === undefined || value === undefined) {
    return NextResponse.json({ error: "code, type y value son requeridos" }, { status: 400 });
  }

  const existing = await prisma.coupon.findFirst({
    where: { tenantId: session.user.tenantId, code: code.toUpperCase() }
  });

  if (existing) {
    return NextResponse.json({ error: "El código ya existe" }, { status: 400 });
  }

  const coupon = await prisma.coupon.create({
    data: {
      tenantId: session.user.tenantId,
      code: code.toUpperCase(),
      type,
      value,
      minPurchase,
      maxDiscount,
      maxUses,
      maxUsesPerUser,
      validoDesde: new Date(validoDesde),
      validoHasta: validoHasta ? new Date(validoHasta) : null,
      aplicaProductos: aplicaProductos || [],
      aplicaCategorias: aplicaCategorias || [],
      activo: activo !== undefined ? activo : true,
    }
  });

  return NextResponse.json({ success: true, coupon });
}
