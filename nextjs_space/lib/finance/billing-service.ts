import { eventBus, EVENTS } from '@/lib/skills/event-bus'
import { prisma } from '@/lib/db'
import { InvoicingService } from '@/lib/invoicing-service'
import { monedaEscritura } from '@/lib/moneda'
import { addMonths, addYears } from 'date-fns'

export class BillingService {
  /**
   * Inicializa los listeners del bus de eventos para facturación
   */
  static init() {
    console.log('[BillingService] Inicializando listeners de facturación...')
    
    eventBus.onEvent(EVENTS.RESOURCE_UPDATED, async (payload: any) => {
      // Detectar órdenes de venta firmadas
      if (payload.resourceType === 'orden_venta' && payload.action === 'signed') {
        try {
          await this.onOrdenVentaSigned(payload.resourceId, payload.tenantId)
        } catch (error) {
          console.error('[BillingService] Error procesando orden de venta firmada:', error)
        }
      }
    })
  }

  /**
   * Lógica ejecutada tras el sellado de una orden de venta
   * Genera la factura automáticamente en el proveedor configurado
   */
  static async onOrdenVentaSigned(ordenVentaId: string, tenantId: string) {
    const ordenVenta = await prisma.ordenVenta.findUnique({
      where: { id: ordenVentaId },
      include: {
        items: true,
        contact: {
          include: { perfilFiscal: true }
        }
      }
    })

    if (!ordenVenta) {
      console.warn(`[BillingService] Orden de venta ${ordenVentaId} no encontrada.`)
      return
    }

    const { total, moneda, contactId, numero } = ordenVenta
    const sealHash = ordenVenta.sealHash

    // 1. Logging Forense del inicio del proceso
    const systemUser = await prisma.user.findFirst({ where: { tenantId } })
    
    await (prisma.auditLog.create as any)({
      data: {
        tenantId,
        userId: systemUser?.id || null,
        accion: 'ORDEN_VENTA_SIGNED',
        entidad: 'OrdenVenta',
        entidadId: ordenVentaId,
        descripcion: `Orden de venta ${numero} firmada. Iniciando facturación automática. Seal: ${sealHash}`,
      }
    })

    // 2. Verificar que no tenga factura ya
    if (ordenVenta.invoiceId) {
      console.log(`[BillingService] Orden de venta ${numero} ya tiene factura ${ordenVenta.invoiceId}`)
      return
    }

    // 3. Generar Factura en el proveedor configurado
    console.log(`[BillingService] Generando factura para orden de venta ${numero}`)
    
    try {
      const invoice = await InvoicingService.createInvoice({
        tenantId,
        contactId: contactId ?? undefined,
        amount: total ?? undefined,
        // La divisa es la de la orden de venta; sin ella, la red de seguridad de
        // las escrituras (nunca una decisión de negocio escrita aquí).
        currency: monedaEscritura(moneda),
        description: `Factura orden de venta ${numero}`,
        items: ordenVenta.items.map(item => ({
          name: item.concepto,
          quantity: item.cantidad,
          price: item.precioUnitario,
          description: item.descripcion || undefined
        })),
        ordenVentaId: ordenVentaId,
        dueDate: new Date()
      })

      // 4. Vincular factura a la orden de venta
      await prisma.ordenVenta.update({
        where: { id: ordenVentaId },
        data: {
          invoiceId: invoice.id,
          estado: 'facturada',
          fechaFacturacion: new Date()
        }
      })

      // 5. Registrar éxito en auditoría
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: systemUser?.id || null,
          accion: 'ORDEN_VENTA_FACTURADA',
          entidad: 'Invoice',
          entidadId: invoice.id,
          descripcion: `Factura ${invoice.numero} generada para orden de venta ${numero}.`,
        }
      })

      console.log(`[BillingService] Factura ${invoice.numero} creada para orden de venta ${numero}`)
    } catch (invoiceError) {
      console.error('[BillingService] Error al generar factura automática:', invoiceError)
      
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: systemUser?.id || null,
          accion: 'ORDEN_VENTA_FACTURA_ERROR',
          entidad: 'OrdenVenta',
          entidadId: ordenVentaId,
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