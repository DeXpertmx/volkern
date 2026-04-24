import { prisma } from '@/lib/db'
import { eventBus, EVENTS } from '@/lib/skills/event-bus'

export class FiscalIntelligenceService {
  /**
   * Procesa un documento fiscal (XML) para extraer inteligencia operativa
   */
  static async ingestFiscalDocument(invoiceId: string, tenantId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { contact: true, lead: true }
    })

    if (!invoice) return

    console.log(`[FiscalIntelligence] Analizando contexto fiscal para factura ${invoice.numero}`)

    // 1. Simulación de Parsing de XML (CFDI 4.0)
    // Extraemos la esencia del documento para el Strategy Hub
    const fiscalData = {
      uuid: (invoice.metadata as any)?.sat_uuid || invoice.stripeInvoiceId || 'UUID-SIMULADO',
      montoTotal: invoice.monto,
      iva: invoice.monto * 0.16, // Simulado para MX
      subtotal: invoice.monto / 1.16,
      fechaTimbrado: invoice.fechaEmision,
      receptorRfc: (invoice.metadata as any)?.sat_rfc || 'RECP-MOCK'
    }

    // 2. Alimentar el Strategy Hub (ProfitabilityRecord)
    // Esto permite que el monitor de rentabilidad detecte ingresos reales timbrados
    try {
      await prisma.profitabilityRecord.create({
        data: {
          tenantId,
          entityType: invoice.contactId ? 'CLIENT' : 'LEAD',
          entityId: invoice.contactId || invoice.leadId || 'UNKNOWN',
          revenue: fiscalData.subtotal,
          costs: 0, 
          margin: fiscalData.subtotal,
          period: this.getPeriodFromDate(fiscalData.fechaTimbrado),
          metadata: {
            invoiceId: invoice.id,
            fiscalUuid: fiscalData.uuid,
            type: 'SALE_TIMBRADA'
          }
        }
      })
    } catch (error) {
      console.error('[FiscalIntelligence] Error al crear registro de rentabilidad:', error)
    }

    // 3. Notificar a Gemma (Intelligence Agent)
    // Gemma procesará este evento para actualizar alertas ejecutivas o forecasting
    eventBus.emitEvent(EVENTS.RESOURCE_UPDATED, {
      tenantId,
      resourceType: 'strategy',
      action: 'fiscal_doc_ingested',
      resourceId: invoice.id,
      details: {
        amount: invoice.monto,
        currency: invoice.moneda,
        uuid: fiscalData.uuid,
        customer: invoice.contact?.nombre || invoice.lead?.nombre
      }
    })

    console.log(`[FiscalIntelligence] Ingestión completada para factura ${invoice.id}`)
  }

  private static getPeriodFromDate(date: Date): string {
    const d = new Date(date)
    return `${d.getFullYear()}-M${String(d.getMonth() + 1).padStart(2, '0')}`
  }
}
