import crypto from 'crypto';

export interface IntegrityData {
  sku: string | null;
  nombre: string;
  precioBase: number;
  costOfAcquisition: number;
  tenantId: string;
}

export class ItemIntegrityService {
  /**
   * Genera un hash SHA-256 para proteger los datos críticos de un ítem
   */
  static calculateHash(data: IntegrityData): string {
    const payload = `${data.tenantId}|${data.sku || ''}|${data.nombre}|${data.precioBase}|${data.costOfAcquisition}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verifica si el hash proporcionado coincide con los datos actuales
   */
  static verifyHash(data: IntegrityData, storedHash: string): boolean {
    if (!storedHash) return false;
    const currentHash = this.calculateHash(data);
    return currentHash === storedHash;
  }
}
