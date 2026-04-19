import { prisma } from '../../db';
import { Queue } from 'bullmq';
import { redisConnection } from '../../core/redis';

/**
 * Motor de Reglas de Automatización de Marketing
 */
export class AutomationRuleEngine {
  private static workflowQueue = new Queue('marketing:workflows', { connection: redisConnection });

  /**
   * Procesa un evento entrante buscando reglas activas que coincidan
   */
  static async processEvent(triggerType: string, payload: any) {
    const { tenantId } = payload;

    // 1. Buscar reglas activas para este trigger y tenant
    const rules = await prisma.automationRule.findMany({
      where: {
        tenantId,
        triggerType,
        isActive: true
      }
    });

    if (rules.length === 0) return;

    for (const rule of rules) {
      try {
        // 2. Evaluar condiciones (Simple match por ahora, expandible con JSON logic)
        const matches = await this.evaluateConditions(rule.conditions, payload);
        
        if (matches) {
          console.log(`[RuleEngine] Rule "${rule.name}" triggered for entity ${payload.leadId || payload.contactId}`);
          
          // 3. Ejecutar acciones (Encolar para ejecución asíncrona)
          await this.executeActions(rule, payload);
          
          // 4. Registrar éxito
          await prisma.automationLog.create({
            data: {
              ruleId: rule.id,
              tenantId,
              entityId: payload.leadId || payload.contactId || payload.dealId,
              status: 'success',
              result: { message: 'Workflow triggered' }
            }
          });
        }
      } catch (error: any) {
        console.error(`[RuleEngine] Error in rule ${rule.id}:`, error);
        
        await prisma.automationLog.create({
          data: {
            ruleId: rule.id,
            tenantId,
            entityId: payload.leadId || payload.contactId,
            status: 'failed',
            error: error.message
          }
        });
      }
    }
  }

  /**
   * Evalúa las condiciones de la regla contra el payload del evento
   */
  private static async evaluateConditions(conditions: any, payload: any): Promise<boolean> {
    // Si no hay condiciones, siempre cumple
    if (!conditions || Object.keys(conditions).length === 0) return true;

    // Ejemplo simple: match de campos
    // { "fuente": "web", "score_gt": 50 }
    for (const [key, value] of Object.entries(conditions)) {
      if (key.endsWith('_gt')) {
        const field = key.replace('_gt', '');
        if (!(payload[field] > (value as number))) return false;
      } else if (key.endsWith('_lt')) {
        const field = key.replace('_lt', '');
        if (!(payload[field] < (value as number))) return false;
      } else {
        if (payload[key] !== value) return false;
      }
    }

    return true;
  }

  /**
   * Encola las acciones de la regla para su procesamiento asíncrono
   */
  private static async executeActions(rule: any, payload: any) {
    const actions = rule.actions as any[];
    
    // Encolamos un "workflow" que contiene todas las acciones de la regla
    await this.workflowQueue.add(`rule:${rule.id}`, {
      ruleId: rule.id,
      tenantId: rule.tenantId,
      actions,
      payload
    }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });
  }
}
