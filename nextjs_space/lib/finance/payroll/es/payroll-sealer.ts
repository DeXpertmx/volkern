import { prisma } from '@/lib/db'
import { createHash } from 'crypto'
import { Decimal } from 'decimal.js'

export class PayrollSealer {
  /**
   * Ejecuta el flujo de sellado: Draft -> Locked -> Sealed
   */
  static async sealPayroll(recordId: string, userId: string, operatorNote?: string) {
    const record = await prisma.payrollRecordES.findUnique({
      where: { id: recordId },
      include: { lines: true, employee: true }
    })

    if (!record) throw new Error('REGISTRO_NO_ENCONTRADO')
    if (record.status === 'SEALED') throw new Error('NOMINA_YA_SELLADA')

    // 1. Generar Snapshot del Cálculo
    const snapshot = {
      employee: record.employee.fullName,
      period: record.period,
      totals: {
        gross: record.grossTotal.toString(),
        net: record.netTotal.toString(),
        ssWorker: record.socialSecurityWorker.toString(),
        irpf: record.irpfTotal.toString()
      },
      lines: record.lines.map(l => ({
        code: l.conceptCode,
        amount: l.amount.toString(),
        isOverride: l.isOverride
      })),
      timestamp: new Date().toISOString(),
      sealedBy: userId,
      operatorNote: operatorNote || record.operatorNote
    }

    // 2. Generar Hash Inmutable (SHA-256)
    const hash = createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex')

    // 3. Persistir Sellado en Trust Protocol
    const sealedRecord = await prisma.$transaction([
      prisma.payrollRecordES.update({
        where: { id: recordId },
        data: {
          status: 'SEALED',
          auditHash: hash,
          calculationSnapshot: snapshot as any,
          operatorNote: operatorNote
        }
      }),
      prisma.auditLog.create({
        data: {
          tenantId: record.tenantId,
          userId: userId,
          accion: 'SELLADO_NOMINA_ES',
          entidad: 'PayrollRecordES',
          entidadId: record.id,
          descripcion: `Sello digital generado para nómina ${record.period}. Hash: ${hash.substring(0, 8)}...`,
          cambiosDespues: { hash, status: 'SEALED' }
        }
      })
    ])

    return sealedRecord[0]
  }

  /**
   * Verifica la integridad de una nómina recalculando su hash
   * Devuelve un estado explícito de auditoría
   */
  static async verifyIntegrity(recordId: string): Promise<'VALID' | 'TAMPERED' | 'SNAPSHOT_MISSING' | 'HASH_MISMATCH' | 'RECORD_NOT_FOUND'> {
    const record = await prisma.payrollRecordES.findUnique({
      where: { id: recordId }
    })

    if (!record) return 'RECORD_NOT_FOUND'
    if (!record.auditHash) return 'VALID' // Si no está sellada aún

    if (!record.calculationSnapshot) {
      return 'SNAPSHOT_MISSING'
    }

    // Re-generar hash desde el snapshot guardado
    const recalculatedHash = createHash('sha256')
      .update(JSON.stringify(record.calculationSnapshot))
      .digest('hex')

    const isHashMatch = recalculatedHash === record.auditHash
    
    // Verificación adicional: ¿Coincide el netTotal del snapshot con el del registro DB?
    const snapshotNet = (record.calculationSnapshot as any).totals?.net
    const recordNet = record.netTotal.toString()
    
    if (isHashMatch && snapshotNet !== recordNet) {
      return 'TAMPERED' // El hash coincide pero el valor vivo en DB es diferente
    }

    if (!isHashMatch) {
      // Alerta Roja en el Strategy Hub
      await prisma.auditLog.create({
        data: {
          tenantId: record.tenantId,
          userId: 'SYSTEM',
          accion: 'VIOLACION_INTEGRIDAD_NOMINA',
          entidad: 'PayrollRecordES',
          entidadId: record.id,
          descripcion: `ALERTA ROJA: Hash Mismatch en nómina ${record.period}. Posible manipulación de datos o snapshot.`,
          cambiosDespues: { auditHash: record.auditHash, recalculatedHash }
        }
      })
      return 'HASH_MISMATCH'
    }

    return 'VALID'
  }
}
