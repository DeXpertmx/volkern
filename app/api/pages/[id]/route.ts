export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/pages/[id] - Obtener una página específica
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const pagina = await prisma.page.findUnique({
      where: { id: params.id },
    });

    if (!pagina) {
      return NextResponse.json(
        { error: "Página no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(pagina);
  } catch (error) {
    console.error("Error obteniendo página:", error);
    return NextResponse.json(
      { error: "Error al obtener la página" },
      { status: 500 }
    );
  }
}

// PUT /api/pages/[id] - Actualizar una página
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      titulo,
      slug,
      descripcion,
      contenido,
      tipo,
      estado,
      metaTitulo,
      metaDescripcion,
      metaImagen,
      metaKeywords,
      configuracionBranding,
      cssPersonalizado,
      scriptsHead,
      scriptsBody,
      configuracionResponsive,
      servicioId,
      cursoId,
    } = body;

    // Si se actualiza el slug, verificar que no exista
    if (slug) {
      const existente = await prisma.page.findUnique({ where: { slug } });
      if (existente && existente.id !== params.id) {
        return NextResponse.json(
          { error: "El slug ya está en uso" },
          { status: 400 }
        );
      }
    }

    const paginaActualizada = await prisma.page.update({
      where: { id: params.id },
      data: {
        ...(titulo && { titulo }),
        ...(slug && { slug }),
        ...(descripcion !== undefined && { descripcion }),
        ...(contenido && { contenido }),
        ...(tipo && { tipo }),
        ...(estado && { estado }),
        ...(metaTitulo && { metaTitulo }),
        ...(metaDescripcion !== undefined && { metaDescripcion }),
        ...(metaImagen !== undefined && { metaImagen }),
        ...(metaKeywords !== undefined && { metaKeywords }),
        ...(configuracionBranding && { configuracionBranding }),
        ...(cssPersonalizado !== undefined && { cssPersonalizado }),
        ...(scriptsHead !== undefined && { scriptsHead }),
        ...(scriptsBody !== undefined && { scriptsBody }),
        ...(configuracionResponsive && { configuracionResponsive }),
        ...(servicioId !== undefined && { servicioId }),
        ...(cursoId !== undefined && { cursoId }),
      },
    });

    return NextResponse.json(paginaActualizada);
  } catch (error) {
    console.error("Error actualizando página:", error);
    return NextResponse.json(
      { error: "Error al actualizar la página" },
      { status: 500 }
    );
  }
}

// DELETE /api/pages/[id] - Eliminar una página
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await prisma.page.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando página:", error);
    return NextResponse.json(
      { error: "Error al eliminar la página" },
      { status: 500 }
    );
  }
}
