import { prisma } from '@/lib/db'
import { createHash } from 'crypto'

/**
 * Servicio de Sellado Digital para Contratos (Protección Veri*factu style)
 */
export class ContractSealer {
  
  /**
   * Genera un sello digital inmutable para un contrato
   */
  static async sealContract(contractId: string, userId: string) {
    const contract = await prisma.contrato.findUnique({
      where: { id: contractId },
      include: { items: true }
    })

    if (!contract) throw new Error('CONTRATO_NO_ENCONTRADO')
    if (contract.sealedAt) throw new Error('CONTRATO_YA_SELLADO')

    // 1. Snapshot del Contrato
    const snapshot = {
      numero: contract.numero,
      titulo: contract.titulo,
      total: contract.total,
      moneda: contract.moneda,
      items: contract.items.map(i => ({
        sku: i.sku,
        cantidad: i.cantidad,
        precio: i.precioUnitario,
        total: i.total
      })),
      timestamp: new Date().toISOString(),
      sealedBy: userId
    }

    // 2. Encadenamiento (Chaining)
    const lastContract = await prisma.contrato.findFirst({
      where: { tenantId: contract.tenantId, sealedAt: { not: null } },
      orderBy: { sealedAt: 'desc' },
      select: { auditHash: true }
    })

    const chainedHash = lastContract?.auditHash || '0'.repeat(64)
    const hash = createHash('sha256')
      .update(chainedHash + JSON.stringify(snapshot))
      .digest('hex')

    // 3. Persistencia en Trust Protocol
    const result = await prisma.$transaction([
      prisma.contrato.update({
        where: { id: contractId },
        data: {
          auditHash: hash,
          chainedHash: chainedHash,
          sealedAt: new Date(),
          signatureAudit: {
            method: 'SHA256_CHAINING',
            version: '1.0',
            snapshot
          }
        }
      }),
      (prisma.auditLog.create as any)({
        data: {
          tenantId: contract.tenantId,
          userId: userId,
          action: 'CONTRACT_HARDENED_SEAL',
          entityId: contract.id,
          entityType: 'Contrato',
          details: `Sello digital inmutable generado para contrato ${contract.numero}.`,
          metadata: { hash, chainedHash }
        }
      })
    ])

    return result[0]
  }

  /**
   * Verifica la integridad de la cadena de contratos
   */
  static async verifyChain(tenantId: string) {
    const contracts = await prisma.contrato.findMany({
      where: { tenantId, sealedAt: { not: null } },
      orderBy: { sealedAt: 'asc' }
    })

    let previousHash = '0'.repeat(64)
    const results = []

    for (const contract of contracts) {
      const isChainValid = contract.chainedHash === previousHash
      results.push({
        id: contract.id,
        numero: contract.numero,
        isValid: isChainValid
      })
      previousHash = contract.auditHash || ''
    }

    return results
  }
}
