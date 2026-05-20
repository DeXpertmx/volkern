export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant, code, cartItems, subtotal } = body;

    if (!tenant || !code) {
      return NextResponse.json(
        { error: "tenant y code son requeridos" },
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
      const coupon = await prisma.coupon.findFirst({
        where: {
          tenantId: tenantRecord.id,
          code: code.toUpperCase(),
          activo: true,
        }
      });

      if (!coupon) {
        return NextResponse.json({ valid: false, error: "Cupón no encontrado" });
      }

      const now = new Date();

      if (coupon.validoDesde && now < coupon.validoDesde) {
        return NextResponse.json({ valid: false, error: "Cupón no válido aún" });
      }

      if (coupon.validoHasta && now > coupon.validoHasta) {
        return NextResponse.json({ valid: false, error: "Cupón expirado" });
      }

      if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) {
        return NextResponse.json({ valid: false, error: "Cupón agotado" });
      }

      if (coupon.minPurchase && subtotal < coupon.minPurchase) {
        return NextResponse.json({
          valid: false,
          error: `Compra mínima de ${coupon.minPurchase} requerida`,
        });
      }

      if (coupon.aplicaProductos.length > 0 && cartItems) {
        const hasValidProduct = cartItems.some(
          (item: any) => coupon.aplicaProductos.includes(item.catalogoItemId)
        );
        if (!hasValidProduct) {
          return NextResponse.json({
            valid: false,
            error: "Cupón no aplica a los productos del carrito",
          });
        }
      }

      let discount = 0;
      if (coupon.type === 'percentage') {
        discount = subtotal * (coupon.value / 100);
        if (coupon.maxDiscount) {
          discount = Math.min(discount, coupon.maxDiscount);
        }
      } else {
        discount = coupon.value;
      }

      return NextResponse.json({
        valid: true,
        type: coupon.type,
        value: coupon.value,
        discount: Math.round(discount * 100) / 100,
        code: coupon.code,
      });
    });

  } catch (error) {
    console.error("Error validando cupón:", error);
    return NextResponse.json({ error: "Error al validar cupón" }, { status: 500 });
  }
}
