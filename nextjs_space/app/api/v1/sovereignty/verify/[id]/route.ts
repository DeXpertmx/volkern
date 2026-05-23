export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SignatureService } from '@/lib/security/signature-service';

/**
 * Public Verification API (Compatibility with Veri*factu)
 * Permite a cualquier portador del código QR verificar la autenticidad e integridad del documento.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const signatureId = params.id;

    // 1. Localizar la Firma Digital en el registro histórico
    const signature = await prisma.erp_digital_signatures.findUnique({
      where: { id: signatureId },
      include: {
        Tenant: {
          select: {
            vaultSeed: true,
            nombre: true,
            razonSocial: true,
            nifCif: true,
            slug: true
          }
        }
      }
    });

    if (!signature) {
      return NextResponse.json({ 
        verified: false, 
        message: 'Firma no encontrada en el Integrity Graph.' 
      }, { status: 404 });
    }

    // 2. Verificar integridad técnica (Rematrize Hash)
    const isValid = SignatureService.verifyIntegrity(
      signature.documentHash,
      signature.signatureHash,
      signature.Tenant.vaultSeed!
    );

    // 3. Respuesta con metadatos de Soberanía Legal
    return NextResponse.json({
      verified: isValid,
      timestamp: signature.createdAt,
      documentType: signature.documentType,
      issuer: {
        name: signature.Tenant.razonSocial || signature.Tenant.nombre,
        id: signature.Tenant.nifCif
      },
      auditTrail: {
        hash: signature.documentHash,
        seal: signature.signatureHash
      },
      integrityReport: isValid 
        ? 'DOCUMENTO ÍNTEGRO - Sellado por Volkern Nexus Vault' 
        : 'ALERTA: Documento alterado o firma no válida.'
    });

  } catch (error) {
    console.error('[VERIFICATION_API] Error:', error);
    return NextResponse.json({ 
      verified: false, 
      message: 'Error en el proceso de verificación soberana.' 
    }, { status: 500 });
  }
}
