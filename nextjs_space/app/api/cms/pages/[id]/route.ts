export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/cms/pages/[id] - Obtener página por ID (Aislamiento por Tenant)
 */
export const GET = withTenantAuth(async (req, auth, context) => {
  const id = context?.params?.id || (context as any)?.id;
  
  if (!id) {
    console.error('[CMS Page GET] Missing id param, context:', context);
    return NextResponse.json({ error: 'ID de página requerido' }, { status: 400 });
  }
  
  try {
    const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
    const tenantId = auth.tenant!.id;

    // 1. Intentar buscar en la DB del Tenant
    const page = await prisma.page.findUnique({
      where: { id }
    });

    if (page) {
      // Obtener el slug del tenant para construir URLs públicas
      const tenantInfo = await globalPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      return NextResponse.json({ 
        page: { ...page, tenantId: page.tenantId || tenantId },
        tenantSlug: tenantInfo?.slug || tenantId,
      });
    }

    // 2. Si no se encuentra y es Superadmin, intentar buscar en la Global DB
    if (isSuperadmin) {
      const globalPage = await globalPrisma.page.findUnique({
        where: { id, tenantId: null }
      });
      if (globalPage) return NextResponse.json({ page: globalPage });
    }

    return NextResponse.json({ error: 'Página no encontrada' }, { status: 404 });
  } catch (error) {
    console.error('[CMS Page GET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Error al obtener página', details: errorMessage }, { status: 500 });
  }
});

/**
 * PUT /api/cms/pages/[id] - Actualizar página
 */
export const PUT = withTenantAuth(async (req, auth, context) => {
  const id = context?.params?.id || (context as any)?.id;
  
  if (!id) {
    return NextResponse.json({ error: 'ID de página requerido' }, { status: 400 });
  }
  try {
    const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';
    const tenantId = auth.tenant!.id;

    const body = await req.json();
    const {
      titulo,
      contenido,
      estado,
      cssPersonalizado,
      metaTitulo,
      metaDescripcion,
      metaImagen,
      metaKeywords,
      scriptsHead,
      scriptsBody,
    } = body;

    // Log para depuración
    console.log('[CMS Page PUT] Update request for page:', id);
    console.log('[CMS Page PUT] Content size:', contenido ? JSON.stringify(contenido).length : 0);
    console.log('[CMS Page PUT] Has projectData:', contenido?.projectData ? 'yes' : 'no');
    if (contenido?.projectData) {
      console.log('[CMS Page PUT] projectData keys:', Object.keys(contenido.projectData));
    }

    // Determinar qué DB usar y verificar existencia
    let targetDb = prisma;
    let existingPage = await prisma.page.findUnique({ where: { id } });

    if (existingPage) {
      // SI ESTÁ EN LA DB DEL TENANT: La autorización está garantizada por el aislamiento
      // del pool de conexiones. No validamos tenantId porque puede ser null (AISLAMIENTO).
    } else if (isSuperadmin) {
      // SI NO ESTÁ EN EL TENANT Y ES SUPERADMIN: Buscamos en la Global
      existingPage = await globalPrisma.page.findUnique({ where: { id, tenantId: null } });
      targetDb = globalPrisma;

      if (!existingPage) {
        return NextResponse.json({ error: 'Página no encontrada' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Página no encontrada o sin acceso' }, { status: 404 });
    }

    const updateData: any = {
      fechaActualizacion: new Date(),
    };

    if (titulo !== undefined) updateData.titulo = titulo;
    if (contenido !== undefined) updateData.contenido = contenido;
    if (estado !== undefined) {
      updateData.estado = estado;
      if (estado === 'published' && !existingPage.publicadoEn) {
        updateData.publicadoEn = new Date();
      }
    }
    if (cssPersonalizado !== undefined) updateData.cssPersonalizado = cssPersonalizado;
    if (metaTitulo !== undefined) updateData.metaTitulo = metaTitulo;
    if (metaDescripcion !== undefined) updateData.metaDescripcion = metaDescripcion;
    if (metaImagen !== undefined) updateData.metaImagen = metaImagen;
    if (metaKeywords !== undefined) updateData.metaKeywords = metaKeywords;
    if (scriptsHead !== undefined) updateData.scriptsHead = scriptsHead;
    if (scriptsBody !== undefined) updateData.scriptsBody = scriptsBody;

    const page = await targetDb.page.update({
      where: { id },
      data: updateData,
    });

    console.log('[CMS Page PUT] Page updated successfully:', page.id);
    return NextResponse.json({ page });
  } catch (error: any) {
    console.error('[CMS Page] Error al actualizar:', error);
    if (error.code) console.error('[CMS Page] Prisma Error Code:', error.code);
    if (error.meta) console.error('[CMS Page] Prisma Error Meta:', error.meta);
    if (error.message) console.error('[CMS Page] Error Message:', error.message);

    return NextResponse.json({
      error: 'Error al actualizar página',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
});

/**
 * DELETE /api/cms/pages/[id] - Eliminar página
 */
export const DELETE = withTenantAuth(async (req, auth, context) => {
  const id = context?.params?.id || (context as any)?.id;
  
  if (!id) {
    return NextResponse.json({ error: 'ID de página requerido' }, { status: 400 });
  }
  try {
    const isSuperadmin = auth.user?.role?.nombre === 'Superadmin';

    let targetDb = prisma;
    let existingPage = await prisma.page.findUnique({ where: { id } });

    if (!existingPage && isSuperadmin) {
      existingPage = await globalPrisma.page.findUnique({ where: { id, tenantId: null } });
      targetDb = globalPrisma;
    }

    if (!existingPage) {
      return NextResponse.json({ error: 'Página no encontrada' }, { status: 404 });
    }

    // Nota: El aislamiento de prisma ya garantiza que si existe en ese pool, es de ese tenant.
    
    await targetDb.page.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[CMS Page] Error al eliminar:', error);
    return NextResponse.json({ error: 'Error al eliminar página' }, { status: 500 });
  }
});
