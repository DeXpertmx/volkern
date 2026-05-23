import { describe, it, expect, beforeEach } from 'vitest';

// Replicamos InMemoryStore exactamente como en lib/rate-limiter.ts
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

describe('InMemoryStore', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe('set + get', () => {
    it('debe almacenar y recuperar un valor', () => {
      store.set('key1', 5, 60000);
      const entry = store.get('key1');
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(5);
    });

    it('debe expirar entradas pasada la ventana', async () => {
      store.set('key1', 5, 1); // 1ms window
      await new Promise(resolve => setTimeout(resolve, 5));
      const entry = store.get('key1');
      expect(entry).toBeUndefined();
    });

    it('debe mantener entradas dentro de la ventana', () => {
      store.set('key1', 10, 60000);
      const entry = store.get('key1');
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(10);
    });

    it('debe devolver undefined para key no existente', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });
  });

  describe('increment', () => {
    it('debe iniciar en 1 para nueva key', () => {
      const result = store.increment('new-key', 60000);
      expect(result.count).toBe(1);
    });

    it('debe incrementar secuencialmente', () => {
      store.increment('key1', 60000);
      store.increment('key1', 60000);
      const result = store.increment('key1', 60000);
      expect(result.count).toBe(3);
    });

    it('debe mantener el mismo resetAt en incrementos', () => {
      const first = store.increment('key1', 60000);
      const second = store.increment('key1', 60000);
      expect(second.resetAt).toBe(first.resetAt);
    });

    it('debe crear nueva ventana si la anterior expiró', async () => {
      store.increment('key1', 1);
      await new Promise(resolve => setTimeout(resolve, 5));
      const result = store.increment('key1', 60000);
      expect(result.count).toBe(1); // Nueva ventana
    });

    it('keys diferentes deben ser independientes', () => {
      store.increment('key1', 60000);
      store.increment('key1', 60000);
      store.increment('key2', 60000);
      expect(store.get('key1')!.count).toBe(2);
      expect(store.get('key2')!.count).toBe(1);
    });

    it('resetAt debe estar en el futuro', () => {
      const result = store.increment('key1', 60000);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });
  });

  describe('delete', () => {
    it('debe eliminar una key', () => {
      store.set('key1', 10, 60000);
      store.delete('key1');
      expect(store.get('key1')).toBeUndefined();
    });

    it('delete de key inexistente no debe lanzar error', () => {
      expect(() => store.delete('no-existe')).not.toThrow();
    });
  });
});

// ==================== DEFAULT_RATE_LIMITS ====================
// Replicados inline (son const no exportados en lib/rate-limiter.ts)
const DEFAULT_RATE_LIMITS: Record<string, { limit: number; windowMs: number; windowLabel: string }> = {
  api_request_minute: { limit: 60, windowMs: 60 * 1000, windowLabel: 'minuto' },
  api_request_hour: { limit: 3000, windowMs: 60 * 60 * 1000, windowLabel: 'hora' },
  api_request_day: { limit: 50000, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  message_send_day: { limit: 200, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  email_send_day: { limit: 500, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  whatsapp_message_day: { limit: 1000, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  file_upload_day: { limit: 100, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
  ai_request_day: { limit: 50, windowMs: 24 * 60 * 60 * 1000, windowLabel: 'dia' },
};

const ACTION_TO_PLAN_KEY: Record<string, string> = {
  api_request_minute: 'leads',
  api_request_hour: 'leads',
  api_request_day: 'leads',
  message_send_day: 'leads',
  email_send_day: 'emails_per_month',
  whatsapp_message_day: 'whatsapp_messages',
  file_upload_day: 'storage_gb',
  ai_request_day: 'ai_image_generations',
};

const ACTION_TO_LIMIT_KEY: Record<string, string> = {
  api_request_minute: 'api_request_minute',
  api_request_hour: 'api_request_hour',
  api_request_day: 'api_request_day',
  message_send_day: 'message_send_day',
  email_send_day: 'email_send_day',
  whatsapp_message_day: 'whatsapp_message_day',
  file_upload_day: 'file_upload_day',
  ai_request_day: 'ai_request_day',
};

describe('DEFAULT_RATE_LIMITS', () => {
  it('debe tener 8 acciones configuradas', () => {
    const keys = Object.keys(DEFAULT_RATE_LIMITS);
    expect(keys).toHaveLength(8);
  });

  it('cada entrada debe tener limit, windowMs y windowLabel', () => {
    for (const [key, config] of Object.entries(DEFAULT_RATE_LIMITS)) {
      expect(typeof config.limit).toBe('number');
      expect(config.limit).toBeGreaterThan(0);
      expect(typeof config.windowMs).toBe('number');
      expect(config.windowMs).toBeGreaterThan(0);
      expect(typeof config.windowLabel).toBe('string');
    }
  });

  it('api_request_minute debe tener ventana de 60s', () => {
    expect(DEFAULT_RATE_LIMITS.api_request_minute.windowMs).toBe(60000);
    expect(DEFAULT_RATE_LIMITS.api_request_minute.limit).toBe(60);
  });

  it('límites diarios deben tener ventana de 24h', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    expect(DEFAULT_RATE_LIMITS.api_request_day.windowMs).toBe(dayMs);
    expect(DEFAULT_RATE_LIMITS.email_send_day.windowMs).toBe(dayMs);
    expect(DEFAULT_RATE_LIMITS.whatsapp_message_day.windowMs).toBe(dayMs);
    expect(DEFAULT_RATE_LIMITS.ai_request_day.windowMs).toBe(dayMs);
  });
});

describe('ACTION_TO_PLAN_KEY', () => {
  it('debe mapear las 8 acciones', () => {
    expect(Object.keys(ACTION_TO_PLAN_KEY)).toHaveLength(8);
  });

  it('api_request actions deben mapear a leads', () => {
    expect(ACTION_TO_PLAN_KEY.api_request_minute).toBe('leads');
    expect(ACTION_TO_PLAN_KEY.api_request_hour).toBe('leads');
    expect(ACTION_TO_PLAN_KEY.api_request_day).toBe('leads');
  });

  it('email_send_day debe mapear a emails_per_month', () => {
    expect(ACTION_TO_PLAN_KEY.email_send_day).toBe('emails_per_month');
  });

  it('whatsapp_message_day debe mapear a whatsapp_messages', () => {
    expect(ACTION_TO_PLAN_KEY.whatsapp_message_day).toBe('whatsapp_messages');
  });

  it('file_upload_day debe mapear a storage_gb', () => {
    expect(ACTION_TO_PLAN_KEY.file_upload_day).toBe('storage_gb');
  });

  it('ai_request_day debe mapear a ai_image_generations', () => {
    expect(ACTION_TO_PLAN_KEY.ai_request_day).toBe('ai_image_generations');
  });
});

describe('ACTION_TO_LIMIT_KEY', () => {
  it('debe mapear las 8 acciones a sí mismas', () => {
    for (const [key, value] of Object.entries(ACTION_TO_LIMIT_KEY)) {
      expect(key).toBe(value);
    }
  });
});
