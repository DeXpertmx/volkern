import { prisma } from '@/lib/db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAfterSeconds: number;
  message?: string;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiterAgent {
  private readonly configs: Record<string, RateLimitConfig> = {
    authenticated: { maxRequests: 20, windowMs: 60 * 1000 },
    unauthenticated: { maxRequests: 5, windowMs: 60 * 1000 },
    telegram_anonymous: { maxRequests: 20, windowMs: 60 * 1000 }
  };

  private readonly memoryStore: Map<string, { count: number; firstRequest: number }> = new Map();

  async check(params: {
    userId?: string;
    chatId?: string;
    tenantId?: string;
    isAuthenticated: boolean;
  }): Promise<RateLimitResult> {
    const key = this.getRateLimitKey(params);
    const userType = this.getUserType(params);
    const config = this.configs[userType];

    const now = Date.now();
    const record = this.memoryStore.get(key);
    const windowMs = config.windowMs;

    if (!record) {
      this.memoryStore.set(key, { count: 1, firstRequest: now });
      return { allowed: true, remaining: config.maxRequests - 1, resetAfterSeconds: windowMs / 1000 };
    }

    if (now - record.firstRequest > windowMs) {
      this.memoryStore.set(key, { count: 1, firstRequest: now });
      return { allowed: true, remaining: config.maxRequests - 1, resetAfterSeconds: windowMs / 1000 };
    }

    if (record.count >= config.maxRequests) {
      const resetAfterSeconds = Math.ceil((record.firstRequest + windowMs - now) / 1000);
      await this.logRateLimitExceeded(key, params, record.count);
      
      return {
        allowed: false,
        remaining: 0,
        resetAfterSeconds,
        message: `⏳ Demasiados mensajes. Espera ${resetAfterSeconds} segundos antes de enviar más mensajes.`
      };
    }

    record.count++;
    this.memoryStore.set(key, record);
    
    return {
      allowed: true,
      remaining: config.maxRequests - record.count,
      resetAfterSeconds: Math.ceil((record.firstRequest + windowMs - now) / 1000)
    };
  }

  private getRateLimitKey(params: {
    userId?: string;
    chatId?: string;
    tenantId?: string;
    isAuthenticated: boolean;
  }): string {
    if (params.userId && params.isAuthenticated) {
      return `user:${params.userId}`;
    }
    if (params.chatId) {
      return `chat:${params.chatId}`;
    }
    if (params.tenantId) {
      return `tenant:${params.tenantId}`;
    }
    return 'anonymous:global';
  }

  private getUserType(params: {
    isAuthenticated: boolean;
    chatId?: string;
  }): string {
    if (params.isAuthenticated) {
      return 'authenticated';
    }
    if (params.chatId) {
      return 'telegram_anonymous';
    }
    return 'unauthenticated';
  }

  private async logRateLimitExceeded(key: string, params: any, count: number) {
    try {
      await prisma.chatbotAuditLog.create({
        data: {
          tenantId: params.tenantId || 'unknown',
          status: 'BLOCKED_RATE_LIMIT',
          inputRaw: `rate_limit_exceeded:${key}`,
          errorMessage: `Rate limit exceeded: ${count} requests`,
          telegramUserId: params.chatId || null,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error logging rate limit:', error);
    }
  }

  startCleanupJob(): NodeJS.Timeout {
    return setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.memoryStore.entries()) {
        if (now - record.firstRequest > 60 * 1000) {
          this.memoryStore.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }
}

export const rateLimiter = new RateLimiterAgent();