import { PDFService, PDFContext } from '../erp/pdf-service';
import { prisma } from '../db';
import { SignatureService } from '../security/signature-service';

/**
 * Skill: Orchestrate Digital Signature (CEO Seal)
 * Automatiza el flujo de generación, sellado y auditoría de documentos legales.
 */
export async function orchestrate_digital_signature(params: {
  tenantId: string,
  entityType: 'VACATION' | 'ASSET_DELIVERY',
  entityId: string,
  signerId: string
}) {
  try {
    // 1. Recopilar datos según el tipo de entidad
    let context: PDFContext;

    if (params.entityType === 'VACATION') {
      const vacation = await prisma.vacationRequest.findUnique({
        where: { id: params.entityId },
        include: { employee: true }
      });

      if (!vacation) throw new Error('Solicitud de vacaciones no encontrada');

      context = {
        tenantId: params.tenantId,
        documentType: 'APROBACION_VACACIONES',
        title: `APROBACIÓN DE VACACIONES - ${vacation.employee.fullName.toUpperCase()}`,
        content: [
          `Por la presente se confirma la aprobación de la solicitud de vacaciones de ${vacation.employee.fullName}.`,
          `Periodo: del ${vacation.startDate.toLocaleDateString()} al ${vacation.endDate.toLocaleDateString()}.`,
          `Estado de la Firma: Sellado Digitalmente por Volkern Nexus.`
        ],
        signerName: 'Sello Automático del CEO',
        signerId: params.signerId,
        metadata: { vacationId: params.entityId }
      };
    } else {
      throw new Error('Tipo de entidad no soportado para firma digital inmediata');
    }

    // 2. Generar el PDF Firmado
    const result = await PDFService.generateSignedActa(context);

    // 3. Registrar en el Trust Protocol (Integrity Graph)
    await prisma.trustProtocolLog.create({
      data: {
        tenantId: params.tenantId,
        level: 'INFO',
        category: 'HR',
        message: `Documento firmado y sellado: ${context.title}`,
        metadata: JSON.stringify({
          signatureId: result.signatureId,
          documentHash: result.documentHash,
          entityId: params.entityId
        })
      }
    });

    return {
      success: true,
      signatureId: result.signatureId,
      message: `Documento de ${params.entityType} sellado correctamente en el Integrity Graph.`
    };

  } catch (error: any) {
    console.error('[HR_SIGNING_SKILL] Error:', error);
    return { success: false, error: error.message };
  }
}
