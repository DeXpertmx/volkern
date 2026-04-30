import { prisma } from '../db'
import { VolkernPack, PackTrigger, PackAction, TriggerCondition } from './types'

export class PackSystem {
  private static packs: Map<string, VolkernPack> = new Map()

  static async loadPack(tenantId: string): Promise<VolkernPack | null> {
    if (this.packs.has(tenantId)) {
      return this.packs.get(tenantId)!
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true }
    })

    const config = (tenant?.config as any) || {}
    const packData = config.volkern_pack || config.pack

    if (!packData) {
      return this.getDefaultPack()
    }

    const pack: VolkernPack = {
      pack: packData.pack || 'default',
      version: packData.version || '1.0',
      pipeline: packData.pipeline || [],
      triggers: packData.triggers || [],
      metadata: packData.metadata
    }

    this.packs.set(tenantId, pack)
    return pack
  }

  static getDefaultPack(): VolkernPack {
    return {
      pack: 'default',
      version: '1.0',
      pipeline: [
        { id: 'lead_nuevo', name: 'Lead Nuevo', order: 1 },
        { id: 'contactado', name: 'Contactado', order: 2 },
        { id: 'calificado', name: 'Calificado', order: 3 },
        { id: 'cita_agendada', name: 'Cita Agendada', order: 4 },
        { id: 'cita_realizada', name: 'Cita Realizada', order: 5 },
        { id: 'propuesta', name: 'Propuesta', order: 6 },
        { id: 'negociacion', name: 'Negociación', order: 7 },
        { id: 'cerrado', name: 'Cerrado', order: 8 }
      ],
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
            { field: 'stage', operator: 'in', value: ['contactado', 'calificado'] }
          ],
          actions: [
            { type: 'run_ai', config: { agent: 'followup_generator' } },
            { type: 'send_whatsapp_dynamic' }
          ]
        },
        {
          trigger: 'deal_stage_changed',
          conditions: [
            { field: 'stage', operator: 'equals', value: 'negociacion' }
          ],
          actions: [
            { type: 'run_ai', config: { agent: 'deal_strategy' } }
          ]
        }
      ]
    }
  }

  static async getTriggers(tenantId: string, eventType: string): Promise<PackTrigger[]> {
    const pack = await this.loadPack(tenantId)
    return pack.triggers.filter(t => t.trigger === eventType)
  }

  static evaluateCondition(condition: TriggerCondition, data: Record<string, unknown>): boolean {
    const fieldValue = data[condition.field]
    const { operator, value } = condition

    switch (operator) {
      case 'equals':
        return fieldValue === value
      case 'not_equals':
        return fieldValue !== value
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue)
      case 'not_in':
        return Array.isArray(value) && !value.includes(fieldValue)
      case 'greater_than':
        return typeof fieldValue === 'number' && fieldValue > (value as number)
      case 'less_than':
        return typeof fieldValue === 'number' && fieldValue < (value as number)
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(value as string)
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null
      default:
        return false
    }
  }

  static async savePack(tenantId: string, pack: VolkernPack): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { configuracion: { volkern_pack: pack } }
    })
    this.packs.set(tenantId, pack)
  }

  static clearCache(tenantId?: string): void {
    if (tenantId) {
      this.packs.delete(tenantId)
    } else {
      this.packs.clear()
    }
  }
}