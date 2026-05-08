
import crypto from 'crypto';

/**
 * Genera un hash SHA-256 inmutable para una denuncia.
 * El hash incluye el contenido, la fecha y el tenant para asegurar que no pueda ser alterado
 * sin romper la cadena de integridad.
 */
export function generateComplaintHash(data: {
  description: string;
  tenantId: string;
  createdAt: Date;
}) {
  const payload = JSON.stringify({
    d: data.description,
    t: data.tenantId,
    c: data.createdAt.getTime()
  });
  
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Verifica si una denuncia ha sido alterada comparando su hash actual
 * con un nuevo hash generado a partir de sus campos.
 */
export function verifyComplaintIntegrity(complaint: any) {
  const currentHash = generateComplaintHash({
    description: complaint.description,
    tenantId: complaint.tenantId,
    createdAt: complaint.createdAt
  });
  
  return currentHash === complaint.hash;
}
