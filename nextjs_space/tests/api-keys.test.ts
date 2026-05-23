import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  hasScope,
  hasAnyScope,
  extractApiKeyFromRequest,
  AVAILABLE_SCOPES,
} from '@/lib/api-keys';

describe('API Keys — generateApiKey', () => {
  it('debe generar una key con prefijo vk_prod_ por defecto', () => {
    const { key } = generateApiKey();
    expect(key.startsWith('vk_prod_')).toBe(true);
  });

  it('debe generar una key con prefijo vk_live_ cuando type=live', () => {
    const { key } = generateApiKey('live');
    expect(key.startsWith('vk_live_')).toBe(true);
  });

  it('la key debe tener 64 caracteres hexadecimales después del prefijo', () => {
    const { key } = generateApiKey();
    const body = key.replace('vk_prod_', '');
    expect(body).toMatch(/^[0-9a-f]{64}$/);
  });

  it('debe devolver key, keyHash y prefix', () => {
    const result = generateApiKey();
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('keyHash');
    expect(result).toHaveProperty('prefix');
  });

  it('el keyHash debe ser un string hexadecimal de 64 caracteres', () => {
    const { keyHash } = generateApiKey();
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el prefix debe empezar con vk_prod_ y tener 8 caracteres extra', () => {
    const { prefix } = generateApiKey();
    expect(prefix.startsWith('vk_prod_')).toBe(true);
    expect(prefix.length).toBe('vk_prod_'.length + 8);
  });

  it('debe generar keys diferentes en cada llamada', () => {
    const key1 = generateApiKey().key;
    const key2 = generateApiKey().key;
    expect(key1).not.toBe(key2);
  });

  it('el prefix debe ser un subconjunto de la key', () => {
    const { key, prefix } = generateApiKey();
    expect(key.startsWith(prefix)).toBe(true);
  });
});

describe('API Keys — hashApiKey', () => {
  it('debe generar el mismo hash para la misma key', () => {
    const key = 'vk_prod_abc123def456';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('debe generar hashes diferentes para keys diferentes', () => {
    expect(hashApiKey('vk_prod_aaa'))
      .not.toBe(hashApiKey('vk_prod_bbb'));
  });

  it('el hash debe ser hexadecimal de 64 caracteres', () => {
    expect(hashApiKey('test')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el hash de una key generada debe coincidir con keyHash', () => {
    const { key, keyHash } = generateApiKey();
    expect(hashApiKey(key)).toBe(keyHash);
  });
});

describe('API Keys — isValidApiKeyFormat', () => {
  it('debe validar una key prod generada', () => {
    const { key } = generateApiKey();
    expect(isValidApiKeyFormat(key)).toBe(true);
  });

  it('debe validar una key live generada', () => {
    const { key } = generateApiKey('live');
    expect(isValidApiKeyFormat(key)).toBe(true);
  });

  it('debe rechazar una key sin prefijo', () => {
    expect(isValidApiKeyFormat('abc123')).toBe(false);
  });

  it('debe rechazar una key con prefijo inválido', () => {
    expect(isValidApiKeyFormat('vk_test_abc123')).toBe(false);
  });

  it('debe rechazar una key con caracteres no hexadecimales', () => {
    expect(isValidApiKeyFormat('vk_prod_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false);
  });

  it('debe rechazar una key demasiado corta', () => {
    expect(isValidApiKeyFormat('vk_prod_abc')).toBe(false);
  });

  it('debe rechazar string vacío', () => {
    expect(isValidApiKeyFormat('')).toBe(false);
  });

  it('debe ser case-insensitive en el prefijo', () => {
    const { key } = generateApiKey();
    const upperKey = key.toUpperCase();
    expect(isValidApiKeyFormat(upperKey)).toBe(true);
  });
});

describe('API Keys — Scopes', () => {
  it('AVAILABLE_SCOPES debe ser un array no vacío', () => {
    expect(Array.isArray(AVAILABLE_SCOPES)).toBe(true);
    expect(AVAILABLE_SCOPES.length).toBeGreaterThan(20);
  });    it('todos los scopes deben tener formato recurso:acción', () => {
      for (const scope of AVAILABLE_SCOPES) {
        expect(scope).toMatch(/^[a-z0-9]+:[a-z]+$/);
      }
    });

  it('hasScope debe retornar true si el scope está presente', () => {
    expect(hasScope(['leads:read', 'leads:write'], 'leads:read')).toBe(true);
  });

  it('hasScope debe retornar false si el scope no está presente', () => {
    expect(hasScope(['leads:read'], 'leads:delete')).toBe(false);
  });

  it('hasScope debe funcionar con array vacío', () => {
    expect(hasScope([], 'leads:read')).toBe(false);
  });

  it('hasAnyScope debe retornar true si al menos un scope coincide', () => {
    expect(hasAnyScope(['leads:read'], ['leads:read', 'contacts:write'])).toBe(true);
  });

  it('hasAnyScope debe retornar false si ningún scope coincide', () => {
    expect(hasAnyScope(['leads:read'], ['contacts:write', 'deals:delete'])).toBe(false);
  });

  it('hasAnyScope debe funcionar con array de scopes vacío', () => {
    expect(hasAnyScope(['leads:read'], [])).toBe(false);
  });
});

describe('API Keys — extractApiKeyFromRequest', () => {
  it('debe extraer del header X-API-Key', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-api-key': 'vk_prod_abc123' },
    });
    expect(extractApiKeyFromRequest(request)).toBe('vk_prod_abc123');
  });

  it('debe extraer del header Authorization: Bearer', () => {
    const request = new Request('https://example.com', {
      headers: { authorization: 'Bearer vk_prod_xyz789' },
    });
    expect(extractApiKeyFromRequest(request)).toBe('vk_prod_xyz789');
  });

  it('debe priorizar X-API-Key sobre Authorization', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-api-key': 'vk_prod_priority',
        authorization: 'Bearer vk_prod_secondary',
      },
    });
    expect(extractApiKeyFromRequest(request)).toBe('vk_prod_priority');
  });

  it('debe retornar null si no hay headers relevantes', () => {
    const request = new Request('https://example.com');
    expect(extractApiKeyFromRequest(request)).toBeNull();
  });

  it('debe retornar null si Authorization no es Bearer', () => {
    const request = new Request('https://example.com', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(extractApiKeyFromRequest(request)).toBeNull();
  });
});
