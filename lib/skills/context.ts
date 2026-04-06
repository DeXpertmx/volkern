/**
 * Skill Context - Contexto enriquecido que viaja con cada skill
 * 
 * Proporciona:
 * - Información del tenant y usuario
 * - Permisos y roles
 * - Metadatos de origen (source)
 * - Correlation ID para trazabilidad
 * - Timestamps
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================
// TIPOS
// ============================================================

export type SkillSource = 
  | 'dashboard'      // Usuario desde UI
  | 'api'            // Llamada API externa
  | 'mcp'            // MCP Server (agentes AI)
  | 'webhook'        // Webhook entrante
  | 'automation'     // Motor de automatización
  | 'scheduled'      // Tarea programada
  | 'system';        // Sistema interno

export type PermissionLevel = 'read' | 'write' | 'admin' | 'system';

export interface SkillPermissions {
  level: PermissionLevel;
  scopes: string[];          // e.g., ['leads:read', 'leads:write', 'bookings:create']
  restrictions?: string[];   // e.g., ['no_delete', 'own_tenant_only']
}

export interface SkillContextData {
  // Identificación
  tenantId: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  
  // Trazabilidad
  correlationId: string;     // UUID único para rastrear toda la cadena
  parentCorrelationId?: string; // Si viene de otro skill/evento
  requestId?: string;        // ID de la request HTTP original
  
  // Origen
  source: SkillSource;
  sourceDetails?: {
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    automationId?: string;
    workflowId?: string;
    webhookType?: string;
  };
  
  // Permisos
  permissions: SkillPermissions;
  
  // Timing
  createdAt: Date;
  expiresAt?: Date;          // Para contextos con TTL
  
  // Metadata adicional
  metadata?: Record<string, unknown>;
}

// ============================================================
// CLASE SKILL CONTEXT
// ============================================================

export class SkillContext {
  private data: SkillContextData;
  
  constructor(data: Partial<SkillContextData> & { tenantId: string }) {
    this.data = {
      tenantId: data.tenantId,
      userId: data.userId,
      userEmail: data.userEmail,
      userName: data.userName,
      correlationId: data.correlationId || uuidv4(),
      parentCorrelationId: data.parentCorrelationId,
      requestId: data.requestId,
      source: data.source || 'system',
      sourceDetails: data.sourceDetails,
      permissions: data.permissions || {
        level: 'read',
        scopes: [],
      },
      createdAt: data.createdAt || new Date(),
      expiresAt: data.expiresAt,
      metadata: data.metadata,
    };
  }
  
  // Getters
  get tenantId(): string { return this.data.tenantId; }
  get userId(): string | undefined { return this.data.userId; }
  get userEmail(): string | undefined { return this.data.userEmail; }
  get userName(): string | undefined { return this.data.userName; }
  get correlationId(): string { return this.data.correlationId; }
  get parentCorrelationId(): string | undefined { return this.data.parentCorrelationId; }
  get requestId(): string | undefined { return this.data.requestId; }
  get source(): SkillSource { return this.data.source; }
  get sourceDetails() { return this.data.sourceDetails; }
  get permissions(): SkillPermissions { return this.data.permissions; }
  get createdAt(): Date { return this.data.createdAt; }
  get metadata() { return this.data.metadata; }
  
  // Verificar permisos
  hasPermission(scope: string): boolean {
    if (this.data.permissions.level === 'system' || this.data.permissions.level === 'admin') {
      return true;
    }
    return this.data.permissions.scopes.includes(scope);
  }
  
  hasRestriction(restriction: string): boolean {
    return this.data.permissions.restrictions?.includes(restriction) ?? false;
  }
  
  canWrite(): boolean {
    return ['write', 'admin', 'system'].includes(this.data.permissions.level);
  }
  
  canDelete(): boolean {
    return ['admin', 'system'].includes(this.data.permissions.level) &&
           !this.hasRestriction('no_delete');
  }
  
  // Verificar expiración
  isExpired(): boolean {
    if (!this.data.expiresAt) return false;
    return new Date() > this.data.expiresAt;
  }
  
  // Crear contexto hijo (para skills que llaman otros skills)
  createChildContext(overrides?: Partial<SkillContextData>): SkillContext {
    return new SkillContext({
      ...this.data,
      parentCorrelationId: this.data.correlationId,
      correlationId: uuidv4(),
      createdAt: new Date(),
      ...overrides,
    });
  }
  
  // Serializar para logs/eventos
  toJSON(): SkillContextData {
    return { ...this.data };
  }
  
  // Para logs estructurados
  toLogContext(): Record<string, unknown> {
    return {
      tenantId: this.data.tenantId,
      userId: this.data.userId,
      correlationId: this.data.correlationId,
      parentCorrelationId: this.data.parentCorrelationId,
      source: this.data.source,
      permissionLevel: this.data.permissions.level,
    };
  }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Crear contexto desde sesión de usuario (Dashboard)
 */
export function createContextFromSession(
  session: { user?: { id?: string; email?: string; name?: string }; tenantId?: string },
  requestId?: string
): SkillContext | null {
  const tenantId = session.tenantId;
  if (!tenantId) return null;
  
  return new SkillContext({
    tenantId,
    userId: session.user?.id,
    userEmail: session.user?.email ?? undefined,
    userName: session.user?.name ?? undefined,
    source: 'dashboard',
    requestId,
    permissions: {
      level: 'write',
      scopes: ['*'], // Usuario autenticado tiene todos los permisos de su tenant
    },
  });
}

/**
 * Crear contexto desde API Key
 */
export function createContextFromApiKey(
  tenantId: string,
  scopes: string[],
  requestId?: string,
  sourceDetails?: SkillContextData['sourceDetails']
): SkillContext {
  return new SkillContext({
    tenantId,
    source: 'api',
    requestId,
    sourceDetails,
    permissions: {
      level: 'write',
      scopes,
    },
  });
}

/**
 * Crear contexto desde MCP (agentes AI)
 */
export function createContextFromMCP(
  tenantId: string,
  userId?: string,
  correlationId?: string
): SkillContext {
  return new SkillContext({
    tenantId,
    userId,
    source: 'mcp',
    correlationId,
    permissions: {
      level: 'write',
      scopes: ['*'], // MCP tiene acceso completo
    },
  });
}

/**
 * Crear contexto desde webhook entrante
 */
export function createContextFromWebhook(
  tenantId: string,
  webhookType: string,
  requestId?: string
): SkillContext {
  return new SkillContext({
    tenantId,
    source: 'webhook',
    requestId,
    sourceDetails: { webhookType },
    permissions: {
      level: 'write',
      scopes: ['leads:write', 'contacts:write', 'bookings:write', 'tasks:write'],
      restrictions: ['no_delete'], // Webhooks no pueden borrar
    },
  });
}

/**
 * Crear contexto desde automatización
 */
export function createContextFromAutomation(
  tenantId: string,
  automationId: string,
  correlationId?: string
): SkillContext {
  return new SkillContext({
    tenantId,
    source: 'automation',
    correlationId,
    sourceDetails: { automationId },
    permissions: {
      level: 'system',
      scopes: ['*'],
    },
  });
}

/**
 * Crear contexto de sistema (para operaciones internas)
 */
export function createSystemContext(tenantId: string): SkillContext {
  return new SkillContext({
    tenantId,
    source: 'system',
    permissions: {
      level: 'system',
      scopes: ['*'],
    },
  });
}

// ============================================================
// CONTEXT STORAGE (AsyncLocalStorage para propagación automática)
// ============================================================

import { AsyncLocalStorage } from 'async_hooks';

const contextStorage = new AsyncLocalStorage<SkillContext>();

/**
 * Ejecutar código con un contexto específico
 */
export function runWithContext<T>(context: SkillContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

/**
 * Obtener el contexto actual (si existe)
 */
export function getCurrentContext(): SkillContext | undefined {
  return contextStorage.getStore();
}

/**
 * Obtener contexto actual o lanzar error
 */
export function requireContext(): SkillContext {
  const ctx = getCurrentContext();
  if (!ctx) {
    throw new Error('SkillContext required but not found. Use runWithContext() or pass context explicitly.');
  }
  return ctx;
}
