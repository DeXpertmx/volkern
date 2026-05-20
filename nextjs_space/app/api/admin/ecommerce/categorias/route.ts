export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, getServerSession } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.productCategory.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ orden: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { catalogoItems: true } },
    }
  });

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, slug, parentId, image, description, orden } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: "name y slug son requeridos" }, { status: 400 });
  }

  const category = await prisma.productCategory.create({
    data: {
      tenantId: session.user.tenantId,
      name,
      slug,
      parentId: parentId || null,
      image,
      description,
      orden: orden || 0,
    }
  });

  return NextResponse.json({ success: true, category });
}
