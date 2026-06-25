import { prisma } from '../../db'
import { emit } from '../event-engine'

export interface LeadRecoveryConfig {
  tenantId: string
  inactivaThresholdHours: number
  stagesCalientes: string[]
  recoveryMessageTemplate?: string
  maxAttempts: number
  cooldownHours: number
}

const DEFAULT_CONFIG: LeadRecoveryConfig = {
  tenantId: '',
  inactivaThresholdHours: 48,
  stagesCalientes: ['calificado', 'propuesta', 'negociacion'],
  recoveryMessageTemplate: 'Hola {nombre}, solo quería preguntarte si tienes alguna duda. ¿Te gustaría que agendemos una llamada?',
  maxAttempts: 3,
  cooldownHours: 24
}

export class LeadRecoveryService {
  static async scanAndRecover(tenantId: string, config?: Partial<LeadRecoveryConfig>): Promise<{
    scanned: number
    recovered: number
    errors: string[]
  }> {
    const cfg = { ...DEFAULT_CONFIG, ...config, tenantId }
    
    const cutoff = new Date(Date.now() - cfg.inactivaThresholdHours * 60 * 60 * 1000)

    const leadsInactivos = await prisma.lead.findMany({
      where: {
        tenantId,
        estado: { in: cfg.stagesCalientes },
        fechaUltimaActividad: { lt: cutoff }
      }
    })

    let recovered = 0
    const errors: string[] = []

    for (const lead of leadsInactivos) {
      try {
        await emit({
          event: 'lead_recovery_trigger',
          tenant_id: tenantId,
          data: {
            lead_id: lead.id,
            nombre: lead.nombre,
            telefono: lead.telefono,
            email: lead.email,
            estado: lead.estado,
            inactivo_horas: Math.floor((Date.now() - lead.fechaUltimaActividad.getTime()) / (1000 * 60 * 60)),
            message_template: cfg.recoveryMessageTemplate
          }
        })

        await prisma.lead.update({
          where: { id: lead.id },
          data: { fechaUltimaActividad: new Date() }
        })

        recovered++
      } catch (error) {
        errors.push(`${lead.id}: ${error}`)
      }
    }

    await (prisma.systemAlert.create as any)({
      data: {
        level: 'INFO',
        message: `Lead recovery scan: ${recovered}/${leadsInactivos.length} recovered`,
        metadata: { tenantId, scanned: leadsInactivos.length, recovered, errors }
      }
    })

    return { scanned: leadsInactivos.length, recovered, errors }
  }

  static async recoverSingleLead(leadId: string, tenantId: string): Promise<boolean> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    })

    if (!lead) return false

    try {
      await emit({
        event: 'lead_recovery_trigger',
        tenant_id: tenantId,
        data: {
          lead_id: lead.id,
          nombre: lead.nombre,
          telefono: lead.telefono,
          email: lead.email,
          estado: lead.estado
        }
      })

      return true
    } catch (error) {
      console.error('[LeadRecovery] Error:', error)
      return false
    }
  }

  static async getInactiveLeads(tenantId: string, hours = 48) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)

    return prisma.lead.findMany({
      where: {
        tenantId,
        fechaUltimaActividad: { lt: cutoff },
        estado: { in: ['calificado', 'propuesta', 'negociacion', 'contactado'] }
      },
      select: {
        id: true,
        nombre: true,
        telefono: true,
        email: true,
        estado: true,
        fechaUltimaActividad: true,
        scoreValue: true
      },
      orderBy: { fechaUltimaActividad: 'asc' }
    })
  }
}