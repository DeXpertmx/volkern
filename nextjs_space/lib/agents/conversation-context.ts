/**
 * Conversation Context Agent - Memoria multi-turn
 * 
 * Gestiona el contexto de conversación con:
 * - Persistencia de entidades
 * - Historial de mensajes
 * - Continuidad de intent
 * - Expiración de sesiones
 */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  message: string;
  timestamp: number;
}

export interface ConversationContext {
  sessionId: string;
  conversationId: string;
  userId: string;
  tenantId: string;
  
  lastIntent?: string;
  pendingIntent?: string;
  collectedEntities: Record<string, string>;
  missingEntities: string[];
  
  history: ConversationMessage[];
  
  telegramChatId?: string;
  chatwootContactId?: string;
  
  createdAt: number;
  updatedAt: number;
}

// Storage en memoria (en producción usar Redis)
const contextStore = new Map<string, ConversationContext>();

// Configuración
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_HISTORY = 20; // Máximo mensajes en historial

function getKey(conversationId: string): string {
  return `ctx:${conversationId}`;
}

export const ConversationContextAgent = {
  /**
   * Cargar o crear contexto para una conversación
   */
  async load(params: {
    conversationId: string;
    userId: string;
    tenantId: string;
  }): Promise<ConversationContext> {
    const { conversationId, userId, tenantId } = params;
    const key = getKey(conversationId);
    
    let ctx = contextStore.get(key);
    
    // Verificar expiración
    if (ctx && Date.now() - ctx.updatedAt > SESSION_TTL_MS) {
      console.log(`[Context] Sesión expirada para ${conversationId}, creando nueva`);
      await this.reset(conversationId);
      ctx = null;
    }
    
    if (!ctx) {
      ctx = this.create(conversationId, userId, tenantId);
      contextStore.set(key, ctx);
      console.log(`[Context] Nuevo contexto creado para ${conversationId}`);
    }
    
    return ctx;
  },

  /**
   * Crear nuevo contexto
   */
  create(conversationId: string, userId: string, tenantId: string): ConversationContext {
    return {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      conversationId,
      userId,
      tenantId,
      collectedEntities: {},
      missingEntities: [],
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  },

  /**
   * Actualizar contexto
   */
  async update(context: ConversationContext, updates?: Partial<ConversationContext>): Promise<ConversationContext> {
    if (updates) {
      Object.assign(context, updates);
    }
    
    context.updatedAt = Date.now();
    
    // Limitar historial para evitar crecimiento infinito
    if (context.history.length > MAX_HISTORY) {
      context.history = context.history.slice(-MAX_HISTORY);
    }
    
    const key = getKey(context.conversationId);
    contextStore.set(key, context);
    
    return context;
  },

  /**
   * Agregar mensaje al historial
   */
  async addMessage(context: ConversationContext, role: 'user' | 'assistant', message: string): Promise<ConversationContext> {
    context.history.push({
      role,
      message,
      timestamp: Date.now()
    });
    
    // Limitar historial
    if (context.history.length > MAX_HISTORY) {
      context.history = context.history.slice(-MAX_HISTORY);
    }
    
    return this.update(context);
  },

  /**
   * Actualizar intent y entidades
   */
  async updateIntent(
    context: ConversationContext,
    intent: string,
    entities: Record<string, string>,
    missingEntities: string[] = []
  ): Promise<ConversationContext> {
    // Entity merging: mantener entidades previamente.collected
    const mergedEntities = {
      ...context.collectedEntities,
      ...entities
    };
    
    return this.update(context, {
      lastIntent: intent,
      pendingIntent: missingEntities.length > 0 ? intent : undefined,
      collectedEntities: mergedEntities,
      missingEntities
    });
  },

  /**
   * Completar entities faltantes
   */
  async completeEntities(context: ConversationContext, entities: Record<string, string>): Promise<ConversationContext> {
    const mergedEntities = {
      ...context.collectedEntities,
      ...entities
    };
    
    // Recalcular missing entities
    const required = getRequiredEntities(context.pendingIntent);
    const missing = required.filter(e => !mergedEntities[e]);
    
    return this.update(context, {
      collectedEntities: mergedEntities,
      missingEntities: missing,
      pendingIntent: missing.length > 0 ? context.pendingIntent : undefined
    });
  },

  /**
   * Resetear contexto (para errores o soporte)
   */
  async reset(conversationId: string): Promise<void> {
    const key = getKey(conversationId);
    contextStore.delete(key);
    console.log(`[Context] Contexto reseteado para ${conversationId}`);
  },

  /**
   * Obtener resumen de contexto para Gemma
   */
  getSummary(context: ConversationContext): {
    lastIntent?: string;
    pendingIntent?: string;
    entities: Record<string, string>;
    missing: string[];
  } {
    return {
      lastIntent: context.lastIntent,
      pendingIntent: context.pendingIntent,
      entities: context.collectedEntities,
      missing: context.missingEntities
    };
  },

  /**
   * Obtener últimos N mensajes para contexto
   */
  getRecentMessages(context: ConversationContext, count: number = 5): ConversationMessage[] {
    return context.history.slice(-count);
  },

  /**
   * Verificar si sesión está activa
   */
  isActive(context: ConversationContext): boolean {
    return Date.now() - context.updatedAt < SESSION_TTL_MS;
  },

  /**
   * Obtener todas las sesiones activas de un tenant
   */
  getActiveSessions(tenantId: string): ConversationContext[] {
    const sessions: ConversationContext[] = [];
    
    for (const ctx of contextStore.values()) {
      if (ctx.tenantId === tenantId && this.isActive(ctx)) {
        sessions.push(ctx);
      }
    }
    
    return sessions;
  },

  /**
   * Limpiar sesiones expiradas
   */
  async cleanExpired(): Promise<number> {
    let cleaned = 0;
    
    for (const [key, ctx] of contextStore.entries()) {
      if (Date.now() - ctx.updatedAt > SESSION_TTL_MS) {
        contextStore.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Context] Limpiadas ${cleaned} sesiones expiradas`);
    }
    
    return cleaned;
  }
};

// Helper para obtener entidades requeridas por intent
function getRequiredEntities(intent?: string): string[] {
  const required: Record<string, string[]> = {
    'agendar_cita': ['date', 'time', 'service'],
    'cancelar_cita': ['appointment_id'],
    'consultar_cita': ['date'],
    'consultar_precio': ['service']
  };
  
  return intent ? required[intent] || [] : [];
}

// Función de sanitización
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .substring(0, 4000);
}

export default ConversationContextAgent;