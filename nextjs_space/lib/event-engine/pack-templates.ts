type VolkernPack = any
type PackTrigger = any
type PackPipelineStage = any

const BASIC_PIPELINE: PackPipelineStage[] = [
  { id: 'nuevo', name: 'Nuevo', order: 1 },
  { id: 'contactado', name: 'Contactado', order: 2 },
  { id: 'calificado', name: 'Calificado', order: 3 },
  { id: 'cerrado', name: 'Cerrado', order: 4 }
]

const HIGH_TICKET_PIPELINE: PackPipelineStage[] = [
  { id: 'lead_nuevo', name: 'Lead Nuevo', order: 1 },
  { id: 'contactado', name: 'Contactado', order: 2 },
  { id: 'calificado', name: 'Calificado', order: 3 },
  { id: 'cita_agendada', name: 'Cita Agendada', order: 4 },
  { id: 'cita_realizada', name: 'Cita Realizada', order: 5 },
  { id: 'propuesta', name: 'Propuesta', order: 6 },
  { id: 'negociacion', name: 'Negociación', order: 7 },
  { id: 'cerrado', name: 'Cerrado', order: 8 }
]

const ENTERPRISE_PIPELINE: PackPipelineStage[] = [
  { id: 'lead_nuevo', name: 'Lead Nuevo', order: 1 },
  { id: 'descubrimiento', name: 'Descubrimiento', order: 2 },
  { id: 'contactado', name: 'Contactado', order: 3 },
  { id: 'calificado', name: 'Calificado', order: 4 },
  { id: 'demo', name: 'Demo', order: 5 },
  { id: 'cita_agendada', name: 'Cita Agendada', order: 6 },
  { id: 'cita_realizada', name: 'Cita Realizada', order: 7 },
  { id: 'propuesta', name: 'Propuesta', order: 8 },
  { id: 'negociacion', name: 'Negociación', order: 9 },
  { id: 'contrato', name: 'Contrato', order: 10 },
  { id: 'cerrado', name: 'Cerrado', order: 11 }
]

export const PACK_TEMPLATES: Record<string, VolkernPack> = {
  basic: {
    pack: 'basic',
    version: '1.0',
    pipeline: BASIC_PIPELINE,
    triggers: [
      {
        trigger: 'lead_created',
        actions: [
          { type: 'send_whatsapp', config: { template: 'welcome' } }
        ]
      },
      {
        trigger: 'lead_updated',
        conditions: [{ field: 'estado', operator: 'equals', value: 'calificado' }],
        actions: [
          { type: 'add_note', config: { content: 'Lead calificado - requiere seguimiento' } }
        ]
      }
    ],
    metadata: {
      description: 'Pipeline básico para negocios pequeños',
      industry: 'general',
      complexity: 'low'
    }
  },

  high_ticket: {
    pack: 'high_ticket',
    version: '1.0',
    pipeline: HIGH_TICKET_PIPELINE,
    triggers: [
      {
        trigger: 'lead_created',
        actions: [
          { type: 'assign_owner' },
          { type: 'send_whatsapp', config: { template: 'welcome' } },
          { type: 'run_ai', config: { agent: 'lead_classifier' } }
        ]
      },
      {
        trigger: 'no_response_24h',
        conditions: [
          { field: 'estado', operator: 'in', value: ['contactado', 'calificado'] }
        ],
        actions: [
          { type: 'run_ai', config: { agent: 'followup_generator' } },
          { type: 'send_whatsapp_dynamic', config: { message: 'Hola {nombre}, ¿cómo estás?' } }
        ]
      },
      {
        trigger: 'no_response_48h',
        conditions: [
          { field: 'estado', operator: 'in', value: ['propuesta', 'negociacion'] }
        ],
        actions: [
          { type: 'run_ai', config: { agent: 'ghosting_recovery' } },
          { type: 'notify_owner', config: { message: 'Lead inactivo en negociación' } }
        ]
      },
      {
        trigger: 'deal_stage_changed',
        conditions: [
          { field: 'estado', operator: 'equals', value: 'negociacion' }
        ],
        actions: [
          { type: 'run_ai', config: { agent: 'deal_strategy' } }
        ]
      },
      {
        trigger: 'cita_agendada',
        actions: [
          { type: 'send_whatsapp_dynamic', config: { message: 'Tu cita está confirmada para {fecha}. ¡Nos vemos!' } },
          { type: 'create_task', config: { title: 'PrepararDemo', description: 'Preparar material para demo' } }
        ]
      }
    ],
    metadata: {
      description: 'Pipeline completo para ventas de alto valor',
      industry: 'saas, servicios, consultorios',
      complexity: 'medium'
    }
  },

  enterprise: {
    pack: 'enterprise',
    version: '1.0',
    pipeline: ENTERPRISE_PIPELINE,
    triggers: [
      {
        trigger: 'lead_created',
        actions: [
          { type: 'assign_owner' },
          { type: 'run_ai', config: { agent: 'lead_classifier' } },
          { type: 'send_email', config: { subject: 'Bienvenido', body: 'Gracias por tu interés...' } }
        ]
      },
      {
        trigger: 'lead_updated',
        conditions: [{ field: 'score', operator: 'greater_than', value: 80 }],
        actions: [
          { type: 'notify_owner', config: { message: 'Lead HOT detectado' } },
          { type: 'create_task', config: { title: 'Urgente', description: 'Contactar inmediatamente' } }
        ]
      },
      {
        trigger: 'no_response_24h',
        conditions: [
          { field: 'estado', operator: 'in', value: ['descubrimiento', 'demo'] }
        ],
        actions: [
          { type: 'run_ai', config: { agent: 'followup_generator' } }
        ]
      },
      {
        trigger: 'no_response_72h',
        actions: [
          { type: 'run_ai', config: { agent: 'ghosting_recovery' } },
          { type: 'webhook', config: { url: process.env.ESCALATION_WEBHOOK } }
        ]
      },
      {
        trigger: 'deal_stage_changed',
        conditions: [
          { field: 'estado', operator: 'equals', value: 'contrato' }
        ],
        actions: [
          { type: 'run_ai', config: { agent: 'deal_strategy' } },
          { type: 'send_email', config: { subject: 'Contrato listo', body: 'Adjuntamos el contrato...' } }
        ]
      }
    ],
    metadata: {
      description: 'Pipeline enterprise conWorkflows avanzados',
      industry: 'b2b, enterprise, fintech',
      complexity: 'high'
    }
  }
}

export function getPackTemplate(id: string): VolkernPack | null {
  return PACK_TEMPLATES[id] || null
}

export function listPackTemplates(): Array<{ id: string; name: string; description: string; complexity: string }> {
  return Object.entries(PACK_TEMPLATES).map(([id, pack]) => ({
    id,
    name: id === 'high_ticket' ? 'High Ticket' : id.charAt(0).toUpperCase() + id.slice(1),
    description: pack.metadata?.description as string || '',
    complexity: pack.metadata?.complexity as string || 'low'
  }))
}