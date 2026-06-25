/**
 * Execution Engine - Motor de ejecución de skills
 * 
 * Ejecuta planes de ejecución con soporte para:
 * - Multi-step execution
 * - Control de flujo (break)
 * - Timeouts por skill
 * - Retry automático
 * - Auditoría
 */

import { SkillRegistry, SkillOutput } from './skill-registry';
import { ChatbotAuditLogger } from './audit-logger';

export interface ExecutionStep {
  action: string;
  params?: Record<string, any>;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
}

export interface ExecutionInput {
  plan: ExecutionPlan;
  userId: string;
  tenantId: string;
  sessionId?: string;
}

export interface ExecutionOutput {
  message: string;
  skill?: string;
  data?: any;
  error?: boolean;
  executionTimeMs?: number;
}

const SKILL_TIMEOUT_MS = 10000; // 10 segundos por skill
const MAX_RETRIES = 1;

export const ExecutionEngine = {
  /**
   * Ejecuta un plan de steps
   */
  async run(input: ExecutionInput): Promise<ExecutionOutput> {
    const startTime = Date.now();
    const { plan, userId, tenantId, sessionId } = input;

    if (!plan.steps || plan.steps.length === 0) {
      return {
        message: 'No se pudo completar la acción.',
        error: true
      };
    }

    const results: Array<{ action: string; output: SkillOutput }> = [];

    for (const step of plan.steps) {
      try {
        // 1. Obtener skill del registry
        let skill = SkillRegistry.get(step.action);

        // 2. Si es "ask_user" (special skill), handled differently
        if (step.action === 'ask_user') {
          const message = step.params?.message || '¿Podrías darme más información?';
          results.push({
            action: step.action,
            output: {
              message,
              break: true // Detiene el flujo
            }
          });
          break; // Salir del loop
        }

        // 3. Si no existe local, intentar ejecutar como skill de Volkern
        if (!skill) {
          const { skills } = await import('@/lib/skills');
          const volkernSkill = skills[step.action as keyof typeof skills];
          
          if (volkernSkill) {
            skill = {
              execute: async (params: any) => {
                try {
                  const result = await volkernSkill(params);
                  return { message: 'OK', data: result };
                } catch (error: any) {
                  return { message: 'Error', error: error.message };
                }
              }
            };
          }
        }

        if (!skill) {
          throw new Error(`Skill no encontrado: ${step.action}`);
        }

        // 3. Inyectar contexto seguro
        const safeParams = {
          ...step.params,
          userId,
          tenantId,
          sessionId
        };

        // 4. Ejecutar con timeout
        const output = await this.executeWithTimeout(skill.execute, safeParams);

        // 5. Guardar resultado
        results.push({
          action: step.action,
          output
        });

        // 6. Control de flujo: break si el skill lo indica
        if (output?.break === true) {
          console.log(`[ExecutionEngine] Break triggered by ${step.action}`);
          break;
        }

        // 7. Si hay error en el output, romper
        if (output?.error) {
          throw new Error(output.message || 'Error en skill');
        }

      } catch (error: any) {
        console.error(`[ExecutionEngine] Step error [${step.action}]:`, error.message);

        // Log de error
        await ChatbotAuditLogger.log({
          tenantId,
          userId,
          sessionId: sessionId || undefined,
          skillExecuted: step.action,
          skillParams: step.params,
          status: 'ERROR',
          errorMessage: error.message
        });

        return {
          message: error.message.includes('no encontrado')
            ? `❌ Acción no disponible: ${step.action}`
            : '⚠️ Error ejecutando la operación.',
          skill: step.action,
          error: true,
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // 8. Construir respuesta final
    const response = this.buildResponse(results);
    response.executionTimeMs = Date.now() - startTime;

    // 9. Loggear éxito
    if (results.length > 0) {
      await ChatbotAuditLogger.log({
        tenantId,
        userId,
        sessionId: sessionId || undefined,
        skillExecuted: results[results.length - 1].action,
        skillResult: results[results.length - 1].output?.data,
        status: 'SUCCESS',
        executionTimeMs: response.executionTimeMs
      });
    }

    return response;
  },

  /**
   * Ejecuta una función con timeout
   */
  async executeWithTimeout(
    fn: (params: any) => Promise<SkillOutput>,
    params: any
  ): Promise<SkillOutput> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SKILL_TIMEOUT_MS);

        const result = await Promise.race([
          fn(params),
          new Promise<SkillOutput>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), SKILL_TIMEOUT_MS)
          )
        ]);

        clearTimeout(timeoutId);
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // No reintentar en timeout
        if (lastError.message === 'Timeout') {
          break;
        }
      }
    }

    return {
      message: 'Error en ejecución',
      error: lastError?.message
    };
  },

  /**
   * Construye la respuesta final desde los resultados
   */
  buildResponse(results: Array<{ action: string; output: SkillOutput }>): ExecutionOutput {
    if (!results.length) {
      return {
        message: 'No se pudo completar la acción.',
        error: true
      };
    }

    const last = results[results.length - 1];

    // Respuesta del skill tiene priority
    if (last.output?.message) {
      return {
        message: last.output.message,
        skill: last.action,
        data: last.output.data || undefined,
        error: !!last.output.error || false
      };
    }

    return {
      message: '✅ Operación completada',
      skill: last.action,
      data: last.output
    };
  }
};

export default ExecutionEngine;