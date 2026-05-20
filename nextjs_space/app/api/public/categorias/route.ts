export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";

function buildCategoryTree(categories: any[], parentId: string | null = null): any[] {
  return categories
    .filter((cat) => cat.parentId === parentId)
    .map((cat) => ({
      ...cat,
      children: buildCategoryTree(categories, cat.id),
    }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlugParam = searchParams.get('tenant');
    const tenantIdParam = searchParams.get('tenantId');

    let tenantId: string | null = null;

    if (tenantSlugParam) {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { slug: tenantSlugParam },
        select: { id: true }
      });
      tenantId = tenant?.id || null;
    }

    if (!tenantId && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant o tenantId es requerido" },
        { status: 400 }
      );
    }

    const tenantClient = await getTenantDb(tenantId);

    return await dbContext.run({ tenantId, client: tenantClient }, async () => {
      const categories = await prisma.productCategory.findMany({
        where: { activo: true },
        orderBy: [{ orden: 'asc' }, { name: 'asc' }],
      });

      const tree = buildCategoryTree(categories, null);

      return NextResponse.json({ categories: tree });
    });

  } catch (error) {
    console.error("Error obteniendo categorías:", error);
    return NextResponse.json(
      { error: "Error al obtener las categorías" },
      { status: 500 }
    );
  }
}
