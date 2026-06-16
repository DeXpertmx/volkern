/**
 * compliance-gate.ts
 * 
 * Motor de Compliance Gate: evalúa reglas de procesos obligatorios y
 * bloquea acciones si no se cumplen los requisitos.
 * 
 * Solo se activa cuando el tenant está en modo 'compliance'.
 * 
 * Uso:
 *   const gate = await ComplianceGate.check(tenantId, 'deal_close_won', {
 *     userId: '...',
 *     entityId: 'deal_xxx',
 *     entityType: 'deal',
 *   });
 *   if (!gate.allowed) {
 *     return NextResponse.json({ error: gate.reason, gate }, { status: 403 });
 *   }
 */

import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/audit-service';
import {
  ComplianceAction,
  ComplianceRule,
  RuleContext,
  RuleResult,
  getRulesForAction,
  COMPLIANCE_RULES,
} from './compliance-rules';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type ComplianceMode = 'normal' | 'compliance';

export interface GateCheckInput {
  tenantId: string;
  userId: string;
  action: ComplianceAction;
  entityId: string;
  entityType: RuleContext['entityType'];
  metadata?: Record<string, any>;
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
  requiredAction?: string;
  missingRequirements?: string[];
  /** Regla que bloqueó la acción */
  blockingRule?: ComplianceRule;
  /** Modo actual del tenant */
  mode: ComplianceMode;
  /** Si se omitió por estar en modo normal */
  skippedBecauseNormal: boolean;
}

export interface GateCheckOptions {
  /** Si true, registra el intento bloqueado en audit log */
  logBlocked?: boolean;
  /** Si true, fuerza la evaluación incluso en modo normal */
  force?: boolean;
}

/* ─── Service ──────────────────────────────────────────────────────────────── */

export class ComplianceGate {
  /**
   * Obtiene el modo de compliance del tenant.
   * Por defecto los tenants están en modo 'normal'.
   * El modo se almacena en tenant.complianceMode.
   */
  static async getMode(tenantId: string): Promise<ComplianceMode> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { configuracion: true },
      });
      // El modo se almacena en tenant.configuracion como JSON: { complianceMode: 'normal' | 'compliance' }
      const config = tenant?.configuracion as Record<string, any> | null;
      return (config?.complianceMode as ComplianceMode) || 'normal';
    } catch {
      return 'normal';
    }
  }

  /**
   * Cambia el modo de compliance del tenant.
   * Requiere justificación y queda registrado en audit log.
   */
  static async setMode(
    tenantId: string,
    userId: string,
    mode: ComplianceMode,
    justification: string
  ): Promise<{ success: boolean; mode: ComplianceMode }> {
    if (justification.trim().length < 10) {
      throw new Error('La justificación debe tener al menos 10 caracteres');
    }

    // El modo se almacena en el JSON configuracion del tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { configuracion: true },
    });
    const config = (tenant?.configuracion as Record<string, any>) || {};
    config.complianceMode = mode;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { configuracion: config },
    });

    await AuditService.log({
      tenantId,
      userId,
      action: 'COMPLIANCE_MODE_CHANGED',
      entity: 'Tenant',
      entityId: tenantId,
      description: `Modo de compliance cambiado a "${mode}": ${justification}`,
      metadata: { previousMode: mode === 'compliance' ? 'normal' : 'compliance', newMode: mode, justification },
    });

    return { success: true, mode };
  }

  /**
   * Evalúa todas las reglas aplicables para una acción.
   * Si el tenant está en modo 'normal', todas las acciones están permitidas.
   */
  static async check(
    input: GateCheckInput,
    options: GateCheckOptions = {}
  ): Promise<GateResult> {
    const { tenantId, userId, action, entityId, entityType, metadata } = input;
    const { logBlocked = true, force = false } = options;

    // 1. Obtener modo del tenant
    const mode = await this.getMode(tenantId);

    // 2. Si está en modo normal y no se fuerza, permitir todo
    if (mode === 'normal' && !force) {
      return {
        allowed: true,
        mode,
        skippedBecauseNormal: true,
      };
    }

    // 3. Obtener reglas aplicables para esta acción
    const rules = getRulesForAction(action);

    if (rules.length === 0) {
      return {
        allowed: true,
        mode,
        skippedBecauseNormal: false,
      };
    }

    // 4. Construir contexto
    const context: RuleContext = {
      tenantId,
      userId,
      entityId,
      entityType,
      metadata,
    };

    // 5. Evaluar cada regla
    for (const rule of rules) {
      try {
        const result = await rule.evaluate(context);

        if (!result.allowed) {
          // Registrar intento bloqueado
          if (logBlocked) {
            await AuditService.log({
              tenantId,
              userId,
              action: 'COMPLIANCE_BLOCKED',
              entity: entityType.charAt(0).toUpperCase() + entityType.slice(1),
              entityId,
              description: `🔒 Compliance Gate bloqueó "${rule.name}": ${result.reason}`,
              metadata: {
                ruleId: rule.id,
                action,
                missingRequirements: result.missingRequirements,
                requiredAction: result.requiredAction,
              },
            });

            // Crear alerta de sistema si es prioridad HIGH
            if (rule.priority === 'HIGH') {
              try {
                await prisma.systemAlert.create({
                  data: {
                    level: 'WARNING',
                    message: `🔒 Compliance: ${rule.name} bloqueado para ${entityType} ${entityId}`,
                    auditId: `compliance-${Date.now()}`,
                  },
                });
              } catch { /* non-critical */ }
            }
          }

          return {
            allowed: false,
            reason: result.reason || rule.blockMessage,
            requiredAction: result.requiredAction || rule.requiredAction,
            missingRequirements: result.missingRequirements,
            blockingRule: rule,
            mode,
            skippedBecauseNormal: false,
          };
        }
      } catch (error) {
        console.error(`[ComplianceGate] Error evaluating rule ${rule.id}:`, error);
        // Si una regla falla, permitir la acción para no bloquear el sistema
        continue;
      }
    }

    return {
      allowed: true,
      mode,
      skippedBecauseNormal: false,
    };
  }

  /**
   * Obtiene todas las reglas con su estado para un tenant específico.
   * Útil para el dashboard de compliance.
   */
  static async getRulesStatus(tenantId: string) {
    const mode = await this.getMode(tenantId);
    const rules = COMPLIANCE_RULES.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      action: rule.action,
      priority: rule.priority,
      active: rule.active,
      applies: mode === 'compliance' && rule.active,
    }));

    return { mode, rules };
  }
}

export default ComplianceGate;
