import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

// GET /api/formularios/[id] — Obtener un formulario
export const GET = withTenantAuth(async (request, auth, context) => {
  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: 'ID de formulario requerido' }, { status: 400 });
    }

    const form = await prisma.webForm.findUnique({
      where: { id },
      include: {
        _count: { select: { submissions: true } },
      },
    });

    if (!form || form.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ form });
  } catch (error: any) {
    console.error('[Formularios API] Error getting form:', error);
    return NextResponse.json({ error: 'Error al obtener el formulario' }, { status: 500 });
  }
});

// PATCH /api/formularios/[id] — Actualizar un formulario
export const PATCH = withTenantAuth(async (request, auth, context) => {
  try {
    const id = context?.params?.id;
    console.error('[PATCH formularios] context:', JSON.stringify(context?.params));
    console.error('[PATCH formularios] id from context:', id);

    if (!id) {
      return NextResponse.json({ error: 'ID de formulario requerido' }, { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
      console.error('[PATCH formularios] received body keys:', Object.keys(body));
      console.error('[PATCH formularios] received name:', JSON.stringify(body.name));
      console.error('[PATCH formularios] config has pages?', !!body.config?.pages);
    } catch (parseErr: any) {
      console.error('[PATCH formularios] Failed to parse body:', parseErr.message);
      return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
    }

    const { name, config, pageId } = body;

    console.error('[PATCH formularios] updating form', id, 'with name:', name, 'config keys:', config ? Object.keys(config) : 'none');

    const existing = await prisma.webForm.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    console.error('[PATCH formularios] existing form name before update:', existing.name);

    const form = await prisma.webForm.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name } : {}),
        ...(config !== undefined ? { config } : {}),
        ...(pageId !== undefined ? { pageId } : {}),
      },
    });

    console.error('[PATCH formularios] form name after update:', form.name);
    return NextResponse.json({ form });
  } catch (error: any) {
    console.error('[Formularios API] Error updating form:', error);
    return NextResponse.json({ error: 'Error al actualizar el formulario' }, { status: 500 });
  }
});

// DELETE /api/formularios/[id] — Eliminar un formulario
export const DELETE = withTenantAuth(async (request, auth, context) => {
  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: 'ID de formulario requerido' }, { status: 400 });
    }

    const existing = await prisma.webForm.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    await prisma.webFormSubmission.deleteMany({ where: { formId: id } });
    await prisma.webForm.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Formularios API] Error deleting form:', error);
    return NextResponse.json({ error: 'Error al eliminar el formulario' }, { status: 500 });
  }
});
