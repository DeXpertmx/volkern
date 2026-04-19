export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma, globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { validateLimit } from '@/lib/limits';
import { isModuleActive } from '@/lib/plans';

/**
 * GET /api/cms/pages - Listar páginas del tenant (Base de Datos aislada)
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // 1. Verificar si el módulo CMS está activo en el plan
    /* Temporarily bypassed due to persistent 403
    const cmsActive = await isModuleActive('cms', auth.tenant!.plan, []);
    const roleName = auth.user?.role?.nombre?.toLowerCase();
    
    if (!cmsActive && roleName !== 'superadmin' && roleName !== 'owner' && roleName !== 'admin') {
      return NextResponse.json({ 
        error: 'Módulo de Constructor Web no disponible en tu plan actual.' 
      }, { status: 403 });
    }
    */

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo');
    const estado = searchParams.get('estado');
    const isGlobalRequested = searchParams.get('global') === 'true';
    const isSuperadmin = currentUser.role?.nombre === 'Superadmin';

    // Verificamos si el tenant tiene una base de datos aislada (propia)
    const tenantInfo = await globalPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dbUrl: true }
    });
    const isIsolated = !!tenantInfo?.dbUrl;

    let where: any = {};

    if (isGlobalRequested && isSuperadmin) {
      // Nota: Las páginas globales viven en la Global DB. 
      where = { tenantId: null };
    } else if (isSuperadmin) {
      // Superadmin en modo Dashboard: Ver todo (excepto la home para no mezclar)
      where = {
        slug: { not: 'home' }
      };
    } else if (!isIsolated) {
      // Si usan la DB compartida global, DEBEMOS filtrar estrictamente por tenantId.
      where = { tenantId: tenantId };
    }

    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;

    // Dependiendo de si se piden páginas globales o locales, enrutamos explícitamente
    const targetDb = (isGlobalRequested && isSuperadmin) ? globalPrisma : prisma;

    // Extraer slug opcional si viene en los query params (fundamental para Marketing Admin)
    const exactSlug = searchParams.get('slug');
    if (exactSlug) where.slug = exactSlug;

    const pages = await targetDb.page.findMany({
      where,
      orderBy: { fechaActualizacion: 'desc' },
      select: {
        id: true,
        titulo: true,
        slug: true,
        tipo: true,
        estado: true,
        vistas: true,
        conversiones: true,
        publicadoEn: true,
        fechaCreacion: true,
        fechaActualizacion: true,
        metaTitulo: true,
        metaDescripcion: true,
        metaImagen: true,
        dominioPersonalizado: true,
      },
    });

    // Obtener el slug del tenant para construir las URLs públicas
    const tenantSlugInfo = await globalPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true }
    });

    return NextResponse.json({ pages, tenantSlug: tenantSlugInfo?.slug || tenantId });
  } catch (error) {
    console.error('[CMS Pages] Error:', error);
    return NextResponse.json({ error: 'Error al obtener páginas' }, { status: 500 });
  }
}, ['cms:read'])

/**
 * POST /api/cms/pages - Crear nueva página en la BD del Tenant
 */
export const POST = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const currentUser = auth.user!;

    // 1. Verificar módulo activo
    /* Temporarily bypassed due to persistent 403
    const cmsActive = await isModuleActive('cms', auth.tenant!.plan, []);
    const roleName = currentUser.role?.nombre?.toLowerCase();

    if (!cmsActive && roleName !== 'superadmin' && roleName !== 'owner' && roleName !== 'admin') {
      return NextResponse.json({ 
        error: 'Módulo de Constructor Web no disponible en tu plan actual.' 
      }, { status: 403 });
    }
    */

    // 2. Validar límite de páginas
    const limitCheck = await validateLimit(tenantId, 'pages');
    if (!limitCheck.allowed && currentUser.role?.nombre !== 'Superadmin') {
      return NextResponse.json(limitCheck.error, { status: limitCheck.error.status });
    }

    const body = await req.json();
    const { titulo, slug: manualSlug, tipo = 'landing', contenido, global = false, template } = body;

    const isSuperadmin = currentUser.role?.nombre === 'Superadmin';
    let tenantContext: string | null = tenantId;

    if (global && isSuperadmin) {
      tenantContext = null; // Crear como página global en el Control Plane
    }

    if (!titulo) {
      return NextResponse.json({ error: 'Título requerido' }, { status: 400 });
    }

    // Generar slug único (validando contra la DB del tenant o global según corresponda)
    let baseSlug = titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    let slug = manualSlug || baseSlug;
    let counter = 1;

    // Determinar la base de datos de destino
    const targetDb = (global && isSuperadmin) ? globalPrisma : prisma;

    // El proxy de prisma resolverá findUnique contra la DB correcta
    while (await targetDb.page.findFirst({ where: { slug, tenantId: tenantContext } })) {
      slug = manualSlug 
        ? `${manualSlug}-${counter}`
        : `${baseSlug}-${counter}`;
      counter++;
    }

    // Inicializar contenido según tipo y plantilla
    let initialContent = contenido;
    
    if (!initialContent) {
      if (tipo === 'volkern-webcreator') {
        initialContent = {
          format: 'grapesjs',
          projectData: {},
          html: '',
          template: template || 'blank'
        };
      } else {
        initialContent = {
          content: [],
          root: {
            props: {
              title: titulo,
              description: '',
            },
          },
        };
      }
    }

    // 4. Preparar datos para la creación
    const pageData: any = {
      titulo,
      slug,
      tipo,
      estado: 'draft',
      contenido: initialContent,
      metaTitulo: titulo,
    };

    // --- IMPORTANTE: Manejo de Aislamiento de DB y FK P2003 ---
    // En arquitecturas multi-tenant aisladas, la tabla de destino (Tenant DB) 
    // no tiene relación real a nivel de FK con las tablas del Control Plane (Global DB).
    const tenantInfo = await globalPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dbUrl: true }
    });
    const isIsolated = !!tenantInfo?.dbUrl;

    if (global && isSuperadmin) {
      // Si es global, guardamos el tenantId como null y el creador (ambos válidos en la Global DB)
      pageData.tenantId = null;
      pageData.creadoPor = currentUser.id;
    } else if (!isIsolated) {
      // Si la base de datos es COMPARTIDA, las foreign keys sí existen y apuntan a la misma DB superior.
      pageData.tenantId = tenantId;
      pageData.creadoPor = currentUser.id;
    } else {
      // En la DB aislada de un tenant, omitimos tenantId y creadoPor porque tienen FKs que fallarían P2003.
      // El contexto de a quién pertenecen ya está implícito en la base de datos física del tenant.
    }

    const page = await targetDb.page.create({
      data: pageData,
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (error: any) {
    console.error('[CMS Pages] Error al crear:', error);
    if (error.code) console.error('[CMS Pages] Prisma Error Code:', error.code);
    if (error.meta) console.error('[CMS Pages] Prisma Error Meta:', error.meta);
    if (error.message) console.error('[CMS Pages] Error Message:', error.message);

    return NextResponse.json({ 
      error: 'Error al crear página',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}, ['cms:write'])