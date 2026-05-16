import * as crypto from 'crypto';

/**
 * Servicio de Criptografía para protección de datos sensibles (Certificados, Passwords)
 */
export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly KEY = Buffer.from(process.env.FISCAL_ENCRYPTION_KEY || 'default_32_byte_key_for_testing_00', 'utf8');

  /**
   * Encripta un string
   */
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Desencripta un string
   */
  static decrypt(encryptedText: string): string {
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
