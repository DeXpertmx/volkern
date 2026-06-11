import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/formularios/[id]/submit — Submit público de un formulario
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const form = await prisma.webForm.findUnique({
      where: { id: params.id },
      select: { id: true, tenantId: true, config: true },
    });

    if (!form) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const { payload } = body;

    if (!payload) {
      return NextResponse.json({ error: 'Payload es requerido' }, { status: 400 });
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    // 1. Guardar la submission
    const submission = await prisma.webFormSubmission.create({
      data: {
        formId: form.id,
        tenantId: form.tenantId,
        payload,
        ipAddress,
        userAgent,
      },
    });

    // 2. Intentar crear un Lead si hay email
    const email = payload.email || payload.Email || payload.correo;
    const nombre = payload.nombre || payload.name || payload.Nombre || 'Lead Web';
    const telefono = payload.telefono || payload.phone || payload.Telefono;
    const empresa = payload.empresa || payload.company || payload.Empresa;
    const notas = payload.notas || payload.notes || payload.Notas;

    if (email) {
      try {
        const lead = await prisma.lead.create({
          data: {
            tenantId: form.tenantId,
            nombre: String(nombre),
            email: String(email),
            ...(telefono ? { telefono: String(telefono) } : {}),
            ...(empresa ? { empresa: String(empresa) } : {}),
            notas: notas
              ? `Formulario web [${form.id}]:\n${String(notas)}`
              : `Lead generado desde formulario web [${form.id}].\n\nDatos: ${JSON.stringify(payload, null, 2)}`,
            fuente: 'Formulario Web',
            estado: 'nuevo',
          },
        });

        await prisma.webFormSubmission.update({
          where: { id: submission.id },
          data: { leadId: lead.id },
        });

        return NextResponse.json({ success: true, leadId: lead.id });
      } catch (leadError: any) {
        console.error('[Formularios Submit] Error creating lead:', leadError);
        // Lead creation failed but submission was saved
        return NextResponse.json({ success: true, warning: 'Lead creation failed' });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Formularios Submit] Error:', error);
    return NextResponse.json({ error: 'Error al procesar el formulario' }, { status: 500 });
  }
}
