export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, getServerSession } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '30');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalRevenue,
    totalOrders,
    avgOrderValue,
    recentOrders,
    topProducts,
    ordersByStatus,
  ] = await Promise.all([
    prisma.ordenVenta.aggregate({
      where: {
        tenantId,
        paymentStatus: 'paid',
        fechaCreacion: { gte: startDate },
      },
      _sum: { total: true },
    }),
    prisma.ordenVenta.count({
      where: {
        tenantId,
        fechaCreacion: { gte: startDate },
      },
    }),
    prisma.ordenVenta.aggregate({
      where: {
        tenantId,
        paymentStatus: 'paid',
        fechaCreacion: { gte: startDate },
      },
      _avg: { total: true },
    }),
    prisma.ordenVenta.findMany({
      where: { tenantId },
      orderBy: { fechaCreacion: 'desc' },
      take: 5,
      select: {
        id: true,
        numero: true,
        total: true,
        moneda: true,
        estado: true,
        paymentStatus: true,
        fechaCreacion: true,
        contact: { select: { nombre: true } },
      }
    }),
    prisma.ordenVentaItem.groupBy({
      by: ['concepto'],
      where: {
        ordenVenta: {
          tenantId,
          paymentStatus: 'paid',
          fechaCreacion: { gte: startDate },
        },
      },
      _sum: { cantidad: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    prisma.ordenVenta.groupBy({
      by: ['estado'],
      where: { tenantId },
      _count: { id: true },
    }),
  ]);

  return NextResponse.json({
    revenue: totalRevenue._sum.total || 0,
    totalOrders,
    avgOrderValue: avgOrderValue._avg.total || 0,
    recentOrders,
    topProducts,
    ordersByStatus,
  });
}
