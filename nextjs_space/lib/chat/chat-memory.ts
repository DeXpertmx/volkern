import { prisma } from '@/lib/db'

export interface ChatMemoryMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export interface ConversationSummary {
  text: string
  topics: string[]
  decisions: string[]
  customerInfo: Record<string, string>
  timestamp: number
  summarizedMessages: number
  version: number
}

export interface ChatMemoryContext {
  lastIntent?: string
  pendingIntent?: string
  collectedEntities: Record<string, string>
  missingEntities: string[]
  facts: string[]
  /**
   * Quick reply chips the bot offered in the LAST assistant message.
   * Used to detect incoming clicks (when the user's next message matches one of these).
   */
  lastOfferedQuickReplies?: string[]
  /**
   * Quick reply chips the user has clicked since the last free-text input.
   * Cleared whenever the user types free text so each search session can re-explore.
   * Filtered out from subsequent `quickReplies` so the LLM doesn't regenerate them.
   */
  clickedQuickReplies: string[]
  summary?: ConversationSummary | null
}

function normalizeReply(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Returns true when the user's text resolves to one of the chips that were offered.
 *
 * Handles bidirectional truncation: the catalog may produce chips whose text
 * ends with "..." (long-label truncation by some channels), AND for Telegram
 * the stored `lastOfferedQuickReplies` carries the truncated safeText while
 * incoming click messages carry that same truncated form. We compare against a
 * common prefix after stripping trailing "..." on either side.
 */
export function isQuickReplyMatch(offered: string, message: string): boolean {
  const ELLIPSIS = '...'
  const stripEllipsis = (s: string) => (s.endsWith(ELLIPSIS) && s.length > 3 ? s.slice(0, -3) : s)
  const offeredStripped = stripEllipsis(offered)
  const messageStripped = stripEllipsis(message)
  const o = normalizeReply(offeredStripped)
  const m = normalizeReply(messageStripped)
  if (o === m) return true
  // If EITHER side was truncated (lost data), allow prefix match in either
  // direction. Without this, Telegram clicks on long chips would never match,
  // because the stored offered is the full text but the click carries the
  // truncated form.
  const offeredTruncated = offeredStripped !== offered
  const messageTruncated = messageStripped !== message
  if (offeredTruncated || messageTruncated) {
    if (o.startsWith(m) || m.startsWith(o)) return true
  }
  return false
}

/**
 * Filters out chips that the user has already clicked within this search session.
 * Returns the filtered list verbatim (possibly empty) — never falls back to the
 * originals, since that would betray the user's "no regenerating clicked chips"
 * requirement when the catalog happens to produce an identical set.
 */
export function filterClickedQuickReplies(
  replies: string[] | undefined,
  clicked: string[] | undefined
): string[] | undefined {
  if (!replies || replies.length === 0) return replies
  if (!clicked || clicked.length === 0) return replies
  return replies.filter(r => !clicked.some(c => isQuickReplyMatch(c, r)))
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
      lastOfferedQuickReplies: metadata.lastOfferedQuickReplies || undefined,
      clickedQuickReplies: metadata.clickedQuickReplies || [],
      summary: metadata.summary || null,
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

  /**
   * Persist the chip set the bot just offered so the next incoming message
   * can be classified as a click vs free text.
   */
  async recordOfferedQuickReplies(conversationId: string, replies: string[]): Promise<void> {
    if (!replies || replies.length === 0) return
    await this.updateContext(conversationId, {
      lastOfferedQuickReplies: replies,
    })
  }

  /**
   * Record that the user clicked a chip. Idempotent — same chip clicked twice
   * doesn't duplicate. Clears `lastOfferedQuickReplies` because the offer
   * has been resolved by this click.
   */
  async markClickedQuickReply(conversationId: string, reply: string): Promise<void> {
    const ctx = await this.getContext(conversationId)
    const target = normalizeReply(reply)
    const alreadyClicked = ctx.clickedQuickReplies.some(c => normalizeReply(c) === target)
    const updated = alreadyClicked
      ? ctx.clickedQuickReplies
      : [...ctx.clickedQuickReplies, reply]
    await this.updateContext(conversationId, {
      clickedQuickReplies: updated,
      lastOfferedQuickReplies: undefined,
    })
  }

  /**
   * Reset the clicked-quick-replies log on free-text input so the user
   * can re-explore the same filters in a new search session.
   */
  async clearClickedQuickReplies(conversationId: string): Promise<void> {
    await this.updateContext(conversationId, {
      clickedQuickReplies: [],
      lastOfferedQuickReplies: undefined,
    })
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

    // ═══ RESUMEN DE CONVERSACIÓN (si existe) ═══
    if (context.summary?.text) {
      parts.push('=== RESUMEN DE LA CONVERSACIÓN ANTERIOR ===')
      parts.push(context.summary.text)

      if (context.summary.decisions.length > 0) {
        parts.push('')
        parts.push('Decisiones/Acciones:')
        context.summary.decisions.forEach((d) => parts.push(`- ${d}`))
      }

      if (Object.keys(context.summary.customerInfo).length > 0) {
        parts.push('')
        parts.push('Datos del cliente:')
        Object.entries(context.summary.customerInfo).forEach(([k, v]) => parts.push(`- ${k}: ${v}`))
      }

      parts.push('=== FIN DEL RESUMEN ===')
      parts.push('')
    }

    // ═══ FACTS (información del cliente) ═══
    if (context.facts.length > 0) {
      parts.push('INFORMACIÓN DEL CLIENTE:')
      context.facts.forEach((f) => parts.push(`- ${f}`))
      parts.push('')
    }

    // ═══ ACCIÓN PENDIENTE ═══
    if (context.pendingIntent && context.missingEntities.length > 0) {
      parts.push(
        `Acción pendiente: ${context.pendingIntent}. Falta información: ${context.missingEntities.join(', ')}.`
      )
      parts.push('')
    }

    // ═══ ÚLTIMOS MENSAJES ═══
    parts.push('Últimos mensajes:')
    recentMessages.slice(-8).forEach((m) => {
      const prefix = m.role === 'user' ? 'Cliente' : 'Tú'
      parts.push(`${prefix}: ${m.content}`)
    })

    return parts.join('\n')
  }
}
