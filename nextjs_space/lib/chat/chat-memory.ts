import { prisma } from '@/lib/db'

export interface ChatMemoryMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export interface ChatMemoryContext {
  lastIntent?: string
  pendingIntent?: string
  collectedEntities: Record<string, string>
  missingEntities: string[]
  facts: string[]
}

const MAX_HISTORY = 30

export class ChatMemoryService {
  constructor(private tenantId: string) {}

  async getOrCreateConversation(params: {
    channel: string
    externalRef: string
    contactName: string
    contactPhone?: string
    contactEmail?: string
    leadId?: string
  }): Promise<{ id: string; isNew: boolean }> {
    const existing = await prisma.conversation.findFirst({
      where: {
        tenantId: this.tenantId,
        externalRef: params.externalRef,
      },
    })

    if (existing) {
      return { id: existing.id, isNew: false }
    }

    const conv = await prisma.conversation.create({
      data: {
        tenantId: this.tenantId,
        canal: params.channel,
        externalRef: params.externalRef,
        contactoNombre: params.contactName,
        contactoTelefono: params.contactPhone,
        contactoEmail: params.contactEmail,
        leadId: params.leadId,
        estado: 'abierta',
        hubMetadata: {
          chatbotContext: {
            collectedEntities: {},
            missingEntities: [],
            facts: [],
          },
        },
      },
    })

    return { id: conv.id, isNew: true }
  }

  async getMessages(conversationId: string, limit = MAX_HISTORY): Promise<ChatMemoryMessage[]> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { fechaCreacion: 'asc' },
      take: limit,
    })

    return messages.map((m) => ({
      role: m.direccion === 'entrante' ? 'user' : 'assistant',
      content: m.contenido,
      timestamp: m.fechaCreacion,
    }))
  }

  async addMessage(params: {
    conversationId: string
    content: string
    direction: 'entrante' | 'saliente'
    channel: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        contenido: params.content,
        direccion: params.direction,
        canal: params.channel,
        metadatos: params.metadata ?? {},
      },
    })

    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: {
        ultimoMensaje: params.content,
        fechaUltimoMensaje: new Date(),
        ...(params.direction === 'entrante' ? { noLeidos: { increment: 1 } } : {}),
      },
    })
  }

  async getContext(conversationId: string): Promise<ChatMemoryContext> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { hubMetadata: true },
    })

    const metadata = (conv?.hubMetadata as any)?.chatbotContext || {}
    return {
      lastIntent: metadata.lastIntent,
      pendingIntent: metadata.pendingIntent,
      collectedEntities: metadata.collectedEntities || {},
      missingEntities: metadata.missingEntities || [],
      facts: metadata.facts || [],
    }
  }

  async updateContext(conversationId: string, updates: Partial<ChatMemoryContext>): Promise<void> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { hubMetadata: true },
    })

    const current = (conv?.hubMetadata as any)?.chatbotContext || {}
    const metadata = conv?.hubMetadata || {}

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        hubMetadata: {
          ...(typeof metadata === 'object' ? metadata : {}),
          chatbotContext: {
            ...current,
            ...updates,
            collectedEntities: {
              ...(current.collectedEntities || {}),
              ...(updates.collectedEntities || {}),
            },
            facts: [
              ...(current.facts || []),
              ...(updates.facts || []),
            ],
          },
        },
      },
    })
  }

  async addFact(conversationId: string, fact: string): Promise<void> {
    const ctx = await this.getContext(conversationId)
    if (!ctx.facts.includes(fact)) {
      ctx.facts.push(fact)
      await this.updateContext(conversationId, { facts: ctx.facts })
    }
  }

  async closeConversation(conversationId: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { estado: 'cerrada' },
    })
  }

  async linkLead(conversationId: string, leadId: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { leadId },
    })
  }

  buildPrompt(context: ChatMemoryContext, recentMessages: ChatMemoryMessage[]): string {
    const parts: string[] = []

    if (context.facts.length > 0) {
      parts.push('Información conocida del cliente:')
      context.facts.forEach((f) => parts.push(`- ${f}`))
      parts.push('')
    }

    if (context.pendingIntent && context.missingEntities.length > 0) {
      parts.push(
        `Acción pendiente: ${context.pendingIntent}. Falta información: ${context.missingEntities.join(', ')}.`
      )
      parts.push('')
    }

    parts.push('Últimos mensajes:')
    recentMessages.slice(-8).forEach((m) => {
      const prefix = m.role === 'user' ? 'Cliente' : 'Tú'
      parts.push(`${prefix}: ${m.content}`)
    })

    return parts.join('\n')
  }
}
