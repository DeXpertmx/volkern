import { PLAN_LIMITS, PlanType } from './plans';
import { globalPrisma } from './db';

export type RateLimitAction =
  | 'api_request_minute'
  | 'api_request_hour'
  | 'api_request_day'
  | 'message_send_day'
  | 'email_send_day'
  | 'whatsapp_message_day'
  | 'file_upload_day'
  | 'ai_request_day'
  | 'implantacion_ia_day';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

interface RateLimitConfig {
  limit: number;
  windowMs: number;
  windowLabel: string;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  api_request_minute: { limit: 60, windowMs: 60 * 1000, windowLabel: 'minuto' },
  api_request_hour: { limit: 3000, windowMs: 60 * 60 * 1000, windowLabel: 'hora' },
  api_request_day: { limit: 50000, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  message_send_day: { limit: 200, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  email_send_day: { limit: 500, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  whatsapp_message_day: { limit: 1000, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  file_upload_day: { limit: 100, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  ai_request_day: { limit: 50, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  // El alta guiada reescribe la propuesta con el modelo al guardar el
  // cuestionario. Veinte al día dejan corregir respuestas de sobra sin que un
  // cliente que reenvía el formulario en bucle gaste la cuenta.
  implantacion_ia_day: { limit: 20, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
};

const ACTION_TO_PLAN_KEY: Record<RateLimitAction, string> = {
  api_request_minute: 'leads',
  api_request_hour: 'leads',
  api_request_day: 'leads',
  message_send_day: 'leads',
  email_send_day: 'emails_per_month',
  whatsapp_message_day: 'whatsapp_messages',
  file_upload_day: 'storage_gb',
  ai_request_day: 'ai_image_generations',
  implantacion_ia_day: 'ai_image_generations',
};

const ACTION_TO_LIMIT_KEY: Record<RateLimitAction, keyof typeof DEFAULT_RATE_LIMITS> = {
  api_request_minute: 'api_request_minute',
  api_request_hour: 'api_request_hour',
  api_request_day: 'api_request_day',
  message_send_day: 'message_send_day',
  email_send_day: 'email_send_day',
  whatsapp_message_day: 'whatsapp_message_day',
  file_upload_day: 'file_upload_day',
  ai_request_day: 'ai_request_day',
  implantacion_ia_day: 'implantacion_ia_day',
};

class InMemoryStore {
  private store: Map<string, { count: number; resetAt: number }> = new Map();

  get(key: string): { count: number; resetAt: number } | undefined {
    const entry = this.store.get(key);
    if (entry && entry.resetAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, count: number, windowMs: number): void {
    const resetAt = Date.now() + windowMs;
    this.store.set(key, { count, resetAt });
  }

  increment(key: string, windowMs: number): { count: number; resetAt: number } {
    const existing = this.get(key);
    if (existing) {
      const newCount = existing.count + 1;
      this.store.set(key, { count: newCount, resetAt: existing.resetAt });
      return { count: newCount, resetAt: existing.resetAt };
    }
    const resetAt = Date.now() + windowMs;
    this.store.set(key, { count: 1, resetAt });
    return { count: 1, resetAt };
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

let redisClient: any = null;
let redisAvailable = false;

async function getRedisClient() {
  if (redisClient) return redisClient;
  
  try {
    const { initRedis } = await import('./core/redis');
    redisClient = await initRedis();
    redisAvailable = !!redisClient;
  } catch (error) {
    console.warn('[RateLimiter] Redis not available, using in-memory fallback');
    redisAvailable = false;
  }
  
  return redisClient;
}

export class RateLimiter {
  private memoryStore: InMemoryStore;
  private useRedis: boolean = false;

  constructor() {
    this.memoryStore = new InMemoryStore();
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      const redis = await getRedisClient();
      this.useRedis = !!redis;
    } catch {
      this.useRedis = false;
    }
  }

  private getRateLimitConfig(tenantId: string, action: RateLimitAction, customLimit?: number): RateLimitConfig {
    const defaultConfig = DEFAULT_RATE_LIMITS[ACTION_TO_LIMIT_KEY[action]];
    
    if (customLimit !== undefined && customLimit > 0) {
      return { ...defaultConfig, limit: customLimit };
    }

    return defaultConfig;
  }

  private async getTenantCustomLimit(tenantId: string, action: RateLimitAction): Promise<number | undefined> {
    try {
      const feature = await globalPrisma.tenantFeature.findUnique({
        where: {
          tenantId_feature: {
            tenantId,
            feature: `rate_limit_${action}`,
          },
        },
      });
      return feature?.limitePersonalizado ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async getPlanBasedLimit(tenantId: string, action: RateLimitAction): Promise<number> {
    try {
      const tenant = await globalPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true },
      });

      if (!tenant) return DEFAULT_RATE_LIMITS[ACTION_TO_LIMIT_KEY[action]].limit;

      const planKey = tenant.plan as PlanType;
      const planLimits = PLAN_LIMITS[planKey];
      
      if (!planLimits) {
        return DEFAULT_RATE_LIMITS[ACTION_TO_LIMIT_KEY[action]].limit;
      }

      const planKeyForAction = ACTION_TO_PLAN_KEY[action];
      const planValue = (planLimits as any)[planKeyForAction];
      
      if (planValue === -1) return 999999999;
      if (typeof planValue === 'number' && planValue > 0) return planValue;
      
      return DEFAULT_RATE_LIMITS[ACTION_TO_LIMIT_KEY[action]].limit;
    } catch {
      return DEFAULT_RATE_LIMITS[ACTION_TO_LIMIT_KEY[action]].limit;
    }
  }

  async getEffectiveLimit(tenantId: string, action: RateLimitAction): Promise<number> {
    const customLimit = await this.getTenantCustomLimit(tenantId, action);
    if (customLimit !== undefined) {
      return customLimit;
    }

    return this.getPlanBasedLimit(tenantId, action);
  }

  async checkLimit(
    tenantId: string,
    action: RateLimitAction,
    limit?: number
  ): Promise<RateLimitResult> {
    const effectiveLimit = limit ?? await this.getEffectiveLimit(tenantId, action);
    const config = this.getRateLimitConfig(tenantId, action, effectiveLimit);
    const key = `${tenantId}:${action}`;

    if (this.useRedis && redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        const now = Date.now();
        const windowStart = now - config.windowMs;

        const [currentCount, resetAtTime] = await Promise.all([
          redisClient.zadd(redisKey, now, `${now}`),
          redisClient.get(`ratelimit:reset:${key}`),
        ]);

        await redisClient.zremrangebyscore(redisKey, 0, windowStart);
        const count = await redisClient.zcard(redisKey);
        
        const resetAt = resetAtTime ? new Date(parseInt(resetAtTime)) : new Date(now + config.windowMs);
        
        if (!resetAtTime) {
          await redisClient.set(`ratelimit:reset:${key}`, (now + config.windowMs).toString(), 'EX', Math.ceil(config.windowMs / 1000));
        }

        const remaining = Math.max(0, effectiveLimit - count);
        
        return {
          allowed: count <= effectiveLimit,
          remaining,
          resetAt,
          limit: effectiveLimit,
        };
      } catch (error) {
        console.error('[RateLimiter] Redis error, falling back to memory:', error);
        this.useRedis = false;
      }
    }

    const current = this.memoryStore.increment(key, config.windowMs);
    const remaining = Math.max(0, effectiveLimit - current.count);

    return {
      allowed: current.count <= effectiveLimit,
      remaining,
      resetAt: new Date(current.resetAt),
      limit: effectiveLimit,
    };
  }

  async increment(
    tenantId: string,
    action: RateLimitAction,
    amount: number = 1
  ): Promise<void> {
    const effectiveLimit = await this.getEffectiveLimit(tenantId, action);
    const config = this.getRateLimitConfig(tenantId, action, effectiveLimit);
    const key = `${tenantId}:${action}`;

    if (this.useRedis && redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        const now = Date.now();
        const windowStart = now - config.windowMs;

        await Promise.all([
          redisClient.zadd(redisKey, now, `${now}:${Math.random()}`),
          redisClient.zremrangebyscore(redisKey, 0, windowStart),
        ]);

        const ttl = Math.ceil(config.windowMs / 1000);
        await redisClient.expire(redisKey, ttl);
      } catch (error) {
        console.error('[RateLimiter] Redis increment error:', error);
      }
    } else {
      for (let i = 0; i < amount; i++) {
        this.memoryStore.increment(key, config.windowMs);
      }
    }
  }

  async getUsage(tenantId: string, action: RateLimitAction): Promise<number> {
    const effectiveLimit = await this.getEffectiveLimit(tenantId, action);
    const config = this.getRateLimitConfig(tenantId, action, effectiveLimit);
    const key = `${tenantId}:${action}`;

    if (this.useRedis && redisClient) {
      try {
        const redisKey = `ratelimit:${key}`;
        const now = Date.now();
        const windowStart = now - config.windowMs;

        await redisClient.zremrangebyscore(redisKey, 0, windowStart);
        return await redisClient.zcard(redisKey);
      } catch {
        const entry = this.memoryStore.get(key);
        return entry?.count ?? 0;
      }
    }

    const entry = this.memoryStore.get(key);
    return entry?.count ?? 0;
  }

  async reset(tenantId: string, action: RateLimitAction): Promise<void> {
    const key = `${tenantId}:${action}`;

    if (this.useRedis && redisClient) {
      try {
        await Promise.all([
          redisClient.del(`ratelimit:${key}`),
          redisClient.del(`ratelimit:reset:${key}`),
        ]);
      } catch (error) {
        console.error('[RateLimiter] Redis reset error:', error);
      }
    }

    this.memoryStore.delete(key);
  }

  async getAllLimits(tenantId: string): Promise<Record<string, RateLimitResult>> {
    const actions = Object.keys(DEFAULT_RATE_LIMITS) as RateLimitAction[];
    const results: Record<string, RateLimitResult> = {};

    for (const action of actions) {
      results[action] = await this.checkLimit(tenantId, action);
    }

    return results;
  }
}

export const rateLimiter = new RateLimiter();

export async function getRateLimitForAction(
  tenantId: string,
  action: RateLimitAction
): Promise<number> {
  return rateLimiter.getEffectiveLimit(tenantId, action);
}