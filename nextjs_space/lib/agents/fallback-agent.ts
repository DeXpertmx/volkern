import { prisma } from '@/lib/db';

export interface FallbackResult {
  handled: boolean;
  response: string;
  level: 'none' | 'retry' | 'escalate' | 'human';
  shouldRetry: boolean;
  retryAfter?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface FallbackContext {
  userId: string;
  tenantId: string;
  intent?: string;
  originalMessage: string;
  error?: Error;
  errorType?: 'timeout' | 'rate_limit' | 'api_error' | 'parse_error' | 'validation_error' | 'unknown';
  attempts?: number;
  timestamp: Date;
}

export class FallbackAgent {
  private readonly config = { maxRetries: 3, baseRetryDelay: 1000, maxRetryDelay: 10000, escalationThreshold: 3 };

  private readonly severityMap: Record<string, FallbackResult['severity']> = {
    'timeout': 'high', 'rate_limit': 'medium', 'api_error': 'high',
    'parse_error': 'low', 'validation_error': 'low', 'unknown': 'critical'
  };

  private readonly fallbackMessages: Record<string, string> = {
    'timeout': '🔌 El asistente está tardando más de lo normal. Por favor, intenta de nuevo en unos segundos.',
    'rate_limit': '⏳ Demasiadas solicitudes. Espera un momento antes de continuar.',
    'api_error': '🌐 Estamos teniendo problemas técnicos. Nuestro equipo ya está trabajando en ello.',
    'parse_error': '🤔 No entendí bien tu mensaje. ¿Podrías reformularlo?',
    'validation_error': '⚠️ Algo no está bien con tu solicitud. ¿Puedes verificar los datos?',
    'unknown': '❌ Algo salió mal. Por favor, intenta de nuevo más tarde.'
  };

  private readonly retryMessages: Record<number, string> = { 1: 'Vamos a intentarlo de nuevo...', 2: 'Lo estoy volviendo a intentar...', 3: 'Último intento...' };

  async handle(context: FallbackContext): Promise<FallbackResult> {
    const { errorType = 'unknown', attempts = 0, originalMessage, userId, tenantId, intent } = context;

    const severity = this.severityMap[errorType] || 'medium';
    const shouldRetry = this.shouldRetry(errorType, attempts);
    const retryAfter = shouldRetry ? this.calculateRetryDelay(attempts) : undefined;
    const shouldEscalate = this.shouldEscalate(errorType, attempts, severity);

    let response = this.fallbackMessages[errorType] || this.fallbackMessages['unknown'];

    if (shouldRetry && attempts > 0) {
      const retryMsg = this.retryMessages[attempts] || 'Reintentando...';
      response = `${retryMsg} ${response}`;
    }

    if (severity === 'high' || severity === 'critical') {
      response += '\n\nSi el problema persiste, contacta a soporte@volkern.app';
    }

    await this.logFallback({ ...context, errorType, severity, shouldRetry, shouldEscalate, response });

    const level = shouldEscalate ? 'human' : shouldRetry ? 'retry' : 'none';

    return { handled: true, response, level, shouldRetry, retryAfter, severity };
  }

  private shouldRetry(errorType: string, attempts: number): boolean {
    if (attempts >= this.config.maxRetries) return false;
    const retryableErrors = ['timeout', 'rate_limit', 'api_error'];
    if (!retryableErrors.includes(errorType)) return false;
    if (errorType === 'rate_limit' && attempts > 0) return false;
    return true;
  }

  private shouldEscalate(errorType: string, attempts: number, severity: FallbackResult['severity']): boolean {
    if (severity === 'critical') return true;
    if (attempts >= this.config.escalationThreshold) return true;
    if (['validation_error'].includes(errorType)) return true;
    return false;
  }

  private calculateRetryDelay(attempts: number): number {
    return Math.min(this.config.baseRetryDelay * Math.pow(2, attempts), this.config.maxRetryDelay);
  }

  private async logFallback(context: { userId: string; tenantId: string; errorType: string; originalMessage: string; severity: string; shouldRetry: boolean; shouldEscalate: boolean; response: string; attempts?: number; error?: Error }): Promise<void> {
    try {
      await prisma.chatbotAuditLog.create({
        data: { intent: 'fallback_triggered', userId: context.userId, tenantId: context.tenantId, skillParams: { errorType: context.errorType, originalMessage: context.originalMessage.substring(0, 200), shouldRetry: context.shouldRetry, shouldEscalate: context.shouldEscalate, attempts: context.attempts || 0, response: context.response.substring(0, 200), errorMessage: context.error?.message } } as any
      });
      if (context.severity === 'critical') await this.notifyAdmins(context);
    } catch (e) { console.error('Error logging fallback:', e); }
  }

  private async notifyAdmins(context: any): Promise<void> {
    console.error('[CRITICAL] Fallback triggered:', { userId: context.userId, tenantId: context.tenantId, errorType: context.errorType, timestamp: new Date().toISOString() });
  }

  async getFallbackStats(tenantId: string, hours: number = 24): Promise<any> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const logs = await prisma.chatbotAuditLog.findMany({ where: { tenantId, intent: 'fallback_triggered', createdAt: { gte: since } } as any, select: { skillParams: true, createdAt: true } as any });
    
    const stats = { total: logs.length, bySeverity: {} as Record<string, number>, byErrorType: {} as Record<string, number>, byHour: {} as Record<string, number>, escalationRate: 0 };
    let escalationCount = 0;
    
    for (const log of logs) {
      const meta = log.skillParams as any;
      const sev = meta?.severity || 'low';
      stats.bySeverity[sev] = (stats.bySeverity[sev] || 0) + 1;
      const errorType = meta?.errorType || 'unknown';
      stats.byErrorType[errorType] = (stats.byErrorType[errorType] || 0) + 1;
      stats.byHour[(log as any).createdAt.getHours()] = (stats.byHour[(log as any).createdAt.getHours()] || 0) + 1;
      if (meta?.shouldEscalate) escalationCount++;
    }
    
    stats.escalationRate = logs.length > 0 ? escalationCount / logs.length : 0;
    return stats;
  }

  reset(): void {}
}

export const fallbackAgent = new FallbackAgent();