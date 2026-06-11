import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/formularios/[id]/submissions — Listar submissions de un formulario
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get('x-tenant-id');
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
    }

    // Verify form ownership
    const form = await prisma.webForm.findUnique({
      where: { id: params.id },
      select: { id: true, tenantId: true, name: true, config: true },
    });

    if (!form || form.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    // Pagination
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const skip = (page - 1) * limit;

    // Fetch submissions with optional lead info
    const [submissions, total] = await Promise.all([
      prisma.webFormSubmission.findMany({
        where: { formId: params.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          lead: {
            select: {
              id: true,
              nombre: true,
              email: true,
              telefono: true,
              empresa: true,
              estado: true,
            },
          },
        },
      }),
      prisma.webFormSubmission.count({ where: { formId: params.id } }),
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
}
