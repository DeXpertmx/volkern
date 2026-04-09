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
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const plantilla = await prisma.pageTemplate.findUnique({
      where: { id: params.id },
    });

    if (!plantilla) {
      return NextResponse.json(
        { error: "Plantilla no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(plantilla);
  } catch (error) {
    console.error("Error obteniendo plantilla:", error);
    return NextResponse.json(
      { error: "Error al obtener la plantilla" },
      { status: 500 }
    );
  }
}
