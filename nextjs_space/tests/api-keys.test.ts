import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  AVAILABLE_SCOPES,
  hasScope,
  hasAnyScope,
  extractApiKeyFromRequest,
} from '@/lib/api-keys';

// ─── generateApiKey ───────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('debe devolver key, keyHash y prefix', () => {
    const result = generateApiKey();
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('keyHash');
    expect(result).toHaveProperty('prefix');
  });

  it('key debe empezar con vk_prod_ y tener 72 caracteres', () => {
    const result = generateApiKey('prod');
    expect(result.key).toMatch(/^vk_prod_/);
    expect(result.key.length).toBe(8 + 64); // vk_prod_ (8) + 64 hex
  });

  it('key con type live debe empezar con vk_live_', () => {
    const result = generateApiKey('live');
    expect(result.key).toMatch(/^vk_live_/);
    expect(result.key.length).toBe(8 + 64);
  });

  it('keyHash debe ser SHA-256 hex de 64 caracteres', () => {
    const result = generateApiKey();
    expect(result.keyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('prefix debe incluir los primeros 8 chars hex del key body', () => {
    const result = generateApiKey('prod');
    const keyBody = result.key.slice(8); // remove vk_prod_
    expect(result.prefix).toBe(`vk_prod_${keyBody.substring(0, 8)}`);
  });

  it('cada llamada genera keys diferentes (random)', () => {
    const results = Array.from({ length: 5 }, () => generateApiKey());
    const keys = results.map(r => r.key);
    expect(new Set(keys).size).toBe(5);
  });

  it('cada llamada genera keyHash diferente', () => {
    const results = Array.from({ length: 5 }, () => generateApiKey());
    const hashes = results.map(r => r.keyHash);
    expect(new Set(hashes).size).toBe(5);
  });
});

// ─── hashApiKey ───────────────────────────────────────────────────────────

describe('hashApiKey', () => {
  it('debe generar hash SHA-256 de 64 chars hex', () => {
    const hash = hashApiKey('vk_prod_abc123');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('debe ser determinista: misma key → mismo hash', () => {
    const h1 = hashApiKey('vk_prod_test_key_001');
    const h2 = hashApiKey('vk_prod_test_key_001');
    expect(h1).toBe(h2);
  });

  it('diferentes keys → diferentes hashes', () => {
    const h1 = hashApiKey('vk_prod_aaa');
    const h2 = hashApiKey('vk_prod_bbb');
    expect(h1).not.toBe(h2);
  });

  it('key vacía → hash válido (hash de string vacío)', () => {
    const hash = hashApiKey('');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── isValidApiKeyFormat ──────────────────────────────────────────────────

describe('isValidApiKeyFormat', () => {
  it('formato vk_prod_ + 64 hex → true', () => {
    expect(isValidApiKeyFormat('vk_prod_' + 'a'.repeat(64))).toBe(true);
  });

  it('formato vk_live_ + 64 hex → true', () => {
    expect(isValidApiKeyFormat('vk_live_' + 'f'.repeat(64))).toBe(true);
  });

  it('key muy corta → false', () => {
    expect(isValidApiKeyFormat('vk_prod_short')).toBe(false);
  });

  it('prefijo inválido vk_test_ → false', () => {
    expect(isValidApiKeyFormat('vk_test_' + 'a'.repeat(64))).toBe(false);
  });

  it('caracteres no hex → false', () => {
    expect(isValidApiKeyFormat('vk_prod_' + 'z'.repeat(64))).toBe(false); // z no es hex
  });

  it('string vacío → false', () => {
    expect(isValidApiKeyFormat('')).toBe(false);
  });

  it('case-insensitive: VK_PROD_ → true', () => {
    expect(isValidApiKeyFormat('VK_PROD_' + 'a'.repeat(64))).toBe(true);
  });
});

// ─── AVAILABLE_SCOPES ─────────────────────────────────────────────────────

describe('AVAILABLE_SCOPES', () => {
  it('debe ser un array', () => {
    expect(Array.isArray(AVAILABLE_SCOPES)).toBe(true);
  });

  it('debe tener al menos 30 scopes', () => {
    expect(AVAILABLE_SCOPES.length).toBeGreaterThanOrEqual(30);
  });

  it('todos los scopes deben ser strings con formato recurso:accion (pueden incluir números en recurso)', () => {
    for (const scope of AVAILABLE_SCOPES) {
      expect(typeof scope).toBe('string');
      expect(scope).toMatch(/^[a-z0-9]+:[a-z]+$/);
    }
  });

  it('scopes únicos', () => {
    expect(new Set(AVAILABLE_SCOPES).size).toBe(AVAILABLE_SCOPES.length);
  });

  it('debe incluir scopes clave', () => {
    expect(AVAILABLE_SCOPES).toContain('leads:read');
    expect(AVAILABLE_SCOPES).toContain('leads:write');
    expect(AVAILABLE_SCOPES).toContain('deals:read');
    expect(AVAILABLE_SCOPES).toContain('messages:read');
    expect(AVAILABLE_SCOPES).toContain('analytics:read');
    expect(AVAILABLE_SCOPES).toContain('mcp:execute');
  });
});

// ─── hasScope ─────────────────────────────────────────────────────────────

describe('hasScope', () => {
  it('scope presente → true', () => {
    expect(hasScope(['leads:read', 'deals:write'], 'leads:read')).toBe(true);
  });

  it('scope no presente → false', () => {
    expect(hasScope(['leads:read', 'deals:write'], 'contacts:read')).toBe(false);
  });

  it('array vacío → false', () => {
    expect(hasScope([], 'leads:read')).toBe(false);
  });
});

// ─── hasAnyScope ──────────────────────────────────────────────────────────

describe('hasAnyScope', () => {
  it('al menos uno coincide → true', () => {
    expect(hasAnyScope(['leads:read', 'deals:write'], ['deals:write', 'admin:all'])).toBe(true);
  });

  it('ninguno coincide → false', () => {
    expect(hasAnyScope(['leads:read'], ['admin:all', 'super:access'])).toBe(false);
  });

  it('array requerido vacío → false', () => {
    expect(hasAnyScope(['leads:read'], [])).toBe(false);
  });

  it('ambos vacíos → false', () => {
    expect(hasAnyScope([], [])).toBe(false);
  });
});

// ─── extractApiKeyFromRequest ─────────────────────────────────────────────

describe('extractApiKeyFromRequest', () => {
  it('X-API-Key header → extrae key', () => {
    const req = new Request('https://example.com/api', {
      headers: { 'X-API-Key': 'vk_prod_' + 'a'.repeat(64) },
    });
    expect(extractApiKeyFromRequest(req)).toBe('vk_prod_' + 'a'.repeat(64));
  });

  it('Authorization Bearer → extrae key', () => {
    const req = new Request('https://example.com/api', {
      headers: { 'Authorization': 'Bearer vk_live_' + 'b'.repeat(64) },
    });
    expect(extractApiKeyFromRequest(req)).toBe('vk_live_' + 'b'.repeat(64));
  });

  it('X-API-Key tiene prioridad sobre Authorization', () => {
    const req = new Request('https://example.com/api', {
      headers: {
        'X-API-Key': 'vk_prod_1111',
        'Authorization': 'Bearer vk_prod_2222',
      },
    });
    expect(extractApiKeyFromRequest(req)).toBe('vk_prod_1111');
  });

  it('sin headers → null', () => {
    const req = new Request('https://example.com/api');
    expect(extractApiKeyFromRequest(req)).toBeNull();
  });

  it('Authorization sin Bearer → null', () => {
    const req = new Request('https://example.com/api', {
      headers: { 'Authorization': 'Basic abc123' },
    });
    expect(extractApiKeyFromRequest(req)).toBeNull();
  });
});
