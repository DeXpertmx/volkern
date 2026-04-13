import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes para GCM
const AUTH_TAG_LENGTH = 16;
const MASTER_SECRET = process.env.VAULT_MASTER_SECRET || '01234567890123456789012345678901'; // Debe ser de 32 bytes

export class VaultService {
  /**
   * Cifrar un dato sensible
   */
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(MASTER_SECRET), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Retornamos iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Descifrar un dato sensible
   */
  static decrypt(encryptedData: string): string {
    try {
      const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
      
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(MASTER_SECRET), iv);
      
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[VaultService] Error al descifrar:', error);
      return '[[CIFRADO - SIN ACCESO]]';
    }
  }

  /**
   * Helper para cifrar objetos JSON
   */
  static encryptJson(obj: any): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /**
   * Helper para descifrar objetos JSON
   */
  static decryptJson(encryptedData: string): any {
    const text = this.decrypt(encryptedData);
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
