import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM

const MASTER_KEY = process.env.MASTER_KEY;
const TENANT_PEPPER = process.env.TENANT_PEPPER;

function assertVaultReady(): void {
  if (!MASTER_KEY) {
    throw new Error(
      '[Vault] FATAL: MASTER_KEY no configurada. Sin ella, todos los tenants comparten cifrado débil. ' +
      'Configura la variable de entorno MASTER_KEY con una clave de al menos 32 bytes.'
    );
  }
  if (!TENANT_PEPPER) {
    throw new Error(
      '[Vault] FATAL: TENANT_PEPPER no configurada. Sin ella, el aislamiento criptográfico entre tenants se debilita. ' +
      'Configura la variable de entorno TENANT_PEPPER con un valor aleatorio único.'
    );
  }
  if (MASTER_KEY.length < 32) {
    throw new Error(
      '[Vault] FATAL: MASTER_KEY debe tener al menos 32 caracteres para AES-256. Longitud actual: ' +
      MASTER_KEY.length
    );
  }
}

export class VaultService {
  /**
   * Deriva una clave única por tenant usando HKDF
   * Implementación "Paranoica" con TENANT_PEPPER y separación de dominio.
   */
  private static deriveKey(tenantId: string, vaultSeed: string): Buffer {
    if (!vaultSeed) {
      throw new Error(`[Vault] Missing vaultSeed for tenant ${tenantId}`);
    }

    // HKDF: Extract-and-Expand
    // Salt: Combinación de vaultSeed y TENANT_PEPPER
    // Info: tenantId + domain separation
    return Buffer.from(crypto.hkdfSync(
      'sha256',
      MASTER_KEY!,
      Buffer.from(vaultSeed + TENANT_PEPPER), // Salt combinado
      Buffer.from(`${tenantId}:finance-vault-v2`), // Info (Domain Separation)
      32
    ));
  }

  /**
   * Cifrar un dato sensible para un tenant específico
   */
  static encrypt(text: string, tenantId: string, vaultSeed: string): string {
    assertVaultReady();
    const key = this.deriveKey(tenantId, vaultSeed);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Descifrar un dato sensible de un tenant específico
   */
  static decrypt(encryptedData: string, tenantId: string, vaultSeed: string): string {
    assertVaultReady();
    try {
      if (!encryptedData || !encryptedData.includes(':')) return encryptedData;
      
      const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
      if (!ivHex || !authTagHex || !encryptedText) return encryptedData;
      
      const key = this.deriveKey(tenantId, vaultSeed);
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error(`[VaultService] Error al descifrar para tenant ${tenantId}:`, error);
      return '[[CIFRADO - SIN ACCESO]]';
    }
  }

  /**
   * Helpers para JSON
   */
  static encryptJson(obj: any, tenantId: string, vaultSeed: string): string {
    return this.encrypt(JSON.stringify(obj), tenantId, vaultSeed);
  }

  static decryptJson(encryptedData: string, tenantId: string, vaultSeed: string): any {
    const text = this.decrypt(encryptedData, tenantId, vaultSeed);
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
