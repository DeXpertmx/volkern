export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/templates/[id] - Obtener una plantilla específica
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });

    const plantilla = await prisma.page.findFirst({
      where: { id: params.id, tenantId: user?.tenantId ?? undefined },
    });

    if (!plantilla) {
      return NextResponse.json(
        { error: "Plantilla no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ...plantilla, idx: plantilla.id });
  } catch (error) {
    console.error("Error obteniendo plantilla:", error);
    return NextResponse.json(
      { error: "Error al obtener la plantilla" },
      { status: 500 }
    );
  }
}

// DELETE /api/templates/[id] - Eliminar una plantilla del editor
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Verify ownership before deleting
    const existing = await prisma.page.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
        tipo: 'saved-template',
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Plantilla no encontrada o sin permisos" },
        { status: 404 }
      );
    }

    await prisma.page.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[/api/templates/[id]] DELETE Error:", error);
    return NextResponse.json(
      { error: "Error al eliminar la plantilla", details: error.message },
      { status: 500 }
    );
  }
}
