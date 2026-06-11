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

    if (!id) {
      return NextResponse.json({ error: 'ID de formulario requerido' }, { status: 400 });
    }

    const body = await request.json();
    const { name, config, pageId } = body;

    const existing = await prisma.webForm.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    const form = await prisma.webForm.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name } : {}),
        ...(config !== undefined ? { config } : {}),
        ...(pageId !== undefined ? { pageId } : {}),
      },
    });

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
