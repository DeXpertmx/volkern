export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const SAVED_TEMPLATE_TYPE = 'saved-template';

/**
 * GET /api/templates - Listar plantillas guardadas por el usuario en el editor
 * Supports pagination: ?page=1&limit=20
 * Also supports: ?categoria=xxx for filtering
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: "Usuario sin tenant asociado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const categoria = searchParams.get("categoria");
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: user.tenantId,
      tipo: SAVED_TEMPLATE_TYPE,
      estado: 'template',
    };
    if (categoria) where.cssPersonalizado = categoria; // Store category in cssPersonalizado metadata

    const [total, pages] = await Promise.all([
      prisma.page.count({ where }),
      prisma.page.findMany({
        where,
        orderBy: { fechaActualizacion: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          titulo: true,
          cssPersonalizado: true,
          contenido: true,
          metaImagen: true,
          fechaCreacion: true,
          fechaActualizacion: true,
          descripcion: true,
        },
      }),
    ]);

    // Map Page records to TemplateRecord format
    const templates = pages.map((p) => {
      let projectData: any = {};
      let html = '';
      let css = '';
      let category = 'general';
      const thumbnail = p.metaImagen || '';

      try {
        const contenido = p.contenido as any;
        projectData = contenido?.projectData || contenido || {};
        html = contenido?.html || '';
        css = contenido?.css || '';
        category = contenido?.category || p.descripcion || 'general';
      } catch {}

      return {
        idx: p.id,
        id: p.titulo,
        html,
        css,
        projectData,
        thumbnail,
        category,
        createdAt: p.fechaCreacion ? new Date(p.fechaCreacion).getTime() : Date.now(),
      };
    });

    const hasMore = skip + templates.length < total;

    return NextResponse.json({ templates, total, page, limit, hasMore });
  } catch (error: any) {
    console.error("[/api/templates] GET Error:", error);
    return NextResponse.json(
      { error: "Error al obtener plantillas", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates - Guardar una plantilla del editor (crear o actualizar)
 * Body: { idx?, id, html, css, projectData, thumbnail, category, createdAt }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 });
    }

    const body = await req.json();
    const { idx, id: nombre, html, css, projectData, thumbnail, category } = body;

    // The contenido JSON stores all editor data
    const contenido = {
      projectData: projectData || {},
      html: html || '',
      css: css || '',
      category: category || 'general',
    };

    // Generate a URL-safe slug
    const slug = `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    if (idx) {
      // Update existing template
      try {
        const existing = await prisma.page.findFirst({
          where: { id: idx, tenantId: user.tenantId, tipo: SAVED_TEMPLATE_TYPE },
        });

        if (existing) {
          const updated = await prisma.page.update({
            where: { id: idx },
            data: {
              titulo: nombre || 'Sin título',
              contenido: contenido as any,
              metaImagen: thumbnail || null,
              descripcion: category || 'general',
              fechaActualizacion: new Date(),
            },
          });
          return NextResponse.json({ ...updated, idx: updated.id });
        }
      } catch {}
    }

    // Create new template
    const created = await prisma.page.create({
      data: {
        tenantId: user.tenantId,
        titulo: nombre || 'Nueva Plantilla',
        slug,
        tipo: SAVED_TEMPLATE_TYPE,
        estado: 'template',
        contenido: contenido as any,
        metaImagen: thumbnail || null,
        descripcion: category || 'general',
        creadoPor: user.id,
      },
    });

    return NextResponse.json({ ...created, idx: created.id }, { status: 201 });
  } catch (error: any) {
    console.error("[/api/templates] POST Error:", error);
    return NextResponse.json(
      { error: "Error al guardar la plantilla", details: error.message },
      { status: 500 }
    );
  }
}
