import crypto from 'crypto';

/**
 * Servicio de Integridad de Gastos (Veri*factu & VISION-LOCK)
 */
export class ExpenseIntegrityService {
  /**
   * Calcula el fingerprint SHA-256 para el encadenamiento de Veri*factu
   * Fórmula: Hash(ID + Monto + EmpleadoID + parentFingerprint)
   */
  static calculateFingerprint(data: {
    id: string;
    amount: number;
    createdById: string;
    parentFingerprint?: string | null;
  }): string {
    const payload = `${data.id}${data.amount}${data.createdById}${data.parentFingerprint || ''}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Calcula la distancia Haversine entre dos puntos geográficos (en metros)
   */
  static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Valida la proximidad de un gasto (VISION-LOCK)
   * Umbral: 500 metros
   */
  static checkLocationAnomaly(
    exifLat: number | null,
    exifLng: number | null,
    baseLat: number | null,
    baseLng: number | null
  ): { isAnomaly: boolean; distance: number | null } {
    if (exifLat === null || exifLng === null || baseLat === null || baseLng === null) {
      return { isAnomaly: false, distance: null };
    }

    const distance = this.calculateDistance(exifLat, exifLng, baseLat, baseLng);
    
    // Umbral de 500 metros según resolución del arquitecto
    return {
      isAnomaly: distance > 500,
      distance
    };
  }
}
