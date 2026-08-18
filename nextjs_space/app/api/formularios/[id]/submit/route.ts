import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import type { FormSubmittedEvent } from '@/lib/types/events';

// Emite el evento FORM_SUBMITTED (dispara automatizaciones con trigger
// 'formulario_enviado'). No bloqueante: si el bus falla, el submit continúa.
function emitFormSubmitted(
  form: { id: string; tenantId: string; name: string },
  submission: { id: string },
  opts: { leadId?: string; email?: string; nombre?: string; telefono?: string; payload: Record<string, unknown> },
): void {
  try {
    const eventPayload: FormSubmittedEvent = {
      tenantId: form.tenantId,
      timestamp: new Date(),
      source: 'webhook',
      formId: form.id,
      formName: form.name || 'Formulario',
      submissionId: submission.id,
      leadId: opts.leadId,
      email: opts.email,
      nombre: opts.nombre,
      telefono: opts.telefono,
      payload: opts.payload,
    };
    eventBus.emitEvent(EVENTS.FORM_SUBMITTED, eventPayload);
  } catch (err) {
    console.warn('[Formularios Submit] No se pudo emitir evento FORM_SUBMITTED:', err);
  }
}

// Notifica por Telegram al agente del tenant cuando el formulario genera un
// lead nuevo. No bloqueante y con fallback silencioso.
async function notifyNewLeadByTelegram(
  form: { id: string; tenantId: string; name: string },
  lead: { id: string; nombre: string; email: string },
): Promise<void> {
  try {
    const [{ notifyByTelegram }, { createSystemContext }] = await Promise.all([
      import('@/lib/skills/notification-layer'),
      import('@/lib/skills/context'),
    ]);
    await notifyByTelegram(
      `📥 *Nuevo lead por formulario*\n\n📋 *Formulario:* ${form.name}\n👤 *Nombre:* ${lead.nombre}\n📧 *Email:* ${lead.email}\n🆔 *Lead:* ${lead.id}`,
      createSystemContext(form.tenantId),
    ).catch((err: any) => console.error('[Formularios Submit] Error Telegram:', err));
  } catch (err) {
    console.warn('[Formularios Submit] Notificación Telegram no disponible:', err);
  }
}

// Campos estándar del Lead: se mapean a su columna. Todo lo demás del
// payload (campos personalizados del formulario) se conserva como notas,
// con el nombre del formulario como contexto — nada se pierde.
export const CAMPOS_ESTANDAR = new Set([
  'email', 'Email', 'correo',
  'nombre', 'name', 'Nombre',
  'telefono', 'phone', 'Telefono',
  'empresa', 'company', 'Empresa',
  'notas', 'notes', 'Notas',
]);

// Construye las notas del lead: contexto del formulario + notas del
// solicitante + campos personalizados que no tienen columna propia.
export function buildLeadNotas(payload: Record<string, any>, formName: string, notas?: any): string {
  const partes: string[] = [`Lead generado desde el formulario: ${formName}`];
  if (notas) partes.push(`Notas del solicitante:\n${String(notas)}`);

  const extra = Object.entries(payload)
    .filter(([k]) => !CAMPOS_ESTANDAR.has(k))
    .filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (extra.length > 0) {
    partes.push('Datos adicionales del formulario:');
    for (const [k, v] of extra) {
      partes.push(`• ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
    }
  }
  return partes.join('\n\n');
}

// POST /api/formularios/[id]/submit — Submit público de un formulario
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const form = await prisma.webForm.findUnique({
      where: { id: params.id },
      select: { id: true, tenantId: true, name: true, config: true },
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

    const formName = form.name || (form.config as any)?.title || 'Formulario';

    if (email) {
      try {
        const lead = await prisma.lead.create({
          data: {
            tenantId: form.tenantId,
            nombre: String(nombre),
            email: String(email),
            ...(telefono ? { telefono: String(telefono) } : {}),
            ...(empresa ? { empresa: String(empresa) } : {}),
            notas: buildLeadNotas(payload, formName, notas),
            fuente: 'Formulario Web',
            estado: 'nuevo',
          },
        });

        await prisma.webFormSubmission.update({
          where: { id: submission.id },
          data: { leadId: lead.id },
        });

        // Evento para automatizaciones (trigger 'formulario_enviado')
        emitFormSubmitted(form, submission, {
          leadId: lead.id,
          email: String(email),
          nombre: String(nombre),
          ...(telefono ? { telefono: String(telefono) } : {}),
          payload,
        });

        // Notificar al agente por Telegram (no bloqueante)
        notifyNewLeadByTelegram(form, { id: lead.id, nombre: String(nombre), email: String(email) });

        return NextResponse.json({ success: true, leadId: lead.id });
      } catch (leadError: any) {
        console.error('[Formularios Submit] Error creating lead:', leadError);
        // Lead creation failed but submission was saved
        return NextResponse.json({ success: true, warning: 'Lead creation failed' });
      }
    }

    // Formulario sin lead: aun así se emite el evento para automatizaciones
    emitFormSubmitted(form, submission, { payload });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Formularios Submit] Error:', error);
    return NextResponse.json({ error: 'Error al procesar el formulario' }, { status: 500 });
  }
}
