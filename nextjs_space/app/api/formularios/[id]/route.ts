import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { extractTenantFromRequest } from '@/lib/tenant-context';

async function getTenantId(req: NextRequest): Promise<string | null> {
  const { tenantId } = await extractTenantFromRequest(req);
  return tenantId;
}

// GET /api/formularios/[id] — Obtener un formulario
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId(req);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
    }

    const form = await prisma.webForm.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { submissions: true } },
      },
    });

    if (!form || form.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ form });
  } catch (error: any) {
    console.error('[Formularios API] Error getting form:', error);
    return NextResponse.json({ error: 'Error al obtener el formulario' }, { status: 500 });
  }
}

// PATCH /api/formularios/[id] — Actualizar un formulario
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId(req);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
    }

    const body = await req.json();
    const { name, config, pageId } = body;

    const existing = await prisma.webForm.findUnique({ where: { id: params.id } });
    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    const form = await prisma.webForm.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(config !== undefined ? { config } : {}),
        ...(pageId !== undefined ? { pageId } : {}),
      },
    });

    return NextResponse.json({ form });
  } catch (error: any) {
    console.error('[Formularios API] Error updating form:', error);
    return NextResponse.json({ error: 'Error al actualizar el formulario' }, { status: 500 });
  }
}

// DELETE /api/formularios/[id] — Eliminar un formulario
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId(req);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
    }

    const existing = await prisma.webForm.findUnique({ where: { id: params.id } });
    if (!existing || existing.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    await prisma.webFormSubmission.deleteMany({ where: { formId: params.id } });
    await prisma.webForm.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Formularios API] Error deleting form:', error);
    return NextResponse.json({ error: 'Error al eliminar el formulario' }, { status: 500 });
  }
}
