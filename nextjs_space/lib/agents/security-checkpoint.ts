/**
 * SecurityCheckpointAgent - Seguridad completa
 * 
 * Valida:
 * - Permisos por rol
 * - Aislamiento de tenant
 * - Validación de entidades
 * - Rate limiting
 * - Ownership de recursos
 * - Sanitización de input
 */

import { prisma } from '@/lib/db';

// 🔐 Permisos por intent (rol)
const INTENT_PERMISSIONS: Record<string, string[]> = {
  'consultar_servicios': ['user', 'admin', 'owner', 'guest'],
  'agendar_cita': ['user', 'admin', 'owner'],
  'consultar_cita': ['user', 'admin', 'owner'],
  'cancelar_cita': ['user', 'admin', 'owner'],
  'consultar_precio': ['user', 'admin', 'owner', 'guest'],
  'contactar_humano': ['user', 'admin', 'owner', 'guest'],
  'consultar_estado_pedido': ['user', 'admin', 'owner'],
  'help': ['user', 'admin', 'owner', 'guest'],
  'unknown': ['user', 'admin', 'owner', 'guest']
};

// Rate limiting simple
const rateMap = new Map<string, { count: number; ts: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto
const RATE_LIMIT_MAX = 20; // Max 20 mensajes por minuto

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

export class SecurityCheckpointAgent {
  
  /**
   * Validación completa de seguridad
   */
  static async validate(input: SecurityValidationInput): Promise<void> {
    const { user, tenant, intent, entities } = input;

    // 🛡️ 1. Tenant isolation (CRÍTICO)
    if (user.tenantId !== tenant.id) {
      throw new Error('SECURITY_ERROR: Tenant isolation violation');
    }

    // 🛡️ 2. Tenant activo
    if (tenant.estado !== 'activo') {
      throw new Error('SECURITY_ERROR: Tenant inactivo');
    }

    // 🔐 3. Intent permitido
    if (!INTENT_PERMISSIONS[intent]) {
      throw new Error(`SECURITY_ERROR: Intent no permitido: ${intent}`);
    }

    // 👤 4. Validar rol del usuario
    const allowedRoles = INTENT_PERMISSIONS[intent];
    const userRole = (user.metadata as any)?.role || 'user';
    
    if (!allowedRoles.includes(userRole) && !allowedRoles.includes(user.role || 'user')) {
      throw new Error('SECURITY_ERROR: Permiso denegado para esta acción');
    }

    // 🧪 5. Validar entidades según intent
    this.validateEntitiesByIntent(intent, entities);

    // 🧼 6. Sanitización de entidades
    const sanitized = this.sanitizeEntities(entities);
    
    // Sobrescribir entidades con las sanitizadas
    Object.assign(entities, sanitized);

    // 🚦 7. Rate limiting
    await this.checkRateLimit(user.id);

    // 🔍 8. Validación de ownership (para intents específicos)
    if (intent === 'cancelar_cita' && entities.appointment_id) {
      await this.validateAppointmentOwnership(tenant.id, entities.appointment_id, user.id);
    }

    console.log(`[Security] Validación exitosa: usuario ${user.id}, intent: ${intent}`);
  }

  /**
   * Validar rate limit por usuario
   */
  private static async checkRateLimit(userId: string): Promise<void> {
    const now = Date.now();
    
    let entry = rateMap.get(userId);
    
    // Resetear si la ventana expiró
    if (!entry || now - entry.ts > RATE_LIMIT_WINDOW_MS) {
      entry = { count: 1, ts: now };
      rateMap.set(userId, entry);
      return;
    }
    
    // Incrementar contador
    entry.count++;
    
    // Verificar límite
    if (entry.count > RATE_LIMIT_MAX) {
      throw new Error('SECURITY_ERROR: Rate limit excedido. Por favor, espera un momento.');
    }
    
    rateMap.set(userId, entry);
  }

  /**
   * Validar entidades según el intent
   */
  private static validateEntitiesByIntent(intent: string, entities: Record<string, string>): void {
    const validations: Record<string, (entities: Record<string, string>) => void> = {
      'agendar_cita': (e) => {
        if (e.date && !this.isValidDate(e.date)) {
          throw new Error('SECURITY_ERROR: Fecha inválida');
        }
        if (e.time && !this.isValidTime(e.time)) {
          throw new Error('SECURITY_ERROR: Hora inválida');
        }
      },
      'cancelar_cita': (e) => {
        if (!e.appointment_id) {
          throw new Error('SECURITY_ERROR: ID de cita requerido');
        }
        if (e.appointment_id && e.appointment_id.length > 100) {
          throw new Error('SECURITY_ERROR: ID de cita muy largo');
        }
      },
      'consultar_precio': (e) => {
        if (e.service && e.service.length > 200) {
          throw new Error('SECURITY_ERROR: Nombre de servicio muy largo');
        }
      }
    };

    const validator = validations[intent];
    if (validator) {
      validator(entities);
    }
  }

  /**
   * Sanitizar entidades (evitar XSS e inyecciones)
   */
  private static sanitizeEntities(entities: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(entities)) {
      if (typeof value !== 'string') {
        sanitized[key] = String(value);
        continue;
      }
      
      // Trim y remover caracteres dangerous
      let clean = value.trim();
      
      // Remover scripts y tags HTML
      clean = clean
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
      
      // Limitar longitud
      if (clean.length > 500) {
        clean = clean.substring(0, 500);
      }
      
      sanitized[key] = clean;
    }
    
    return sanitized;
  }

  /**
   * Validar formato de fecha
   */
  private static isValidDate(dateStr: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) return false;
    
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }

  /**
   * Validar formato de hora
   */
  private static isValidTime(timeStr: string): boolean {
    const timeRegex = /^\d{1,2}:\d{2}$/;
    if (!timeRegex.test(timeStr)) return false;
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  /**
   * Validar ownership de cita
   */
  private static async validateAppointmentOwnership(
    tenantId: string,
    appointmentId: string,
    userId: string
  ): Promise<void> {
    try {
      const appointment = await prisma.cita.findFirst({
        where: {
          id: appointmentId,
          tenantId
        }
      });

      if (!appointment) {
        throw new Error('SECURITY_ERROR: Cita no encontrada');
      }

      // Verificar que el usuario tiene acceso (es propietario o admin)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      });

      const isOwner = (appointment as any).userId === userId;
      const isAdmin = (user?.role as any)?.nombre === 'admin' || (user?.role as any)?.nombre === 'owner';

      if (!isOwner && !isAdmin) {
        throw new Error('SECURITY_ERROR: No tienes acceso a esta cita');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('SECURITY_ERROR')) {
        throw error;
      }
      // Si hay error de DB, permitir (no bloquear por error técnico)
      console.warn('[Security] Warning validating appointment:', error);
    }
  }

  /**
   * Verificar si un intent es permitido para un rol
   */
  static isIntentAllowedForRole(intent: string, role: string): boolean {
    const roles = INTENT_PERMISSIONS[intent];
    return roles ? roles.includes(role) : false;
  }

  /**
   * Obtener intents disponibles para un rol
   */
  static getAllowedIntents(role: string): string[] {
    const allowed: string[] = [];
    
    for (const [intent, roles] of Object.entries(INTENT_PERMISSIONS)) {
      if (roles.includes(role)) {
        allowed.push(intent);
      }
    }
    
    return allowed;
  }

  /**
   * Bloquear usuario por abuso
   */
  static async blockUser(tenantId: string, userId: string, reason: string): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId, tenantId },
        data: {
          metadata: {
            blocked: true,
            blockReason: reason,
            blockedAt: new Date().toISOString()
          }
        }
      });

      console.warn(`[Security] Usuario ${userId} bloqueado en tenant ${tenantId}: ${reason}`);
    } catch (error) {
      console.error('[Security] Error bloqueando usuario:', error);
    }
  }

  /**
   * Verificar si usuario está bloqueado
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

  /**
   * Resetear rate limit para un usuario (útil para testing)
   */
  static resetRateLimit(userId: string): void {
    rateMap.delete(userId);
  }

  /**
   * Obtener estado de rate limit para un usuario
   */
  static getRateLimitStatus(userId: string): { count: number; remaining: number; resetAt: number } {
    const entry = rateMap.get(userId);
    
    if (!entry) {
      return { count: 0, remaining: RATE_LIMIT_MAX, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
    }

    const now = Date.now();
    const resetAt = entry.ts + RATE_LIMIT_WINDOW_MS;
    
    return {
      count: entry.count,
      remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
      resetAt
    };
  }
}

export default SecurityCheckpointAgent;