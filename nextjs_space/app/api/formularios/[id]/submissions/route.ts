import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const dynamic = 'force-dynamic';

// GET /api/formularios/[id]/submissions — Listar submissions de un formulario
export const GET = withTenantAuth(async (request, auth, context) => {
  try {
    const id = context?.params?.id;
    if (!id) {
      return NextResponse.json({ error: 'ID de formulario requerido' }, { status: 400 });
    }

    const form = await prisma.webForm.findUnique({
      where: { id },
      select: { id: true, tenantId: true, name: true, config: true },
    });

    if (!form || form.tenantId !== auth.tenant!.id) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      prisma.webFormSubmission.findMany({
        where: { formId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          lead: { select: { id: true, nombre: true, email: true, telefono: true, empresa: true, estado: true } },
        },
      }),
      prisma.webFormSubmission.count({ where: { formId: id } }),
    ]);

    return NextResponse.json({
      form: { id: form.id, name: form.name },
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[Formularios API] Error listing submissions:', error);
    return NextResponse.json({ error: 'Error al listar submissions' }, { status: 500 });
  }
});
