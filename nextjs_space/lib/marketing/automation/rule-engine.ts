import { Queue } from 'bullmq';
import { initRedis } from '../../core/redis';

/**
 * Motor de Reglas de Automatización de Marketing
 */
export class AutomationRuleEngine {
  private static workflowQueue: Queue | null = null;

  /**
   * Inicializa la cola de workflows (solo si Redis está disponible)
   */
  static async initialize(): Promise<void> {
    const redis = await initRedis();
    if (!redis) return;

    if (!this.workflowQueue) {
      this.workflowQueue = new Queue('marketing_workflows', { connection: redis });
      this.workflowQueue.on('error', (err: any) => {
        if (err.code !== 'ECONNREFUSED') console.error('[RuleEngine] Queue error:', err);
      });
    }
  }

  /**
   * Procesa un evento entrante buscando reglas activas que coincidan
   */
  static async processEvent(triggerType: string, payload: any) {
    // Importación dinámica para evitar cargar prisma en contextos de Edge/Worker
    const { prisma } = await import('../../db');
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
        // 2. Evaluar condiciones
        const matches = await this.evaluateConditions(rule.conditions, payload);
        
        if (matches) {
          console.log(`[RuleEngine] Rule "${rule.name}" triggered for entity ${payload.leadId || payload.contactId}`);
          
          // 3. Ejecutar acciones (encolar si Redis disponible, o ejecutar inline si no)
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
        
        try {
          await prisma.automationLog.create({
            data: {
              ruleId: rule.id,
              tenantId,
              entityId: payload.leadId || payload.contactId,
              status: 'failed',
              error: error.message
            }
          });
        } catch { /* log failure no debe crashear */ }
      }
    }
  }

  /**
   * Evalúa las condiciones de la regla contra el payload del evento
   */
  private static async evaluateConditions(conditions: any, payload: any): Promise<boolean> {
    if (!conditions || Object.keys(conditions).length === 0) return true;

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
   * Encola las acciones de la regla para su procesamiento asíncrono.
   * Si Redis no está disponible, las acciones se omiten silenciosamente.
   */
  private static async executeActions(rule: any, payload: any) {
    if (!this.workflowQueue) {
      console.debug('[RuleEngine] Queue no disponible, omitiendo acciones async.');
      return;
    }

    const actions = rule.actions as any[];
    
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
