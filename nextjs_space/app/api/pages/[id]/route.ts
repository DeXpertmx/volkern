export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma } from "@/lib/db";
import { withTenantAuth } from "@/lib/api-key-auth";

export const GET = withTenantAuth(async (req, auth, { id }) => {
  try {
    const pagina = await prisma.page.findUnique({
      where: { id },
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
}, ['cms:read']);

export const PUT = withTenantAuth(async (req, auth, { id }) => {
  try {
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

    if (slug) {
      const existente = await prisma.page.findFirst({ where: { slug } });
      if (existente && existente.id !== id) {
        return NextResponse.json(
          { error: "El slug ya está en uso" },
          { status: 400 }
        );
      }
    }

    const paginaActualizada = await prisma.page.update({
      where: { id },
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
}, ['cms:write']);

export const DELETE = withTenantAuth(async (req, auth, { id }) => {
  try {
    await prisma.page.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando página:", error);
    return NextResponse.json(
      { error: "Error al eliminar la página" },
      { status: 500 }
    );
  }
}, ['cms:write']);
