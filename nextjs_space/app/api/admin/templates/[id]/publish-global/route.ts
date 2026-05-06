export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma, globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * POST /api/admin/templates/[id]/publish-global
 * Convierte una plantilla global en la página de inicio (Landing) oficial de Volkern.
 */
export const POST = withTenantAuth(async (req, auth, params) => {
  try {
    const { id } = params;
    
    // Solo Superadmin puede realizar esta acción crítica
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const template = await globalPrisma.pageTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    // Buscamos si ya existe una página global 'home'
    const existingHome = await prisma.page.findFirst({
      where: {
        slug: 'home',
        tenantId: null
      }
    });

    const contenido: any = template.contenido;
    
    // Si la plantilla usa el nuevo formato con HTML/CSS extraído, lo preparamos
    const pageContent = contenido.projectData ? {
      format: 'grapesjs',
      html: contenido.html,
      projectData: contenido.projectData
    } : {
      format: 'grapesjs',
      projectData: contenido
    };

    if (existingHome) {
      // Actualizamos la página existente
      await prisma.page.update({
        where: { id: existingHome.id },
        data: {
          titulo: template.nombre,
          descripcion: template.descripcion,
          contenido: pageContent,
          cssPersonalizado: contenido.css || "",
          estado: 'published',
          fechaActualizacion: new Date()
        }
      });
    } else {
      // Creamos la página global 'home' por primera vez
      await prisma.page.create({
        data: {
          titulo: template.nombre,
          slug: 'home',
          descripcion: template.descripcion,
          tipo: 'landing',
          estado: 'published',
          contenido: pageContent,
          cssPersonalizado: contenido.css || "",
          tenantId: null, // Página Global
          creadoPor: auth.user.id
        }
      });
    }

    return NextResponse.json({ success: true, message: 'La plantilla ahora es la Landing oficial de Volkern' });
  } catch (error: any) {
    console.error('Error al publicar landing global:', error);
    return NextResponse.json({ error: 'Error interno al procesar la publicación global' }, { status: 500 });
  }
}, ['admin:write']);
