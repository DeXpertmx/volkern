import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

// GET /api/formularios — Listar formularios del tenant
export const GET = withTenantAuth(async (request, auth) => {
  try {
    const [forms, leadFieldDefinitions] = await Promise.all([
      prisma.webForm.findMany({
        where: { tenantId: auth.tenant!.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { submissions: true } },
        },
      }),
      prisma.leadFieldDefinition.findMany({
        where: { tenantId: auth.tenant!.id, activo: true },
        orderBy: { orden: 'asc' },
        select: { fieldKey: true, label: true, type: true, activo: true },
      }),
    ]);

    return NextResponse.json({ forms, leadFieldDefinitions });
  } catch (error: any) {
    console.error('[Formularios API] Error listing forms:', error);
    return NextResponse.json({ error: 'Error al listar formularios' }, { status: 500 });
  }
});

// POST /api/formularios — Crear un nuevo formulario
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { name, config, pageId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre del formulario es requerido' }, { status: 400 });
    }

    const surveyConfig = config || {
      title: name,
      pages: [{
        name: 'page1',
        elements: [
          { type: 'text', name: 'nombre', title: 'Nombre', isRequired: true },
          { type: 'text', name: 'email', title: 'Email', isRequired: true, inputType: 'email' },
          { type: 'text', name: 'telefono', title: 'Teléfono' },
          { type: 'text', name: 'empresa', title: 'Empresa' },
          { type: 'comment', name: 'notas', title: 'Notas' },
        ],
      }],
    };

    const form = await prisma.webForm.create({
      data: {
        tenantId: auth.tenant!.id,
        name: name.trim(),
        config: surveyConfig,
        ...(pageId ? { pageId } : {}),
      },
    });

    return NextResponse.json({ form }, { status: 201 });
  } catch (error: any) {
    console.error('[Formularios API] Error creating form:', error);
    return NextResponse.json({ error: 'Error al crear el formulario' }, { status: 500 });
  }
});
