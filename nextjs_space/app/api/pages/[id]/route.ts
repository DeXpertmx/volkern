export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma, globalPrisma } from "@/lib/db";
import { withTenantAuth } from "@/lib/api-key-auth";

/**
 * Verificación de tenencia para BD compartida: cuando el tenant no tiene BD
 * física aislada, `prisma` resuelve a la BD compartida y una página ajena se
 * leería/editaría/borraría solo con conocer su id. Con BD aislada la física
 * ya separa a cada tenant y no hace falta el check.
 */
async function esDeOtroTenant(
  pagina: { tenantId: string | null } | null,
  tenantId: string,
  isSuperadmin: boolean
): Promise<boolean> {
  if (!pagina) return false;
  const tenantInfo = await globalPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dbUrl: true },
  });
  if (tenantInfo?.dbUrl) return false; // BD aislada: imposible ver ajenas
  const esGlobal = pagina.tenantId === null;
  return pagina.tenantId !== tenantId && !(isSuperadmin && esGlobal);
}

export const GET = withTenantAuth(async (req, auth, { id }) => {
  try {
    const pagina = await prisma.page.findUnique({
      where: { id },
    });

    if (!pagina || (await esDeOtroTenant(pagina, auth.tenant!.id, auth.user?.role?.nombre === 'Superadmin'))) {
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

    const paginaExistente = await prisma.page.findUnique({ where: { id } });
    if (
      !paginaExistente ||
      (await esDeOtroTenant(paginaExistente, auth.tenant!.id, auth.user?.role?.nombre === 'Superadmin'))
    ) {
      return NextResponse.json(
        { error: "Página no encontrada" },
        { status: 404 }
      );
    }

    if (slug) {
      // Unicidad dentro del espacio lógico del tenant: en BD compartida el
      // slug de otro tenant no bloquea (la unique es (tenantId, slug)); con
      // BD aislada cualquier fila de esa física es del tenant.
      const aislado = !!(
        await globalPrisma.tenant.findUnique({
          where: { id: auth.tenant!.id },
          select: { dbUrl: true },
        })
      )?.dbUrl;
      const existente = await prisma.page.findFirst({
        where: { slug, id: { not: id }, ...(aislado ? {} : { tenantId: auth.tenant!.id }) },
      });
      if (existente) {
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
    const pagina = await prisma.page.findUnique({ where: { id } });
    if (
      !pagina ||
      (await esDeOtroTenant(pagina, auth.tenant!.id, auth.user?.role?.nombre === 'Superadmin'))
    ) {
      return NextResponse.json(
        { error: "Página no encontrada" },
        { status: 404 }
      );
    }

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
