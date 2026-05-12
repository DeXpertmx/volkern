import { prisma } from '@/lib/db';

export interface ConversationContext {
  tenantId: string;
  telegramUserId: string;
  userId?: string;
  sessionId: string;
  state: 'ACTIVE' | 'COMPLETED' | 'TIMEOUT' | 'BLOCKED';
  lastIntent?: string;
  pendingIntent?: string;
  collectedEntities: Record<string, string>;
  missingEntities: string[];
  step: number;
  messagesCount: number;
  lastMessageAt: Date;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export class ConversationContextAgent {
  private static readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

  static async getOrCreateContext(
    tenantId: string,
    telegramUserId: string,
    maxMessages: number = 10
  ): Promise<ConversationContext> {
    // Buscar sesión activa reciente
    const activeSession = await prisma.chatSession.findFirst({
      where: {
        tenantId,
        telegramUserId,
        state: 'ACTIVE',
        lastMessageAt: {
          gte: new Date(Date.now() - this.SESSION_TIMEOUT_MS)
        }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    if (activeSession) {
      return this.serializeContext(activeSession);
    }

    // Crear nueva sesión
    const newSession = await prisma.chatSession.create({
      data: {
        tenantId,
        telegramUserId,
        sessionId: this.generateSessionId(),
        state: 'ACTIVE',
        collectedEntities: {},
        missingEntities: [],
        step: 0,
        messagesCount: 0
      }
    });

    return this.serializeContext(newSession);
  }

  static async updateContext(
    sessionId: string,
    updates: Partial<ConversationContext>
  ): Promise<ConversationContext | null> {
    const session = await prisma.chatSession.findUnique({
      where: { sessionId }
    });

    if (!session) return null;

    const updated = await prisma.chatSession.update({
      where: { sessionId },
      data: {
        ...updates,
        lastMessageAt: new Date(),
        messagesCount: { increment: 1 }
      }
    });

    return this.serializeContext(updated);
  }

  static async getContext(sessionId: string): Promise<ConversationContext | null> {
    const session = await prisma.chatSession.findUnique({
      where: { sessionId }
    });

    if (!session) return null;

    // Verificar si expiró
    if (
      session.state === 'ACTIVE' &&
      new Date(session.lastMessageAt).getTime() < Date.now() - this.SESSION_TIMEOUT_MS
    ) {
      await this.expireSession(sessionId);
      return null;
    }

    return this.serializeContext(session);
  }

  static async getConversationHistory(
    sessionId: string,
    limit: number = 10
  ): Promise<Message[]> {
    // Por ahora retornamos un array vacío
    // En una implementación completa, almacenaríamos los mensajes en otra tabla
    // Por ahora reconstruimos el contexto desde la sesión
    return [];
  }

  static async addEntity(
    sessionId: string,
    entityName: string,
    entityValue: string
  ): Promise<ConversationContext | null> {
    const session = await prisma.chatSession.findUnique({
      where: { sessionId }
    });

    if (!session) return null;

    const collectedEntities = session.collectedEntities as Record<string, string>;
    const missingEntities = session.missingEntities as string[];

    // Actualizar entidades recogidas
    collectedEntities[entityName] = entityValue;

    // Remover de missingEntities si estaba
    const newMissingEntities = missingEntities.filter(e => e !== entityName);

    return this.updateContext(sessionId, {
      collectedEntities,
      missingEntities: newMissingEntities
    });
  }

  static async setMissingEntities(
    sessionId: string,
    entities: string[]
  ): Promise<ConversationContext | null> {
    return this.updateContext(sessionId, {
      missingEntities: entities,
      step: { increment: 1 }
    });
  }

  static async completeSession(sessionId: string): Promise<void> {
    await prisma.chatSession.update({
      where: { sessionId },
      data: {
        state: 'COMPLETED',
        endedAt: new Date()
      }
    });
  }

  static async expireSession(sessionId: string): Promise<void> {
    await prisma.chatSession.update({
      where: { sessionId },
      data: {
        state: 'TIMEOUT',
        endedAt: new Date()
      }
    });
  }

  static async blockSession(sessionId: string, reason: string): Promise<void> {
    await prisma.chatSession.update({
      where: { sessionId },
      data: {
        state: 'BLOCKED',
        endedAt: new Date(),
        metadata: { blockReason: reason }
      }
    });
  }

  private static serializeContext(session: any): ConversationContext {
    return {
      tenantId: session.tenantId,
      telegramUserId: session.telegramUserId,
      userId: session.userId,
      sessionId: session.sessionId,
      state: session.state as 'ACTIVE' | 'COMPLETED' | 'TIMEOUT' | 'BLOCKED',
      lastIntent: session.lastIntent || undefined,
      pendingIntent: session.pendingIntent || undefined,
      collectedEntities: session.collectedEntities as Record<string, string> || {},
      missingEntities: session.missingEntities as string[] || [],
      step: session.step || 0,
      messagesCount: session.messagesCount || 0,
      lastMessageAt: session.lastMessageAt
    };
  }

  private static generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  static isContextComplete(context: ConversationContext): boolean {
    return context.missingEntities.length === 0 && !!context.pendingIntent;
  }

  static getNextMissingEntity(context: ConversationContext): string | null {
    return context.missingEntities[0] || null;
  }
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .substring(0, 4000);
}