import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Tests de Seguridad Criptográfica — VaultService
 * Valida el aislamiento criptográfico entre tenants y la integridad del cifrado AES-256-GCM.
 * 
 * NOTA: Estos tests requieren MASTER_KEY y TENANT_PEPPER en el entorno.
 * Si no están configurados, el import de VaultService lanzará error (comportamiento esperado).
 */

// Configurar variables de entorno para tests
beforeAll(() => {
  if (!process.env.MASTER_KEY) {
    process.env.MASTER_KEY = 'test-master-key-minimum-32-chars!!';
  }
  if (!process.env.TENANT_PEPPER) {
    process.env.TENANT_PEPPER = 'test-pepper-value-for-unit-tests';
  }
});

// Import dinámico después de configurar env vars
async function getVaultService() {
  const { VaultService } = await import('@/lib/security/vault');
  return VaultService;
}

describe('VaultService — Cifrado y Descifrado', () => {
  const TENANT_A = 'tenant-alpha-001';
  const TENANT_B = 'tenant-beta-002';
  const SEED_A = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
  const SEED_B = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5';

  it('debe cifrar y descifrar texto correctamente', async () => {
    const VaultService = await getVaultService();
    const original = 'salario-confidencial-12345';
    
    const encrypted = VaultService.encrypt(original, TENANT_A, SEED_A);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // formato iv:authTag:encrypted
    
    const decrypted = VaultService.decrypt(encrypted, TENANT_A, SEED_A);
    expect(decrypted).toBe(original);
  });

  it('debe producir diferentes cifrados para el mismo texto (IV aleatorio)', async () => {
    const VaultService = await getVaultService();
    const text = 'mismo-texto';
    
    const enc1 = VaultService.encrypt(text, TENANT_A, SEED_A);
    const enc2 = VaultService.encrypt(text, TENANT_A, SEED_A);
    
    expect(enc1).not.toBe(enc2); // Diferentes IVs
    // Pero ambos deben descifrar al mismo texto
    expect(VaultService.decrypt(enc1, TENANT_A, SEED_A)).toBe(text);
    expect(VaultService.decrypt(enc2, TENANT_A, SEED_A)).toBe(text);
  });

  it('NO debe descifrar datos de Tenant A con credenciales de Tenant B', async () => {
    const VaultService = await getVaultService();
    const secret = 'secreto-de-tenant-a';
    
    const encryptedByA = VaultService.encrypt(secret, TENANT_A, SEED_A);
    const decryptedByB = VaultService.decrypt(encryptedByA, TENANT_B, SEED_B);
    
    // Debe devolver el marcador de error, no el secreto
    expect(decryptedByB).not.toBe(secret);
    expect(decryptedByB).toContain('CIFRADO');
  });

  it('debe aislar tenants: seed diferente = clave diferente', async () => {
    const VaultService = await getVaultService();
    const secret = 'dato-sensible';
    
    // Mismo tenant, diferente seed → debe fallar
    const encrypted = VaultService.encrypt(secret, TENANT_A, SEED_A);
    const decrypted = VaultService.decrypt(encrypted, TENANT_A, SEED_B);
    
    expect(decrypted).not.toBe(secret);
    expect(decrypted).toContain('CIFRADO');
  });

  it('debe manejar datos no cifrados sin romperse', async () => {
    const VaultService = await getVaultService();
    const plainText = 'texto sin cifrar';
    
    const result = VaultService.decrypt(plainText, TENANT_A, SEED_A);
    expect(result).toBe(plainText);
  });

  it('debe manejar string vacío', async () => {
    const VaultService = await getVaultService();
    const result = VaultService.decrypt('', TENANT_A, SEED_A);
    expect(result).toBe('');
  });
});

describe('VaultService — JSON', () => {
  const TENANT = 'tenant-json-test';
  const SEED = 'jsonseed12345678901234567890123456789012345678901234567890';

  it('debe cifrar y descifrar objetos JSON', async () => {
    const VaultService = await getVaultService();
    const obj = { nombre: 'Juan', salario: 50000, banco: 'ES1234567890' };
    
    const encrypted = VaultService.encryptJson(obj, TENANT, SEED);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).toContain(':');
    
    const decrypted = VaultService.decryptJson(encrypted, TENANT, SEED);
    expect(decrypted).toEqual(obj);
  });

  it('debe devolver null para JSON inválido', async () => {
    const VaultService = await getVaultService();
    const result = VaultService.decryptJson('datos-no-json', TENANT, SEED);
    expect(result).toBeNull();
  });
});

describe('VaultService — Configuración requerida', () => {
  it('debe tener MASTER_KEY de al menos 32 caracteres', () => {
    const key = process.env.MASTER_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThanOrEqual(32);
  });

  it('debe tener TENANT_PEPPER configurado', () => {
    const pepper = process.env.TENANT_PEPPER;
    expect(pepper).toBeDefined();
    expect(pepper!.length).toBeGreaterThan(0);
  });
});
