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

    // Auto-inicialización perezosa: sin cola las acciones se perderían en
    // silencio (y el log diría `success`). Mejor intentar montarla aquí.
    if (!this.workflowQueue) {
      try {
        await this.initialize();
      } catch (error) {
        console.error('[RuleEngine] No se pudo inicializar la cola de workflows:', error);
      }
    }

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
          const actions: any[] = Array.isArray(rule.actions) ? rule.actions : [];

          console.log(`[RuleEngine] Rule "${rule.name}" triggered for entity ${this.resolveEntityId(payload)}`);

          // 3. Registrar la ejecución como ENCOLADA (no como éxito): hasta que
          //    el worker no ejecute las acciones no se conoce el resultado.
          //    El worker actualizará ESTE mismo log con el desenlace real.
          const log = await prisma.automationLog.create({
            data: {
              ruleId: rule.id,
              tenantId,
              entityId: this.resolveEntityId(payload),
              status: 'queued',
              result: {
                message: 'Acciones encoladas, pendientes de ejecución',
                actions: actions.map((a) => a?.type).filter(Boolean),
                queuedAt: new Date().toISOString(),
              },
            },
          });

          // 4. Encolar pasándole el id del log para que el worker escriba el
          //    resultado real de cada acción sobre él.
          try {
            await this.executeActions(rule, payload, log.id);
          } catch (queueError: any) {
            // Sin cola la acción se perdería: queda registrada como fallida
            // con su causa en lugar de quedar como éxito fantasma.
            console.error(`[RuleEngine] No se pudieron encolar las acciones de la regla ${rule.id}:`, queueError);
            try {
              await prisma.automationLog.update({
                where: { id: log.id },
                data: {
                  status: 'failed',
                  error: queueError?.message || String(queueError),
                },
              });
            } catch { /* el fallo del log no debe crashear */ }
          }
        }
      } catch (error: any) {
        console.error(`[RuleEngine] Error in rule ${rule.id}:`, error);
        
        try {
          await prisma.automationLog.create({
            data: {
              ruleId: rule.id,
              tenantId,
              entityId: this.resolveEntityId(payload),
              status: 'failed',
              error: error.message
            }
          });
        } catch { /* log failure no debe crashear */ }
      }
    }
  }

  /**
   * Identificador de la entidad afectada por el evento, sea del CRM
   * (lead/contacto/deal) o de Hospitality (reserva/unidad/tarea).
   */
  private static resolveEntityId(payload: any): string | null {
    return (
      payload?.leadId ||
      payload?.contactId ||
      payload?.dealId ||
      payload?.reservationId ||
      payload?.taskId ||
      payload?.unitId ||
      null
    );
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
   * Si Redis no está disponible, las acciones NO se omiten en silencio:
   * se lanza para que queden registradas como `failed` con la causa real.
   *
   * `logId` viaja en el job para que el worker escriba el resultado real de
   * cada acción sobre el mismo AutomationLog.
   */
  private static async executeActions(rule: any, payload: any, logId?: string) {
    if (!this.workflowQueue) {
      throw new Error(
        'Cola de automatizaciones no disponible (Redis no configurado o AutomationRuleEngine.initialize() no ejecutado)'
      );
    }

    const actions = rule.actions as any[];

    await this.workflowQueue.add(`rule:${rule.id}`, {
      ruleId: rule.id,
      tenantId: rule.tenantId,
      actions,
      payload,
      logId,
    }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });
  }
}
