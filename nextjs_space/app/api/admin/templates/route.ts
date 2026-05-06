export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { globalPrisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * POST /api/admin/templates - Crear una nueva plantilla de página global (Control Plane)
 */
export const POST = withTenantAuth(async (req, auth) => {
  try {
    // 1. Verificar privilegios administrativos (Superadmin para plantillas globales)
    if (auth.user?.role?.nombre !== 'Superadmin') {
      return NextResponse.json(
        { error: 'Acceso denegado: se requieren privilegios de Superadmin para crear plantillas globales' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { nombre, descripcion, categoria, etiquetas, imagenPreview } = body;

    // 2. Validaciones básicas
    if (!nombre || !categoria) {
      return NextResponse.json(
        { error: 'El nombre y la categoría son obligatorios' },
        { status: 400 }
      );
    }

    // 3. Crear la plantilla en la DB Global
    // Nota: 'pageTemplate' está mapeado a 'page_templates' en el esquema prisma
    const plantilla = await globalPrisma.pageTemplate.create({
      data: {
        nombre,
        descripcion,
        categoria,
        etiquetas: etiquetas || [],
        imagenPreview: imagenPreview || null,
        esPublica: true, // Por defecto las creadas desde aquí son globales/públicas
        contenido: {},   // Inicialmente vacío, se editará con el editor visual
        configuracionDefecto: {}
      }
    });

    console.log(`[AdminAPI] Plantilla Global creada: ${plantilla.nombre} (${plantilla.id})`);

    return NextResponse.json({
      success: true,
      message: 'Plantilla global creada exitosamente',
      plantilla
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creando plantilla global:', error);
    return NextResponse.json(
      { error: 'Error interno al crear plantilla' },
      { status: 500 }
    );
  }
}, ['admin:write', 'cms:write']);

/**
 * GET /api/admin/templates - Listar todas las plantillas globales
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const templates = await globalPrisma.pageTemplate.findMany({
      orderBy: { fechaCreacion: 'desc' }
    });

    return NextResponse.json(templates);
  } catch (error: any) {
    console.error('Error obteniendo plantillas globales:', error);
    return NextResponse.json(
      { error: 'Error al cargar plantillas' },
      { status: 500 }
    );
  }
}, ['admin:read', 'cms:read']);

