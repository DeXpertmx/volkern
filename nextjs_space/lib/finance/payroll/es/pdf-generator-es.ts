import { Decimal } from 'decimal.js'
import { PayrollSealer } from './payroll-sealer'
import { prisma } from '@/lib/db'

export class PDFGeneratorES {
  /**
   * Genera el contenido estructurado para el PDF basado estrictamente en el snapshot sellado
   */
  static generatePayrollPDFData(snapshot: any) {
    if (!snapshot) throw new Error('SNAPSHOT_MISSING')

    return {
      metadata: {
        engineVersion: 'Volkern Payroll ES v2.1 (Hardened)',
        calculationDate: snapshot.timestamp,
        auditHash: snapshot.auditHash,
        status: 'SEALED',
        trustProtocolVerified: true
      },
      header: {
        employeeName: snapshot.employee,
        period: snapshot.period,
        tenantName: snapshot.tenantName || 'Empresa Cliente'
      },
      devengos: snapshot.lines.filter((l: any) => parseFloat(l.amount) > 0),
      deducciones: snapshot.lines.filter((l: any) => parseFloat(l.amount) < 0),
      totales: {
        bruto: snapshot.totals.gross,
        neto: snapshot.totals.net,
        ssWorker: snapshot.totals.ssWorker,
        irpf: snapshot.totals.irpf
      },
      operatorNote: snapshot.operatorNote || null
    }
  }

  /**
   * Mock del renderizado final del PDF oficial
   */
  static async renderOfficialPDF(recordId: string) {
    // 0. Verificar Integridad
    const integrity = await PayrollSealer.verifyIntegrity(recordId)
    if (integrity !== 'VALID') throw new Error(`BLOQUEO_SEGURIDAD: No se puede generar PDF de una nómina comprometida (${integrity})`)

    const record = await prisma.payrollRecordES.findUnique({ where: { id: recordId } })
    const snapshot = record?.calculationSnapshot

    console.log(`📄 Generando PDF Oficial para Nómina ${recordId} basado estrictamente en snapshot...`)
    return { success: true, url: `/api/payroll/download/${recordId}`, data: this.generatePayrollPDFData(snapshot) }
  }
}
