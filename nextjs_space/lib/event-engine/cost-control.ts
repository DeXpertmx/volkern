import { prisma } from '../db'
import { PLAN_LIMITS, PLANS, getPlanConfig } from '../plans'

const AI_USAGE_COUNTERS: Map<string, { daily: number; monthly: number; lastReset: Date }> = new Map()

export interface CostControlConfig {
  max_ai_per_day: number
  max_ai_per_month: number
  allowed_agents: string[]
  fallback_on_limit: boolean
}

export interface CostCheckResult {
  allowed: boolean
  remaining_today: number
  remaining_month: number
  reason?: string
}

const DEFAULT_CONFIG: CostControlConfig = {
  max_ai_per_day: 50,
  max_ai_per_month: 500,
  allowed_agents: ['lead_classifier', 'followup_generator', 'ghosting_recovery', 'deal_strategy', 'response_assistant'],
  fallback_on_limit: true
}

export class CostControl {
  static async checkAIAction(tenantId: string, agent: string): Promise<CostCheckResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, subscription: true }
    })

    const plan = tenant?.plan || PLANS.ESENCIAL
    const config = await this.getConfig(tenantId, plan)

    if (!config.allowed_agents.includes(agent)) {
      return { allowed: false, remaining_today: 0, remaining_month: 0, reason: `Agent not allowed: ${agent}` }
    }

    const key = `${tenantId}_${agent}`
    const counter = AI_USAGE_COUNTERS.get(key) || { daily: 0, monthly: 0, lastReset: new Date() }
    
    const now = new Date()
    const isNewDay = now.getDate() !== counter.lastReset.getDate()
    const isNewMonth = now.getMonth() !== counter.lastReset.getMonth()

    if (isNewDay) counter.daily = 0
    if (isNewMonth) counter.monthly = 0

    if (counter.daily >= config.max_ai_per_day) {
      return { 
        allowed: config.fallback_on_limit, 
        remaining_today: 0, 
        remaining_month: config.max_ai_per_month - counter.monthly,
        reason: 'Daily AI limit reached'
      }
    }

    if (counter.monthly >= config.max_ai_per_month) {
      return { 
        allowed: config.fallback_on_limit, 
        remaining_today: config.max_ai_per_day - counter.daily, 
        remaining_month: 0,
        reason: 'Monthly AI limit reached'
      }
    }

    return { 
      allowed: true, 
      remaining_today: config.max_ai_per_day - counter.daily - 1, 
      remaining_month: config.max_ai_per_month - counter.monthly - 1
    }
  }

  static async recordAIAction(tenantId: string, agent: string): Promise<void> {
    const key = `${tenantId}_${agent}`
    const counter = AI_USAGE_COUNTERS.get(key) || { daily: 0, monthly: 0, lastReset: new Date() }
    
    counter.daily++
    counter.monthly++
    AI_USAGE_COUNTERS.set(key, counter)

    await prisma.systemAlert.create({
      data: {
        level: 'INFO',
        message: `[CostControl] AI action recorded: ${agent}`,
        metadata: { tenantId, agent, daily: counter.daily, monthly: counter.monthly }
      }
    })
  }

  static async getUsage(tenantId: string): Promise<{ daily: number; monthly: number }> {
    let totalDaily = 0
    let totalMonthly = 0

    AI_USAGE_COUNTERS.forEach((counter, key) => {
      if (key.startsWith(tenantId)) {
        const now = new Date()
        const isNewDay = now.getDate() !== counter.lastReset.getDate()
        if (!isNewDay) totalDaily += counter.daily
        
        const isNewMonth = now.getMonth() !== counter.lastReset.getMonth()
        if (!isNewMonth) totalMonthly += counter.monthly
      }
    })

    return { daily: totalDaily, monthly: totalMonthly }
  }

  static async getConfig(tenantId: string, plan?: string): Promise<CostControlConfig> {
    if (!plan) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true }
      })
      plan = tenant?.plan || PLANS.ESENCIAL
    }

    const limits = await getPlanConfig(plan)
    const aiLimit = limits.limites?.ai_calls_per_month || limits.limites?.automation_runs

    return {
      max_ai_per_day: aiLimit === -1 ? 1000 : Math.min(50, Math.floor((aiLimit || 100) / 10)),
      max_ai_per_month: aiLimit === -1 ? 10000 : (aiLimit || 100),
      allowed_agents: DEFAULT_CONFIG.allowed_agents,
      fallback_on_limit: plan === PLANS.ESENCIAL || plan === PLANS.BASICO
    }
  }

  static generateFallbackResponse(agent: string): string {
    const fallbacks: Record<string, string> = {
      lead_classifier: JSON.stringify({ score: 50, category: 'C', notes: 'Sin IA - clasificado por defecto' }),
      followup_generator: 'Hola, solo quería preguntarte si sigues interesado. ¿Te gustaría que platiquemos?',
      ghosting_recovery: 'Hola, veo que no hemos tenido contacto. ¿Hay algo en lo que pueda ayudarte?',
      deal_strategy: JSON.stringify({ steps: ['Agendar llamada', 'Enviar propuesta', 'Hacer follow-up'] }),
      response_assistant: 'Gracias por tu mensaje. Te atendemos a la brevedad.'
    }
    return fallbacks[agent] || 'Respuesta automática'
  }
}

export const costControl = {
  checkAIAction: CostControl.checkAIAction.bind(CostControl),
  recordAIAction: CostControl.recordAIAction.bind(CostControl),
  getUsage: CostControl.getUsage.bind(CostControl),
  getConfig: CostControl.getConfig.bind(CostControl),
  generateFallbackResponse: CostControl.generateFallbackResponse.bind(CostControl)
}