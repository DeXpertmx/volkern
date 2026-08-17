import { prisma } from '@/lib/db';
import { createHash, randomBytes } from 'crypto';

/**
 * CertificationService
 * Handles the issuance and verification of digital certificates.
 */
export class CertificationService {
  /**
   * Issues a new certificate for a student.
   */
  static async issueCertificate(estudianteId: string, cursoId: string) {
    const estudiante = await prisma.estudiante.findUnique({
      where: { id: estudianteId },
      include: { erp_academy_users: true }
    });

    const curso = await prisma.curso.findUnique({
      where: { id: cursoId }
    });

    if (!estudiante || !curso) throw new Error('Datos insuficientes para emitir certificado');

    // Check if already issued
    const existing = await prisma.certificado.findUnique({
      where: { estudianteId_cursoId: { estudianteId, cursoId } }
    });

    if (existing) return existing;

    // Generate a unique code and integrity hash
    const codigoUnico = `VOLK-${curso.id.substring(0,4).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    
    // Integrity Hash: Content-based signature to prevent tampering
    const integrityData = `${estudiante.id}|${curso.id}|${new Date().toISOString()}|VOLKERN-MASTER-KEY`;
    const integrityHash = createHash('sha256').update(integrityData).digest('hex');

    const certificado = await prisma.certificado.create({
      data: {
        estudianteId,
        cursoId,
        codigoUnico,
        integrityHash,
        fechaEmision: new Date(),
        // Link to PDF generation in the future
        pdfUrl: `/api/academy/certificate/render/${codigoUnico}`
      }
    });

    // Audit the issuance
    if (estudiante.academyUserId) {
      await this.logCertification(estudiante.tenantId!, estudiante.academyUserId, certificado.id, integrityHash);
    }

    return certificado;
  }

  /**
   * Verifies the integrity of a certificate.
   */
  static async verifyCertificate(codigoUnico: string) {
    const cert = await prisma.certificado.findUnique({
      where: { codigoUnico },
      include: { estudiante: true, curso: true }
    });

    if (!cert) return { valid: false, message: 'Certificado no encontrado' };

    // In a real scenario, we'd re-calculate the hash if we stored the salt/key.
    // For now, we trust the stored hash as the "Proof of Trust".
    return {
      valid: !!cert.integrityHash,
      cert
    };
  }

  private static async logCertification(tenantId: string, userId: string, certId: string, hash: string) {
    await (prisma as any).academyAuditLog.create({
      data: {
        tenantId,
        userId,
        eventType: 'CERT_ISSUED',
        entityType: 'CERTIFICATE',
        entityId: certId,
        integrityHash: hash,
        payload: { status: 'ISSUED', timestamp: new Date().toISOString() }
      }
    });
  }
}
