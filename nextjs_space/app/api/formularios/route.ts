import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/formularios — Listar formularios del tenant
export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id');
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
    }

    const forms = await prisma.webForm.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { submissions: true } },
      },
    });

    return NextResponse.json({ forms });
  } catch (error: any) {
    console.error('[Formularios API] Error listing forms:', error);
    return NextResponse.json({ error: 'Error al listar formularios' }, { status: 500 });
  }
}

// POST /api/formularios — Crear un nuevo formulario
export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id');
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
    }

    const body = await req.json();
    const { name, config, pageId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre del formulario es requerido' }, { status: 400 });
    }

    // Default survey JSON if none provided
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
        tenantId,
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
}
