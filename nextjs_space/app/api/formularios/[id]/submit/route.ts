import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { ensureAutomationListeners } from '@/lib/skills/automation-listener';
import type { FormSubmittedEvent } from '@/lib/types/events';
import {
  buildThankYouDocument,
  getThankYouRedirectUrl,
} from '@/lib/marketing/form-thank-you';
import type { ThankYouConfig } from '@/lib/marketing/form-thank-you';
import { resolveLeadMapping } from '@/lib/marketing/form-lead-mapping';
import {
  CAMPOS_ESTANDAR,
  buildLeadNotas,
  parseSubmissionPayload,
} from '@/lib/marketing/form-submit-helpers';

// Emite el evento FORM_SUBMITTED (dispara automatizaciones con trigger
// 'formulario_enviado'). No bloqueante: si el bus falla, el submit continúa.
function emitFormSubmitted(
  form: { id: string; tenantId: string; name: string },
  submission: { id: string },
  opts: { leadId?: string; email?: string; nombre?: string; telefono?: string; payload: Record<string, unknown> },
): void {
  try {
    // En Next.js standalone el listener registrado desde instrumentation.ts
    // puede vivir en otra instancia del event bus (bundles separados) y nunca
    // recibiría el evento. Aseguramos el listener en ESTE bundle antes de
    // emitir (mismo patrón que initGemmaChatbot en el puente de Evolution).
    ensureAutomationListeners();

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

function isJsonClient(req: Request): boolean {
  const contentType = req.headers.get('content-type') || '';
  const acceptsJson = (req.headers.get('accept') || '').includes('application/json');
  return contentType.includes('application/json') || acceptsJson;
}

function respondAfterSubmission(
  req: Request,
  formConfig: unknown,
  body: Record<string, unknown>,
): Response {
  if (isJsonClient(req)) {
    return NextResponse.json(body);
  }

  const thankYou = (formConfig && typeof formConfig === 'object' && 'thankYou' in formConfig)
    ? (formConfig as { thankYou?: ThankYouConfig }).thankYou
    : undefined;
  const redirectUrl = getThankYouRedirectUrl(thankYou);

  if (redirectUrl) {
    return NextResponse.redirect(new URL(redirectUrl), 303);
  }

  return new Response(buildThankYouDocument(thankYou), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Nunca muestra agradecimiento si la persistencia falló: el navegador recibe un error real. */
function respondSubmissionError(req: Request, status = 500): Response {
  if (isJsonClient(req)) {
    return NextResponse.json({ error: 'No se pudieron registrar los datos. Inténtalo de nuevo.' }, { status });
  }

  return new Response(
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No se pudo registrar</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif}.card{max-width:560px;padding:40px 24px;text-align:center;border-radius:16px;background:#fff7ed;color:#9a3412;box-shadow:0 8px 30px rgba(15,23,42,.08)}h1{font-size:24px;margin:0 0 12px}p{margin:0;line-height:1.6}</style></head><body><main class="card"><h1>No pudimos registrar tus datos</h1><p>El formulario no se guardó correctamente. Inténtalo de nuevo.</p></main></body></html>',
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function getLeadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// POST /api/formularios/[id]/submit — Submit público de un formulario
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const form = await prisma.webForm.findUnique({
      where: { id: params.id },
      select: { id: true, tenantId: true, name: true, config: true },
    });

    if (!form) {
      return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
    }

    const payload = await parseSubmissionPayload(req);

    if (!payload || Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Payload es requerido' }, { status: 400 });
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    // La submission y el lead se persisten en una sola transacción. Así nunca
    // mostramos agradecimiento dejando una submission huérfana o un lead sin
    // vínculo cuando falla cualquiera de las dos escrituras.
    const email = payload.email || payload.Email || payload.correo;
    const nombre = payload.nombre || payload.name || payload.Nombre || 'Lead Web';
    const telefono = payload.telefono || payload.phone || payload.Telefono;
    const empresa = payload.empresa || payload.company || payload.Empresa;
    const notas = payload.notas || payload.notes || payload.Notas;
    const formName = form.name || (form.config as any)?.title || 'Formulario';

    let persisted: {
      submission: { id: string };
      lead: { id: string; nombre: string; email: string } | null;
    };

    try {
      persisted = await prisma.$transaction(async (tx) => {
        const submission = await tx.webFormSubmission.create({
          data: {
            formId: form.id,
            tenantId: form.tenantId,
            payload,
            ipAddress,
            userAgent,
          },
        });

        const definitions = await tx.leadFieldDefinition.findMany({
          where: { tenantId: form.tenantId, activo: true },
          select: { fieldKey: true, activo: true, type: true },
        });
        const mapped = resolveLeadMapping(form.config, payload, definitions);
        const standard = mapped.standard as Record<string, unknown>;
        const mappedEmail = standard.email ?? email;

        if (!mappedEmail) {
          return { submission, lead: null };
        }

        const unmappedPayload = Object.fromEntries(mapped.unmapped);
        const lead = await tx.lead.create({
          data: {
            tenantId: form.tenantId,
            nombre: String(standard.nombre ?? nombre),
            email: String(mappedEmail),
            ...(standard.telefono !== undefined ? { telefono: String(standard.telefono) } : telefono ? { telefono: String(telefono) } : {}),
            ...(standard.empresa !== undefined ? { empresa: String(standard.empresa) } : empresa ? { empresa: String(empresa) } : {}),
            ...(standard.cargo !== undefined ? { cargo: String(standard.cargo) } : {}),
            ...(standard.ubicacion !== undefined ? { ubicacion: String(standard.ubicacion) } : {}),
            ...(standard.direccion !== undefined ? { direccion: String(standard.direccion) } : {}),
            ...(standard.ciudad !== undefined ? { ciudad: String(standard.ciudad) } : {}),
            ...(standard.codigoPostal !== undefined ? { codigoPostal: String(standard.codigoPostal) } : {}),
            ...(standard.pais !== undefined ? { pais: String(standard.pais) } : {}),
            ...(standard.linkedin !== undefined ? { linkedin: String(standard.linkedin) } : {}),
            notas: buildLeadNotas(unmappedPayload, formName, standard.notas ?? notas),
            ...(Object.keys(mapped.custom).length > 0 ? { metadataExterna: mapped.custom as any } : {}),
            fuente: 'Formulario Web',
            estado: 'nuevo',
          },
        });

        await tx.webFormSubmission.update({
          where: { id: submission.id },
          data: { leadId: lead.id },
        });

        return { submission, lead: { id: lead.id, nombre: String(standard.nombre ?? nombre), email: String(mappedEmail) } };
      });
    } catch (persistenceError) {
      console.error('[Formularios Submit] Error persistiendo submission/lead:', {
        formId: form.id,
        tenantId: form.tenantId,
        email: email ? String(email) : undefined,
        error: getLeadErrorMessage(persistenceError),
      });
      return respondSubmissionError(req);
    }

    if (persisted.lead) {
      // Evento para automatizaciones (trigger 'formulario_enviado')
      emitFormSubmitted(form, persisted.submission, {
        leadId: persisted.lead.id,
        email: persisted.lead.email,
        nombre: persisted.lead.nombre,
        ...(telefono ? { telefono: String(telefono) } : {}),
        payload,
      });

      // Notificar al agente por Telegram (no bloqueante)
      notifyNewLeadByTelegram(form, persisted.lead);
    } else {
      // Formulario sin email: se conserva la submission y se emite el evento,
      // pero no se inventa un Lead sin un dato mínimo de contacto.
      emitFormSubmitted(form, persisted.submission, { payload });
    }

    return respondAfterSubmission(req, form.config, {
      success: true,
      ...(persisted.lead ? { leadId: persisted.lead.id } : {}),
    });
  } catch (error: any) {
    console.error('[Formularios Submit] Error:', error);
    return respondSubmissionError(req);
  }
}
