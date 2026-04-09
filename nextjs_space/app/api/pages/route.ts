export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withTenantAuth } from "@/lib/api-key-auth";
import { validateLimit } from "@/lib/limits";
import { isModuleActive } from "@/lib/plans";

// GET /api/pages - Obtener todas las páginas del tenant (BD Aislada)
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo");
    const estado = searchParams.get("estado");

    const where: any = { tenantId };
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;

    const paginas = await prisma.page.findMany({
      where,
      orderBy: { fechaActualizacion: "desc" },
      select: {
        id: true,
        titulo: true,
        slug: true,
        descripcion: true,
        tipo: true,
        estado: true,
        vistas: true,
        conversiones: true,
        publicadoEn: true,
        subdomain: true,
        dominioPersonalizado: true,
        fechaCreacion: true,
        fechaActualizacion: true,
      },
    });

    return NextResponse.json(paginas);
  } catch (error) {
    console.error("Error obteniendo páginas:", error);
    return NextResponse.json(
      { error: "Error al obtener las páginas" },
      { status: 500 }
    );
  }
}, ['cms:read']);

// POST /api/pages - Crear nueva página en la BD del Tenant
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // 1. Verificar módulo activo
    const cmsActive = await isModuleActive('cms', auth.tenant!.plan, []);
    if (!cmsActive && currentUser.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ 
        error: 'Módulo de Constructor Web no disponible en tu plan actual.' 
      }, { status: 403 });
    }

    // 2. Validar límite de páginas
    const limitCheck = await validateLimit(tenantId, 'pages');
    if (!limitCheck.allowed && currentUser.role?.nombre !== 'Superadmin') {
      return NextResponse.json(limitCheck.error, { status: limitCheck.error.status });
    }

    const body = await req.json();
    const {
      titulo,
      slug,
      descripcion,
      contenido,
      tipo,
      plantillaId,
      metaTitulo,
      metaDescripcion,
      metaImagen,
      configuracionBranding,
      servicioId,
      cursoId,
    } = body;

    if (!titulo) {
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });
    }

    // Generar slug si no se proporciona
    const baseSlug = (slug || titulo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let finalSlug = baseSlug;
    let counter = 1;

    // Verificar unicidad de slug en la base de datos (aislada por el proxy)
    while (await prisma.page.findFirst({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    const nuevaPagina = await prisma.page.create({
      data: {
        titulo,
        slug: finalSlug,
        descripcion,
        contenido: contenido || { components: [] },
        tipo: tipo || "landing",
        plantillaId,
        metaTitulo: metaTitulo || titulo,
        metaDescripcion: metaDescripcion || descripcion,
        metaImagen,
        configuracionBranding,
        servicioId,
        cursoId,
        tenantId,
        creadoPor: currentUser.id,
      },
    });

    return NextResponse.json(nuevaPagina);
  } catch (error) {
    console.error("Error creando página:", error);
    return NextResponse.json(
      { error: "Error al crear la página" },
      { status: 500 }
    );
  }
}, ['cms:write']);
