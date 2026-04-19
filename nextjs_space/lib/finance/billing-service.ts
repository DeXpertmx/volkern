import { eventBus, EVENTS } from '@/lib/skills/event-bus'
import { prisma } from '@/lib/db'
import { InvoicingService } from '@/lib/invoicing-service'
import { addMonths, addYears, addQuarters } from 'date-fns'

export class BillingService {
  /**
   * Inicializa los listeners del bus de eventos para facturación
   */
  static init() {
    console.log('[BillingService] Inicializando listeners de facturación...')
    
    eventBus.onEvent(EVENTS.RESOURCE_UPDATED, async (payload: any) => {
      if (payload.resourceType === 'contrato' && payload.action === 'contract_signed') {
        try {
          await this.onContractSigned(payload.resourceId, payload.tenantId)
        } catch (error) {
          console.error('[BillingService] Error procesando contrato firmado:', error)
        }
      }
    })
  }

  /**
   * Lógica ejecutada tras el sellado de un contrato
   */
  static async onContractSigned(contractId: string, tenantId: string) {
    const contract = await prisma.contrato.findUnique({
      where: { id: contractId },
      include: {
        items: true,
        contact: {
          include: { perfilFiscal: true }
        }
      }
    })

    if (!contract || !contract.contactId) {
      console.warn(`[BillingService] Contrato ${contractId} no válido para facturación automática.`)
      return
    }

    const { frecuenciaPago, total, moneda, contactId } = contract
    const signatureHash = (contract.templateData as any)?.digitalSeal?.hash

    // 1. Logging Forense del inicio del proceso
    const systemUser = await prisma.user.findFirst({ where: { tenantId } })
    
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: systemUser?.id || 'SYSTEM',
        accion: 'CONTRACT_TO_CASH_START',
        entidad: 'Contrato',
        entidadId: contractId,
        descripcion: `Iniciando flujo financiero para contrato ${contract.numero}. Hash: ${signatureHash}`,
      }
    })

    // 2. Gestionar Suscripción si hay recurrencia
    if (frecuenciaPago && frecuenciaPago !== 'unico') {
      console.log(`[BillingService] Creando suscripción recurrente (${frecuenciaPago}) para contacto ${contactId}`)
      
      const proximaFactura = this.calculateNextBillingDate(new Date(), frecuenciaPago)
      
      await prisma.clientSubscription.create({
        data: {
          tenantId,
          contactId,
          contratoId: contractId,
          planNombre: contract.titulo || `Suscripción - ${contract.numero}`,
          monto: total,
          moneda: moneda || 'EUR',
          frecuencia: frecuenciaPago,
          estado: 'activa',
          proximaFactura,
          signatureHash,
          metadata: {
            contractNumber: contract.numero,
            itemsCount: contract.items.length
          }
        }
      })
    }

    // 3. Generar Primera Factura Proforma Automáticamente
    console.log(`[BillingService] Generando factura proforma inicial para contrato ${contract.numero}`)
    
    try {
      const invoice = await InvoicingService.createInvoice({
        tenantId,
        contactId,
        amount: total,
        currency: moneda || 'EUR',
        description: `Factura inicial contrato ${contract.numero} - ${contract.titulo}`,
        items: contract.items.map(item => ({
          name: item.concepto,
          quantity: item.cantidad,
          price: item.precioUnitario,
          description: item.descripcion || undefined
        })),
        dueDate: new Date()
      })

      // 4. Registrar éxito en auditoría
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: systemUser?.id || 'SYSTEM',
          accion: 'CONTRACT_TO_CASH_SUCCESS',
          entidad: 'Invoice',
          entidadId: invoice.id,
          descripcion: `Factura ${invoice.numero} generada exitosamente. Suscripción activada.`,
        }
      })
    } catch (invoiceError) {
      console.error('[BillingService] Error al generar factura automática:', invoiceError)
      
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: systemUser?.id || 'SYSTEM',
          accion: 'CONTRACT_TO_CASH_ERROR',
          entidad: 'Contrato',
          entidadId: contractId,
          descripcion: `Error en facturación automática: ${invoiceError instanceof Error ? invoiceError.message : 'Error desconocido'}`,
        }
      })
    }
  }

  /**
   * Helper para calcular la fecha del siguiente ciclo
   */
  private static calculateNextBillingDate(from: Date, frequency: string): Date {
    switch (frequency) {
      case 'mensual':
        return addMonths(from, 1)
      case 'trimestral':
        return addMonths(from, 3)
      case 'semestral':
        return addMonths(from, 6)
      case 'anual':
        return addYears(from, 1)
      default:
        return addMonths(from, 1)
    }
  }
}
