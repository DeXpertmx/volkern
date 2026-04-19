import crypto from 'crypto';

export interface FingerprintPayload {
  tenantId: string;
  emisorNif: string;
  receptorNif: string;
  numero: string;
  fechaEmision: string; // ISO string format recomended
  monto: number;
  moneda: string;
  parentFingerprint: string;
}

/**
 * Genera un hash SHA-256 determinista para una factura basándose en la normativa Veri*factu.
 * La concatenación sigue un orden alfabético estricto de las llaves del objeto para asegurar la reproducibilidad.
 */
export function generateInvoiceFingerprint(payload: FingerprintPayload): string {
  // 1. Normalización: Ordenamos las llaves alfabéticamente para que el sello sea determinista
  // y no dependa del orden de inserción en el objeto.
  const sortedKeys = Object.keys(payload).sort() as Array<keyof FingerprintPayload>;
  
  const dataToHash = sortedKeys.map(key => {
    const value = payload[key];
    if (typeof value === 'number') return value.toFixed(2);
    return String(value);
  }).join('|');

  console.log(`[Crypto] Deterministic Payload (Alphabetical): ${dataToHash}`);

  // 2. Generación del Hash SHA-256
  return crypto
    .createHash('sha256')
    .update(dataToHash)
    .digest('hex')
    .toUpperCase();
}

/**
 * Alias para compatibilidad con scripts de auditoría
 */
export const generateInvoiceHash = generateInvoiceFingerprint;

/**
 * Hash de inicio de cadena (Genesis)
 */
export const GENESIS_FINGERPRINT = "GENESIS_VERIFACTU_2026";
