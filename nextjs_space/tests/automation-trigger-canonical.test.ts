import { describe, expect, it } from 'vitest'
import { VALID_TRIGGERS } from '@/lib/automation/constants'

/**
 * Triggers que las rutas de la app emiten realmente (fuente: codebase).
 * Si una ruta emite un nombre que no existe en VALID_TRIGGERS, el builder
 * nunca podría crear una automatización para él y quedaría muerto.
 */
const EMITTED_TRIGGERS = [
  'nuevo_lead',            // /api/leads (POST), /api/public/leads, tarjetas, skills
  'lead_actualizado',      // /api/leads/[id] (PUT/PATCH), /api/leads/[id]/stage
  'lead_etiquetado',       // /api/leads/[id] cuando cambian los tags
  'nota_creada',           // /api/leads/[id]/notes
  'interaccion_creada',    // /api/leads/[id]/interactions
  'formulario_enviado',    // /api/formularios/[id]/submit
  'cita_agendada',         // /api/public/citas, booking-skills
  'cita_confirmada',       // booking-skills
  'cita_cancelada',        // booking-skills, anytimebot
  'cita_reagendada',       // /api/citas/[id]/reagendar, anytimebot
  'pago_recibido',         // /api/webhooks/stripe
  'pago_fallido',          // dunning-service
  'webhook_recibido',      // /api/webhook/[webhookId]
  'n8n_workflow_completado', // /api/webhooks/n8n/callback
  'n8n_workflow_fallido',  // /api/webhooks/n8n/callback
  'evento_externo',        // /api/webhooks/n8n/callback, /api/webhooks/n8n/trigger
  'email_abierto',         // /api/email-campanas/track/[recipientId]
  'email_clicado',         // /api/email-campanas/track/[recipientId]/click
] as const

describe('Triggers canónicos emitidos por las rutas', () => {
  it('cada trigger emitido existe en VALID_TRIGGERS (el builder puede crearlo)', () => {
    for (const trigger of EMITTED_TRIGGERS) {
      expect(
        VALID_TRIGGERS[trigger as keyof typeof VALID_TRIGGERS],
        `El trigger emitido '${trigger}' no está en VALID_TRIGGERS`
      ).toBeDefined()
    }
  })

  it('no hay duplicados ni nombres vacíos en la lista', () => {
    expect(new Set(EMITTED_TRIGGERS).size).toBe(EMITTED_TRIGGERS.length)
  })
})
