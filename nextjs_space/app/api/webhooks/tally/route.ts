export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/webhooks/tally
 *
 * Recibe submissions de formularios Tally y crea leads en el CRM.
 * 
 * Tally webhook payload:
 * {
 *   "data": {
 *     "formId": "string",        // Tally form ID
 *     "submissionId": "string",  // Tally submission ID
 *     "answers": [{              // Array of field answers
 *       "key": "field_xxxx",
 *       "label": "Email",
 *       "value": "user@example.com",
 *       "type": "INPUT_EMAIL"
 *     }],
 *     "createdAt": "ISO date"
 *   }
 * }
 *
 * Configuración en Tally:
 * 1. Crear formulario en tally.so
 * 2. En Settings → Webhooks, agregar: https://volkern.app/api/webhooks/tally
 * 3. Mapear campos del form a lead fields en el panel de Formularios
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body.data || body

    const { formId, submissionId, answers, createdAt } = data

    if (!formId) {
      console.warn('[tally-webhook] Missing formId in payload')
      return NextResponse.json({ error: 'Missing formId' }, { status: 400 })
    }

    // ── Buscar el WebForm en nuestra BD para saber a qué tenant pertenece ──
    const webForm = await prisma.webForm.findFirst({
      where: { 
        config: { 
          path: ['tallyFormId'],
          equals: formId 
        }
      },
      select: { id: true, tenantId: true, config: true }
    })

    if (!webForm) {
      console.warn(`[tally-webhook] No WebForm found for tallyFormId: ${formId}`)
      return NextResponse.json({ error: 'Unknown form' }, { status: 404 })
    }

    const tenantId = webForm.tenantId
    const config = webForm.config as any

    // ── Extraer valores del formulario según el mapeo configurado ──
    const fieldMapping = config.fieldMapping || {}
    const extracted: Record<string, string> = {}

    const formFields = answers || data.fields || []
    if (Array.isArray(formFields)) {
      for (const answer of formFields) {
        const label = answer.label?.toLowerCase() || ''
        const value = typeof answer.value === 'string' ? answer.value : String(answer.value || '')

        // Mapeo por key configurado
        if (fieldMapping[answer.key]) {
          extracted[fieldMapping[answer.key]] = value
        }

        // Auto-detección por label
        if (label.includes('email') || label.includes('correo')) {
          extracted.email = value
        } else if (label.includes('nombre') || label.includes('name')) {
          extracted.nombre = extracted.nombre || value
        } else if (label.includes('teléfono') || label.includes('telefono') || label.includes('phone') || label.includes('celular')) {
          extracted.telefono = value
        } else if (label.includes('empresa') || label.includes('company')) {
          extracted.empresa = value
        } else if (label.includes('mensaje') || label.includes('message') || label.includes('comentario') || label.includes('notas')) {
          extracted.notas = value
        } else if (!extracted.nombre) {
          // Primer campo como nombre por defecto
          extracted.nombre = value
        }
      }
    }

    const nombre = extracted.nombre || 'Lead desde formulario'
    const email = extracted.email || `lead-${submissionId || Date.now()}@tally.so`

    // ── Crear el Lead en el CRM ──
    const lead = await prisma.lead.create({
      data: {
        tenantId,
        nombre,
        email,
        telefono: extracted.telefono || null,
        empresa: extracted.empresa || null,
        notas: extracted.notas || null,
        fuente: 'Tally Form',
        estado: 'nuevo',
        metadataExterna: {
          tallyFormId: formId,
          tallySubmissionId: submissionId,
          tallyCreatedAt: createdAt,
          rawAnswers: answers,
          webFormId: webForm.id,
        },
      },
    })

    // ── Guardar la submission completa ──
    await prisma.webFormSubmission.create({
      data: {
        formId: webForm.id,
        tenantId,
        leadId: lead.id,
        payload: body.data || body,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    })

    // ── Actualizar total de submissions en el form ──
    const submissionCount = await prisma.webFormSubmission.count({
      where: { formId: webForm.id },
    })

    console.log(`[tally-webhook] Lead creado: ${lead.id} (form: ${formId}, tenant: ${tenantId})`)

    return NextResponse.json({ 
      received: true, 
      leadId: lead.id,
      formId,
      submissionId,
      submissionCount,
    })

  } catch (error: any) {
    console.error('[tally-webhook] Error processing:', error.message)
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error.message },
      { status: 500 }
    )
  }
}
