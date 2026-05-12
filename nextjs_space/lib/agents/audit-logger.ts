import { prisma } from '@/lib/db';

export interface ChatbotAuditInput {
  tenantId: string;
  sessionId?: string;
  telegramUserId?: string;
  userId?: string;
  messageId?: string;
  intent?: string;
  detectedEntities?: Record<string, string>;
  skillExecuted?: string;
  skillParams?: Record<string, any>;
  skillResult?: any;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'BLOCKED_SECURITY' | 'BLOCKED_PERMISSION' | 'BLOCKED_RATE_LIMIT' | 'BLOCKED_VALIDATION';
  errorMessage?: string;
  executionTimeMs?: number;
  inputRaw?: string;
  outputFormatted?: string;
  gemmaInput?: string;
  gemmaOutput?: string;
}

export class ChatbotAuditLogger {
  static async log(input: ChatbotAuditInput): Promise<void> {
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          tenantId: input.tenantId,
          sessionId: input.sessionId || null,
          telegramUserId: input.telegramUserId || null,
          userId: input.userId || null,
          messageId: input.messageId || null,
          intent: input.intent || null,
          detectedEntities: input.detectedEntities ? JSON.stringify(input.detectedEntities) : null,
          skillExecuted: input.skillExecuted || null,
          skillParams: input.skillParams ? JSON.stringify(input.skillParams) : null,
          skillResult: input.skillResult ? JSON.stringify(input.skillResult) : null,
          status: input.status,
          errorMessage: input.errorMessage || null,
          executionTimeMs: input.executionTimeMs || null,
          inputRaw: input.inputRaw || null,
          outputFormatted: input.outputFormatted || null,
          gemmaInput: input.gemmaInput || null,
          gemmaOutput: input.gemmaOutput || null,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('[ChatbotAuditLogger] Error logging audit:', error);
    }
  }

  static async getSessionLogs(sessionId: string): Promise<any[]> {
    try {
      return await prisma.chatbotAuditLog.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' }
      });
    } catch {
      return [];
    }
  }

  static async getTenantLogs(
    tenantId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
      status?: string;
      limit?: number;
    }
  ): Promise<any[]> {
    try {
      return await prisma.chatbotAuditLog.findMany({
        where: {
          tenantId,
          ...(options?.fromDate && { createdAt: { gte: options.fromDate } }),
          ...(options?.toDate && { createdAt: { lte: options.toDate } }),
          ...(options?.status && { status: options.status })
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 100
      });
    } catch {
      return [];
    }
  }

  static async getUserStats(
    tenantId: string,
    telegramUserId: string
  ): Promise<{
    totalMessages: number;
    successfulSkills: number;
    failedSkills: number;
    averageResponseTime: number;
  }> {
    try {
      const logs = await prisma.chatbotAuditLog.findMany({
        where: {
          tenantId,
          telegramUserId
        },
        select: {
          status: true,
          executionTimeMs: true
        }
      });

      const totalMessages = logs.length;
      const successfulSkills = logs.filter(l => l.status === 'SUCCESS').length;
      const failedSkills = logs.filter(l => l.status === 'ERROR').length;
      const responseTimes = logs
        .filter(l => l.executionTimeMs)
        .map(l => l.executionTimeMs as number);
      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      return {
        totalMessages,
        successfulSkills,
        failedSkills,
        averageResponseTime: Math.round(averageResponseTime)
      };
    } catch {
      return {
        totalMessages: 0,
        successfulSkills: 0,
        failedSkills: 0,
        averageResponseTime: 0
      };
    }
  }
}