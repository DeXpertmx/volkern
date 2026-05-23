import { describe, it, expect } from 'vitest';
import {
  MODEL_CONFIGS,
  AI_FALLBACKS,
  DEFAULT_MODEL,
  getModelConfig,
  isModelAvailable,
  getFallbackChain,
  type AIModel,
} from '@/lib/event-engine/ai-engine/types';

const ALL_MODELS: AIModel[] = ['gemma', 'gpt4', 'gpt4o', 'claude', 'gemini'];

// ─── MODEL_CONFIGS ────────────────────────────────────────────────────────

describe('MODEL_CONFIGS', () => {
  it('debe tener 5 modelos', () => {
    expect(Object.keys(MODEL_CONFIGS).length).toBe(5);
  });

  it('cada modelo debe tener provider, model, maxTokens, temperature', () => {
    for (const config of Object.values(MODEL_CONFIGS)) {
      expect(config).toHaveProperty('provider');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('maxTokens');
      expect(config).toHaveProperty('temperature');
      expect(typeof config.provider).toBe('string');
      expect(typeof config.model).toBe('string');
      expect(typeof config.maxTokens).toBe('number');
      expect(typeof config.temperature).toBe('number');
      expect(config.maxTokens).toBeGreaterThan(0);
      expect(config.temperature).toBeGreaterThan(0);
    }
  });

  it('providers válidos: abacus, openai, anthropic, google', () => {
    const validProviders = ['abacus', 'openai', 'anthropic', 'google'];
    for (const config of Object.values(MODEL_CONFIGS)) {
      expect(validProviders).toContain(config.provider);
    }
  });

  it('gemma → provider abacus, maxTokens 4096', () => {
    expect(MODEL_CONFIGS.gemma.provider).toBe('abacus');
    expect(MODEL_CONFIGS.gemma.maxTokens).toBe(4096);
  });

  it('gpt4 → provider openai, maxTokens 8192', () => {
    expect(MODEL_CONFIGS.gpt4.provider).toBe('openai');
    expect(MODEL_CONFIGS.gpt4.maxTokens).toBe(8192);
  });

  it('gpt4o → provider openai, maxTokens 16384 (el más grande)', () => {
    expect(MODEL_CONFIGS.gpt4o.provider).toBe('openai');
    expect(MODEL_CONFIGS.gpt4o.maxTokens).toBe(16384);
    // gpt4o tiene los maxTokens más altos
    const allTokens = Object.values(MODEL_CONFIGS).map(c => c.maxTokens);
    expect(MODEL_CONFIGS.gpt4o.maxTokens).toBe(Math.max(...allTokens));
  });

  it('claude → provider anthropic', () => {
    expect(MODEL_CONFIGS.claude.provider).toBe('anthropic');
  });

  it('gemini → provider google', () => {
    expect(MODEL_CONFIGS.gemini.provider).toBe('google');
  });
});

// ─── AI_FALLBACKS ─────────────────────────────────────────────────────────

describe('AI_FALLBACKS', () => {
  it('debe tener 5 entradas (una por modelo)', () => {
    expect(Object.keys(AI_FALLBACKS).length).toBe(5);
  });

  it('cada modelo debe tener al menos 1 fallback', () => {
    for (const fallbacks of Object.values(AI_FALLBACKS)) {
      expect(fallbacks.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('un modelo NO debe ser su propio fallback', () => {
    for (const [model, fallbacks] of Object.entries(AI_FALLBACKS)) {
      expect(fallbacks).not.toContain(model);
    }
  });

  it('todos los fallbacks deben ser modelos válidos', () => {
    for (const fallbacks of Object.values(AI_FALLBACKS)) {
      for (const fb of fallbacks) {
        expect(ALL_MODELS).toContain(fb);
      }
    }
  });

  it('valores concretos: gemma → [gpt4o, gpt4]', () => {
    expect(AI_FALLBACKS.gemma).toEqual(['gpt4o', 'gpt4']);
  });
});

// ─── DEFAULT_MODEL ────────────────────────────────────────────────────────

describe('DEFAULT_MODEL', () => {
  it('debe ser gemma', () => {
    expect(DEFAULT_MODEL).toBe('gemma');
  });

  it('debe existir en MODEL_CONFIGS', () => {
    expect(MODEL_CONFIGS[DEFAULT_MODEL]).toBeDefined();
  });
});

// ─── getModelConfig ───────────────────────────────────────────────────────

describe('getModelConfig', () => {
  it('gemma → devuelve config de gemma', () => {
    expect(getModelConfig('gemma')).toBe(MODEL_CONFIGS.gemma);
  });

  it('gpt4 → devuelve config de gpt4', () => {
    expect(getModelConfig('gpt4')).toBe(MODEL_CONFIGS.gpt4);
  });

  it('debe devolver la misma referencia que MODEL_CONFIGS[key]', () => {
    for (const model of ALL_MODELS) {
      expect(getModelConfig(model)).toBe(MODEL_CONFIGS[model]);
    }
  });
});

// ─── isModelAvailable ─────────────────────────────────────────────────────

describe('isModelAvailable', () => {
  it('gemma en [gemma, gpt4] → true', () => {
    expect(isModelAvailable('gemma', ['gemma', 'gpt4'])).toBe(true);
  });

  it('gemma en [gpt4, claude] → false', () => {
    expect(isModelAvailable('gemma', ['gpt4', 'claude'])).toBe(false);
  });

  it('lista vacía → siempre false', () => {
    for (const model of ALL_MODELS) {
      expect(isModelAvailable(model, [])).toBe(false);
    }
  });

  it('todos habilitados → todos disponibles', () => {
    for (const model of ALL_MODELS) {
      expect(isModelAvailable(model, ALL_MODELS)).toBe(true);
    }
  });
});

// ─── getFallbackChain ─────────────────────────────────────────────────────

describe('getFallbackChain', () => {
  it('gemma con todos habilitados → [gemma, gpt4o, gpt4]', () => {
    const chain = getFallbackChain('gemma', ALL_MODELS);
    expect(chain).toEqual(['gemma', 'gpt4o', 'gpt4']);
  });

  it('primer elemento siempre es el modelo actual', () => {
    for (const model of ALL_MODELS) {
      const chain = getFallbackChain(model, ALL_MODELS);
      expect(chain[0]).toBe(model);
    }
  });

  it('solo incluye fallbacks habilitados, no todos', () => {
    const chain = getFallbackChain('gemma', ['gemma', 'gpt4'] as AIModel[]);
    expect(chain).toEqual(['gemma', 'gpt4']); // gpt4o no está habilitado
  });

  it('sin fallbacks habilitados → solo el modelo actual', () => {
    const chain = getFallbackChain('gemma', ['gemma'] as AIModel[]);
    expect(chain).toEqual(['gemma']);
  });
});
