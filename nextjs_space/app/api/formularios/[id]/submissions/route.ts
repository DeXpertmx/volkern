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

    // Fetch submissions
    const [submissions, total] = await Promise.all([
      prisma.webFormSubmission.findMany({
        where: { formId: params.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.webFormSubmission.count({ where: { formId: params.id } }),
    ]);

    // Separately fetch lead data for submissions that have a leadId
    const leadIds = [...new Set(submissions.filter((s) => s.leadId).map((s) => s.leadId!))];
    const leads = leadIds.length > 0
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, nombre: true, email: true, telefono: true, empresa: true, estado: true },
        })
      : [];
    const leadMap = new Map(leads.map((l) => [l.id, l]));

    const submissionsWithLeads = submissions.map((s) => ({
      ...s,
      lead: s.leadId ? leadMap.get(s.leadId) || null : null,
    }));

    return NextResponse.json({
      form: { id: form.id, name: form.name },
      submissions: submissionsWithLeads,
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
