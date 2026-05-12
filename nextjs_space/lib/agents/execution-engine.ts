import { skills } from '@/lib/skills';
import { SkillOrchestratorAgent, ExecutionPlan } from './skill-orchestrator';
import { ChatbotAuditLogger } from './audit-logger';
import { rateLimiter } from '@/lib/rate-limiter';

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTimeMs?: number;
  steps?: string[];
}

const TIMEOUT_MS = 10000;
const MAX_RETRIES = 1;

export class ExecutionEngine {
  static async execute(
    plan: ExecutionPlan,
    context: {
      tenantId: string;
      userId?: string;
      telegramUserId: string;
      sessionId: string;
    }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const steps: string[] = [];

    try {
      // 1. Validar parámetros
      steps.push('validate_params');
      const validation = this.validateParams(plan.skillParams, plan.skillName);
      if (!validation.valid) {
        await ChatbotAuditLogger.log({
          tenantId: context.tenantId,
          sessionId: context.sessionId,
          telegramUserId: context.telegramUserId,
          userId: context.userId,
          skillExecuted: plan.skillName,
          skillParams: plan.skillParams,
          status: 'BLOCKED_VALIDATION',
          errorMessage: validation.error
        });

        return {
          success: false,
          error: validation.error,
          steps
        };
      }

      // 2. Verificar rate limit
      steps.push('check_rate_limit');
      const rateLimitResult = await rateLimiter.checkLimit(
        context.tenantId,
        'chatbot_skill_execution'
      );

      if (!rateLimitResult.allowed) {
        await ChatbotAuditLogger.log({
          tenantId: context.tenantId,
          sessionId: context.sessionId,
          telegramUserId: context.telegramUserId,
          userId: context.userId,
          skillExecuted: plan.skillName,
          skillParams: plan.skillParams,
          status: 'BLOCKED_RATE_LIMIT',
          errorMessage: 'Rate limit exceeded'
        });

        return {
          success: false,
          error: 'Demasiadas solicitudes. Por favor, espera un momento.',
          steps
        };
      }

      // 3. Ejecutar skill
      steps.push('execute_skill');
      const skillResult = await this.executeSkillWithTimeout(
        plan.skillName,
        plan.skillParams
      );

      const executionTimeMs = Date.now() - startTime;

      // 4. Loggear resultado
      await ChatbotAuditLogger.log({
        tenantId: context.tenantId,
        sessionId: context.sessionId,
        telegramUserId: context.telegramUserId,
        userId: context.userId,
        skillExecuted: plan.skillName,
        skillParams: plan.skillParams,
        skillResult: skillResult.data,
        status: skillResult.success ? 'SUCCESS' : 'ERROR',
        errorMessage: skillResult.error,
        executionTimeMs
      });

      return {
        success: skillResult.success,
        data: skillResult.data,
        error: skillResult.error,
        executionTimeMs,
        steps
      };

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      await ChatbotAuditLogger.log({
        tenantId: context.tenantId,
        sessionId: context.sessionId,
        telegramUserId: context.telegramUserId,
        userId: context.userId,
        skillExecuted: plan.skillName,
        skillParams: plan.skillParams,
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        executionTimeMs,
        steps
      };
    }
  }

  private static validateParams(
    params: Record<string, any>,
    skillName: string
  ): { valid: boolean; error?: string } {
    // Validaciones específicas por skill
    const validators: Record<string, (params: Record<string, any>) => boolean> = {
      'auto_schedule': (p) => !!(p.date && p.time && p.service),
      'cancel_booking': (p) => !!p.bookingId,
      'search_catalog': (p) => !!p.search,
      'get_upcoming_bookings': (p) => true,
      'export_catalog': (p) => true,
      'transfer_to_human': (p) => !!p.tenantId
    };

    const validator = validators[skillName];
    if (validator && !validator(params)) {
      return {
        valid: false,
        error: `Parámetros inválidos para el skill: ${skillName}`
      };
    }

    // Validaciones generales
    if (!params.tenantId) {
      return { valid: false, error: ' tenantId es requerido' };
    }

    return { valid: true };
  }

  private static async executeSkillWithTimeout(
    skillName: string,
    params: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const skill = skills[skillName as keyof typeof skills];

    if (!skill) {
      return {
        success: false,
        error: `Skill no encontrado: ${skillName}`
      };
    }

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const result = await skill(params);

        clearTimeout(timeoutId);

        return {
          success: true,
          data: result
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return {
      success: false,
      error: lastError
    };
  }

  static formatSkillResult(
    skillName: string,
    result: any
  ): string {
    // Formatear resultados según el skill
    switch (skillName) {
      case 'auto_schedule':
        if (result?.success) {
          return `✅ *Cita agendada exitosamente*\n\n📅 Fecha: ${result.date}\n⏰ Hora: ${result.time}\n📋 Servicio: ${result.service}`;
        }
        return result?.error || 'No pude agendar la cita. Por favor, intenta de nuevo.';

      case 'get_upcoming_bookings':
        if (result && Array.isArray(result) && result.length > 0) {
          const bookings = result.map((b: any) =>
            `• ${b.date} ${b.time} - ${b.service}`
          ).join('\n');
          return `📅 *Tus próximas citas:*\n\n${bookings}`;
        }
        return 'No tienes citas agendadas.';

      case 'cancel_booking':
        return result?.success
          ? '✅ Cita cancelada exitosamente.'
          : result?.error || 'No pude cancelar la cita.';

      case 'export_catalog':
        if (result && Array.isArray(result)) {
          const services = result.slice(0, 5).map((s: any) =>
            `• *${s.nombre}*: $${s.precio}`
          ).join('\n');
          return `📋 *Servicios disponibles:*\n\n${services}\n\n¿Necesitas más información?`;
        }
        return 'No pude obtener el catálogo en este momento.';

      case 'search_catalog':
        if (result && Array.isArray(result) && result.length > 0) {
          const item = result[0];
          return `🔍 *Resultado:*\n\n*${item.nombre}*\n💰 Precio: $${item.precio}\n📝 Descripción: ${item.descripcion || 'N/A'}`;
        }
        return 'No encontré resultados para tu búsqueda.';

      case 'transfer_to_human':
        return '👤 He transferido tu solicitud a un agente. Por favor, espera mientras un humano te atiende.';

      default:
        return typeof result === 'string' ? result : JSON.stringify(result);
    }
  }
}