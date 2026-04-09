export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withTenantAuth } from "@/lib/api-key-auth";

/**
 * GET /api/templates - Listar plantillas de páginas (Globales + Tenant)
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const { searchParams } = new URL(req.url);
    const categoria = searchParams.get("categoria");

    // Buscamos todas las plantillas públicas.
    // Como 'pageTemplate' está en GLOBAL_MODELS en lib/db.ts, 
    // prisma redirigirá automáticamente al Control Plane.
    const where: any = { esPublica: true };
    if (categoria) where.categoria = categoria;

    const plantillas = await prisma.pageTemplate.findMany({
      where,
      orderBy: { ordenamiento: "asc" },
    });

    return NextResponse.json(plantillas);
  } catch (error) {
    console.error("Error obteniendo plantillas:", error);
    return NextResponse.json(
      { error: "Error al obtener las plantillas" },
      { status: 500 }
    );
  }
}, ['cms:read']);
