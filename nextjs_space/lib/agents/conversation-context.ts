/**
 * Conversation Context Agent - Memoria persistente en DB
 *
 * Almacena contexto de conversación en la tabla Conversation (hubMetadata)
 * y los mensajes en la tabla Message, usando ChatMemoryService.
 * Reemplaza el anterior almacenamiento en memoria (Map) que se perdía al reiniciar.
 */

import { ChatMemoryService, ChatMemoryMessage, ChatMemoryContext } from '@/lib/chat/chat-memory'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  message: string
  timestamp: number
}

export interface ConversationContext {
  sessionId: string
  conversationId: string
  userId: string
  tenantId: string

  lastIntent?: string
  pendingIntent?: string
  collectedEntities: Record<string, string>
  missingEntities: string[]
  facts: string[]

  history: ConversationMessage[]

  telegramChatId?: string
  chatwootContactId?: string

  createdAt: number
  updatedAt: number
}

const MAX_HISTORY = 30

const contextCache = new Map<string, ConversationContext>()
const SESSION_TTL_MS = 30 * 60 * 1000

async function getMemory(tenantId: string) {
  return new ChatMemoryService(tenantId)
}

export const ConversationContextAgent = {
  async getOrCreateContext(
    tenantId: string,
    userId: string,
    _maxContextMessages = 10
  ): Promise<ConversationContext> {
    const externalRef = `telegram:${userId}`
    const memory = await getMemory(tenantId)

    const conv = await memory.getOrCreateConversation({
      channel: 'telegram',
      externalRef,
      contactName: userId,
    })

    const ctx = await this.load({
      conversationId: conv.id,
      userId,
      tenantId,
    })

    const cacheKey = `ctx:${conv.id}`
    contextCache.set(cacheKey, ctx)

    return ctx
  },

  async updateContext(
    sessionId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const conversationId = sessionId.replace('sess_', '')
    const cacheKey = `ctx:${conversationId}`
    const cached = contextCache.get(cacheKey)
    if (!cached) return

    if (updates.lastIntent !== undefined) cached.lastIntent = updates.lastIntent as string
    if (updates.pendingIntent !== undefined) cached.pendingIntent = updates.pendingIntent as string
    if (updates.collectedEntities !== undefined) cached.collectedEntities = updates.collectedEntities as Record<string, string>
    if (updates.missingEntities !== undefined) cached.missingEntities = updates.missingEntities as string[]

    cached.updatedAt = Date.now()

    const memory = await getMemory(cached.tenantId)
    await memory.updateContext(conversationId, {
      lastIntent: cached.lastIntent,
      pendingIntent: cached.pendingIntent,
      collectedEntities: cached.collectedEntities,
      missingEntities: cached.missingEntities,
      facts: cached.facts,
    })
  },

  async setMissingEntities(
    sessionId: string,
    missingEntities: string[]
  ): Promise<void> {
    const conversationId = sessionId.replace('sess_', '')
    const cacheKey = `ctx:${conversationId}`
    const cached = contextCache.get(cacheKey)
    if (!cached) return

    cached.missingEntities = missingEntities
    cached.updatedAt = Date.now()

    const memory = await getMemory(cached.tenantId)
    await memory.updateContext(conversationId, { missingEntities })
  },
  async load(params: {
    conversationId: string
    userId: string
    tenantId: string
  }): Promise<ConversationContext> {
    const { conversationId, tenantId } = params
    const memory = new ChatMemoryService(tenantId)

    const ctx = await memory.getContext(conversationId)
    const messages = await memory.getMessages(conversationId, MAX_HISTORY)

    return {
      sessionId: `sess_${conversationId}`,
      conversationId,
      userId: params.userId,
      tenantId,
      lastIntent: ctx.lastIntent,
      pendingIntent: ctx.pendingIntent,
      collectedEntities: ctx.collectedEntities,
      missingEntities: ctx.missingEntities,
      facts: ctx.facts,
      history: messages.map((m) => ({
        role: m.role === 'system' ? 'assistant' : m.role,
        message: m.content,
        timestamp: m.timestamp.getTime(),
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  },

  async update(
    context: ConversationContext,
    updates?: Partial<ConversationContext>
  ): Promise<ConversationContext> {
    if (updates) {
      Object.assign(context, updates)
    }

    context.updatedAt = Date.now()

    if (context.history.length > MAX_HISTORY) {
      context.history = context.history.slice(-MAX_HISTORY)
    }

    const memory = new ChatMemoryService(context.tenantId)
    await memory.updateContext(context.conversationId, {
      lastIntent: context.lastIntent,
      pendingIntent: context.pendingIntent,
      collectedEntities: context.collectedEntities,
      missingEntities: context.missingEntities,
      facts: context.facts,
    })

    return context
  },

  async addMessage(
    context: ConversationContext,
    role: 'user' | 'assistant',
    message: string
  ): Promise<ConversationContext> {
    context.history.push({ role, message, timestamp: Date.now() })

    if (context.history.length > MAX_HISTORY) {
      context.history = context.history.slice(-MAX_HISTORY)
    }

    const memory = new ChatMemoryService(context.tenantId)
    await memory.addMessage({
      conversationId: context.conversationId,
      content: message,
      direction: role === 'user' ? 'entrante' : 'saliente',
      channel: 'chatbot',
    })

    return this.update(context)
  },

  async updateIntent(
    context: ConversationContext,
    intent: string,
    entities: Record<string, string>,
    missingEntities: string[] = []
  ): Promise<ConversationContext> {
    const mergedEntities = { ...context.collectedEntities, ...entities }

    return this.update(context, {
      lastIntent: intent,
      pendingIntent: missingEntities.length > 0 ? intent : undefined,
      collectedEntities: mergedEntities,
      missingEntities,
    })
  },

  async completeEntities(
    context: ConversationContext,
    entities: Record<string, string>
  ): Promise<ConversationContext> {
    const mergedEntities = { ...context.collectedEntities, ...entities }
    const required = getRequiredEntities(context.pendingIntent)
    const missing = required.filter((e) => !mergedEntities[e])

    return this.update(context, {
      collectedEntities: mergedEntities,
      missingEntities: missing,
      pendingIntent: missing.length > 0 ? context.pendingIntent : undefined,
    })
  },

  async addFact(context: ConversationContext, fact: string): Promise<ConversationContext> {
    if (!context.facts.includes(fact)) {
      context.facts.push(fact)
      const memory = new ChatMemoryService(context.tenantId)
      await memory.addFact(context.conversationId, fact)
    }
    return context
  },

  async reset(conversationId: string, tenantId: string): Promise<void> {
    const memory = new ChatMemoryService(tenantId)
    await memory.updateContext(conversationId, {
      lastIntent: undefined,
      pendingIntent: undefined,
      collectedEntities: {},
      missingEntities: [],
      facts: [],
    })
  },

  getSummary(context: ConversationContext): {
    lastIntent?: string
    pendingIntent?: string
    entities: Record<string, string>
    missing: string[]
    facts: string[]
  } {
    return {
      lastIntent: context.lastIntent,
      pendingIntent: context.pendingIntent,
      entities: context.collectedEntities,
      missing: context.missingEntities,
      facts: context.facts,
    }
  },

  getRecentMessages(context: ConversationContext, count = 5): ConversationMessage[] {
    return context.history.slice(-count)
  },

  buildPrompt(context: ConversationContext): string {
    const memory = new ChatMemoryService(context.tenantId)
    return memory.buildPrompt(
      {
        lastIntent: context.lastIntent,
        pendingIntent: context.pendingIntent,
        collectedEntities: context.collectedEntities,
        missingEntities: context.missingEntities,
        facts: context.facts,
      } as any,
      context.history.map((m) => ({
        role: m.role,
        content: m.message,
        timestamp: new Date(m.timestamp),
      }))
    )
  },
}

function getRequiredEntities(intent?: string): string[] {
  const required: Record<string, string[]> = {
    agendar_cita: ['date', 'time', 'service'],
    cancelar_cita: ['appointment_id'],
    consultar_cita: ['date'],
    consultar_precio: ['service'],
  }
  return intent ? required[intent] || [] : []
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .substring(0, 4000)
}

export default ConversationContextAgent
