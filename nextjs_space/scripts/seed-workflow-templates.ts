import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Templates de Workflows para n8n
 * Cada template referencia un workflow BASE en n8n que se duplicará para cada tenant
 * 
 * IMPORTANTE: Los n8nTemplateId deben corresponder a workflows reales en n8n
 * Crear los workflows en n8n primero y luego actualizar estos IDs
 */
const workflowTemplates = [
  // ===== AI =====
  {
    name: 'lead_ai_enrichment',
    displayName: 'AI Enrichment',
    description: 'Analiza y enriquece automáticamente los datos del lead usando inteligencia artificial (GPT-4)',
    n8nTemplateId: 'TEMPLATE_AI_ENRICHMENT', // Actualizar con ID real de n8n
    category: 'ai',
    icon: 'Sparkles',
    color: '#9333EA',
    isPremium: false,
    isActive: true,
    requiredConfig: null,
    defaultPayload: {
      action: 'analyze_lead',
      analyze: ['company_size', 'industry', 'social_presence', 'potential_score'],
      model: 'gpt-4'
    }
  },
  {
    name: 'lead_scoring_ai',
    displayName: 'Lead Scoring con IA',
    description: 'Calcula automáticamente el score del lead usando inteligencia artificial',
    n8nTemplateId: 'TEMPLATE_AI_SCORING', // Actualizar con ID real de n8n
    category: 'ai',
    icon: 'Target',
    color: '#F59E0B',
    isPremium: false,
    isActive: true,
    requiredConfig: null,
    defaultPayload: {
      action: 'calculate_score',
      factors: ['engagement', 'company_fit', 'budget_signals', 'urgency_indicators'],
      model: 'gpt-4'
    }
  },

  // ===== COMUNICACIÓN =====
  {
    name: 'whatsapp_followup',
    displayName: 'WhatsApp Follow Up',
    description: 'Envía mensajes de seguimiento personalizados por WhatsApp',
    n8nTemplateId: 'TEMPLATE_WHATSAPP_FOLLOWUP', // Actualizar con ID real de n8n
    category: 'comunicacion',
    icon: 'MessageCircle',
    color: '#25D366',
    isPremium: false,
    isActive: true,
    requiredConfig: {
      message: { type: 'string', required: true, label: 'Mensaje' }
    },
    defaultPayload: {
      channel: 'whatsapp',
      action: 'send_message'
    }
  },
  {
    name: 'multichannel_notification',
    displayName: 'Notificación Multi-Canal',
    description: 'Envía notificaciones a múltiples canales: Slack, Discord, Email',
    n8nTemplateId: 'TEMPLATE_MULTICHANNEL', // Actualizar con ID real de n8n
    category: 'comunicacion',
    icon: 'Zap',
    color: '#5865F2',
    isPremium: true,
    isActive: true,
    requiredConfig: {
      channels: { type: 'array', required: true, label: 'Canales', options: ['slack', 'discord', 'email'] }
    },
    defaultPayload: {
      channels: ['slack', 'email'],
      action: 'notify'
    }
  },

  // ===== CRM & VENTAS =====
  {
    name: 'crm_sync',
    displayName: 'Sincronizar con CRM',
    description: 'Sincroniza automáticamente los datos con tu CRM externo (Salesforce, HubSpot, etc)',
    n8nTemplateId: 'TEMPLATE_CRM_SYNC', // Actualizar con ID real de n8n
    category: 'crm',
    icon: 'Bot',
    color: '#FF6D5A',
    isPremium: true,
    isActive: true,
    requiredConfig: {
      crmType: { type: 'select', required: true, label: 'CRM', options: ['salesforce', 'hubspot', 'pipedrive'] }
    },
    defaultPayload: {
      action: 'sync_contact',
      createIfNotExists: true
    }
  },
  {
    name: 'cart_recovery',
    displayName: 'Recuperación de Carrito',
    description: 'Secuencia automática para recuperar carritos abandonados vía WhatsApp y Email',
    n8nTemplateId: 'TEMPLATE_CART_RECOVERY', // Actualizar con ID real de n8n
    category: 'crm',
    icon: 'Target',
    color: '#EF4444',
    isPremium: false,
    isActive: true,
    requiredConfig: null,
    defaultPayload: {
      action: 'recovery_sequence',
      channels: ['whatsapp', 'email'],
      delays: ['1h', '24h', '72h']
    }
  },

  // ===== INTEGRACIONES =====
  {
    name: 'stripe_payment_sync',
    displayName: 'Sync Pagos Stripe',
    description: 'Sincroniza automáticamente los pagos de Stripe con el CRM',
    n8nTemplateId: 'TEMPLATE_STRIPE_SYNC', // Actualizar con ID real de n8n
    category: 'integraciones',
    icon: 'Zap',
    color: '#635BFF',
    isPremium: true,
    isActive: true,
    requiredConfig: null,
    defaultPayload: {
      action: 'sync_payment',
      updateLeadStatus: true
    }
  },
  {
    name: 'google_calendar_sync',
    displayName: 'Sync Google Calendar',
    description: 'Sincroniza citas automáticamente con Google Calendar',
    n8nTemplateId: 'TEMPLATE_GCAL_SYNC', // Actualizar con ID real de n8n
    category: 'integraciones',
    icon: 'Calendar',
    color: '#4285F4',
    isPremium: false,
    isActive: true,
    requiredConfig: null,
    defaultPayload: {
      action: 'sync_event',
      createMeetLink: true
    }
  },
  {
    name: 'slack_notification',
    displayName: 'Notificar a Slack',
    description: 'Envía notificaciones a un canal de Slack',
    n8nTemplateId: 'TEMPLATE_SLACK_NOTIFY', // Actualizar con ID real de n8n
    category: 'integraciones',
    icon: 'MessageCircle',
    color: '#4A154B',
    isPremium: false,
    isActive: true,
    requiredConfig: {
      channel: { type: 'string', required: true, label: 'Canal de Slack' }
    },
    defaultPayload: {
      action: 'send_message'
    }
  },

  // ===== PAGOS =====
  {
    name: 'create_invoice',
    displayName: 'Crear Factura',
    description: 'Genera automáticamente una factura en tu sistema de facturación',
    n8nTemplateId: 'TEMPLATE_CREATE_INVOICE', // Actualizar con ID real de n8n
    category: 'pagos',
    icon: 'Zap',
    color: '#10B981',
    isPremium: true,
    isActive: true,
    requiredConfig: null,
    defaultPayload: {
      action: 'create_invoice',
      sendToClient: true
    }
  },
]

async function seedWorkflowTemplates() {
  console.log('📝 Seeding workflow templates...')
  console.log('='.repeat(60))

  const summary: Record<string, number> = {}

  try {
    for (const template of workflowTemplates) {
      // Verificar si ya existe
      const existing = await prisma.workflowTemplate.findUnique({
        where: { name: template.name }
      })

      // Convertir null a undefined para Prisma
      const prismaData = {
        ...template,
        requiredConfig: template.requiredConfig || undefined,
        defaultPayload: template.defaultPayload || undefined,
      }

      if (existing) {
        await prisma.workflowTemplate.update({
          where: { id: existing.id },
          data: prismaData
        })
        console.log(`✅ Actualizado: ${template.displayName}`)
      } else {
        await prisma.workflowTemplate.create({ data: prismaData })
        console.log(`✅ Creado: ${template.displayName}`)
      }

      // Contabilizar por categoría
      summary[template.category] = (summary[template.category] || 0) + 1
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 Resumen de templates:')
    Object.entries(summary).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} template(s)`)
    })
    console.log(`   TOTAL: ${workflowTemplates.length} templates`)
    console.log('='.repeat(60))
    
    console.log('\n⚠️  IMPORTANTE:')
    console.log('   Los n8nTemplateId son placeholders.')
    console.log('   Actualiza los IDs con los workflows reales de n8n.')
    console.log('   Los usuarios NO verán estos IDs, solo los nombres amigables.')
    
    console.log('\n🎉 Workflow templates seeded successfully!')
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

seedWorkflowTemplates()
