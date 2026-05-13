/**
 * SecurityCheckpointAgent
 * 
 * Valida seguridad antes de ejecutar cualquier acción.
 * Incluye validación multi-tenant, permisos, y rate limiting.
 */

import { prisma } from '@/lib/db';
import { rateLimiter } from '@/lib/rate-limiter';

export interface SecurityValidationInput {
  user: {
    id: string;
    tenantId: string;
    role?: string;
    metadata?: any;
  };
  tenant: {
    id: string;
    plan: string;
    estado: string;
  };
  intent: string;
  entities: Record<string, string>;
}

export interface SecurityValidationResult {
  allowed: boolean;
  error?: string;
  reason?: string;
}

// Skills que requieren permisos especiales
const RESTRICTED_SKILLS = new Set([
  'audit_finance_integrity',
  'orchestrate_secure_payroll',
  'generate_offboarding_security_kit',
  'access_security_audit',
  'mcp_access_watchdog'
]);

// Mapping de intent a skill para validación
const INTENT_TO_SKILL: Record<string, string> = {
  'agendar_cita': 'auto_schedule',
  'consultar_cita': 'get_upcoming_bookings',
  'cancelar_cita': 'cancel_booking',
  'consultar_servicios': 'export_catalog',
  'consultar_precio': 'search_catalog',
  'contactar_humano': 'transfer_to_human'
};

export class SecurityCheckpointAgent {
  
  /**
   * Valida todos los aspectos de seguridad antes de ejecutar un skill
   */
  static async validate(input: SecurityValidationInput): Promise<void> {
    // 1. Validar que el usuario pertenece al tenant
    if (input.user.tenantId !== input.tenant.id) {
      throw new Error('SECURITY_ERROR: Cross-tenant execution blocked');
    }

    // 2. Validar que el tenant está activo
    if (input.tenant.estado !== 'activo') {
      throw new Error('SECURITY_ERROR: Tenant inactivo');
    }

    // 3. Validar rate limit por usuario
    const rateLimitResult = await rateLimiter.checkLimit(
      input.tenant.id,
      'chatbot_message'
    );

    if (!rateLimitResult.allowed) {
      throw new Error('SECURITY_ERROR: Rate limit excedido');
    }

    // 4. Verificar si el skill es restringido y el usuario tiene permisos
    const skillName = INTENT_TO_SKILL[input.intent];
    if (skillName && RESTRICTED_SKILLS.has(skillName)) {
      const hasPermission = await this.checkSkillPermission(input.user, skillName);
      if (!hasPermission) {
        throw new Error(`SECURITY_ERROR: Sin permisos para ejecutar ${skillName}`);
      }
    }

    // 5. Validar entidades sensibles
    this.validateEntities(input.entities);

    console.log(`[Security] Validación exitosa para usuario ${input.user.id}, intent: ${input.intent}`);
  }

  /**
   * Verifica si el usuario tiene permiso para ejecutar un skill
   */
  private static async checkSkillPermission(
    user: { id: string; role?: string; metadata?: any },
    skillName: string
  ): Promise<boolean> {
    // Owner y admin tienen acceso total
    if (user.role === 'OWNER' || user.role === 'admin') {
      return true;
    }

    // Verificar permisos en metadata
    const permissions = (user.metadata as any)?.skillPermissions || {};
    
    // Por defecto, dar acceso a skills básicos
    const basicSkills = ['auto_schedule', 'get_upcoming_bookings', 'export_catalog', 'search_catalog'];
    if (basicSkills.includes(skillName)) {
      return true;
    }

    // Verificar permiso explícito
    return permissions[skillName] === true;
  }

  /**
   * Valida que las entidades no contengan datos sensibles o maliciosos
   */
  private static validateEntities(entities: Record<string, string>): void {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /api[_-]?key/i,
      /credential/i
    ];

    for (const [key, value] of Object.entries(entities)) {
      if (!value || typeof value !== 'string') continue;

      // Validar longitud máxima
      if (value.length > 500) {
        throw new Error(`SECURITY_ERROR: Entidad ${key} excede longitud máxima`);
      }

      // Validar que no contenga patrones sensibles
      for (const pattern of sensitivePatterns) {
        if (pattern.test(value)) {
          throw new Error(`SECURITY_ERROR: Entidad ${key} contiene dato sensible`);
        }
      }
    }
  }

  /**
   * Verifica si un intent es válido y permitido
   */
  static isIntentAllowed(intent: string): boolean {
    const allowedIntents = new Set([
      'consultar_servicios',
      'agendar_cita',
      'consultar_cita',
      'cancelar_cita',
      'consultar_precio',
      'contactar_humano',
      'consultar_estado_pedido',
      'help',
      'unknown'
    ]);

    return allowedIntents.has(intent);
  }

  /**
   * Bloquea un usuario por abuso
   */
  static async blockUser(tenantId: string, userId: string, reason: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId, tenantId },
      data: {
        metadata: {
          blocked: true,
          blockReason: reason,
          blockedAt: new Date().toISOString()
        }
      }
    }).catch(() => {});

    console.warn(`[Security] Usuario ${userId} bloqueado en tenant ${tenantId}: ${reason}`);
  }

  /**
   * Verifica si el usuario está bloqueado
   */
  static async isUserBlocked(tenantId: string, userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { metadata: true }
      });

      return (user?.metadata as any)?.blocked === true;
    } catch {
      return false;
    }
  }
}