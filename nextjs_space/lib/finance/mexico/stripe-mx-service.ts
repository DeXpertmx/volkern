import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { FiscalIntelligenceService } from './fiscal-intelligence'

export class StripeMXService {
  /**
   * Sincroniza los datos fiscales del cliente con Stripe (Tax IDs)
   */
  static async syncCustomerFiscalData(targetId: string, type: 'lead' | 'contact', tenantId: string) {
    const fiscalData = await prisma.customerFiscalData.findUnique({
      where: type === 'lead' ? { leadId: targetId } : { contactId: targetId }
    })

    if (!fiscalData || !fiscalData.rfc) return null

    // Obtener el ID de cliente de Stripe
    let stripeCustomerId: string | null = null
    if (type === 'contact') {
      const contact = await prisma.contact.findUnique({ where: { id: targetId } })
      stripeCustomerId = await this.getOrCreateStripeCustomer(contact, tenantId)
    } else {
      const lead = await prisma.lead.findUnique({ where: { id: targetId } })
      stripeCustomerId = await this.getOrCreateStripeCustomer(lead, tenantId)
    }

    if (!stripeCustomerId) return null

    // Registrar o actualizar Tax ID en Stripe para México
    // En Stripe, el RFC es de tipo 'mx_rfc'
    const taxIds = await stripe.customers.listTaxIds(stripeCustomerId)
    const existingRfc = taxIds.data.find(t => t.type === 'mx_rfc' && t.value === fiscalData.rfc)

    if (!existingRfc) {
      const newTaxId = await stripe.customers.createTaxId(stripeCustomerId, {
        type: 'mx_rfc',
        value: fiscalData.rfc!
      })
      
      await prisma.customerFiscalData.update({
        where: { id: fiscalData.id },
        data: { stripeTaxId: newTaxId.id }
      })
      
      return newTaxId
    }

    return existingRfc
  }

  /**
   * Crea una factura en Stripe con metadatos de CFDI 4.0
   */
  static async createAndEmitInvoice(options: {
    tenantId: string,
    targetId: string,
    type: 'lead' | 'contact',
    amount: number,
    currency: string,
    description: string,
    items: any[]
  }) {
    const { tenantId, targetId, type, amount, currency, description, items } = options

    const fiscalData = await prisma.customerFiscalData.findUnique({
      where: type === 'lead' ? { leadId: targetId } : { contactId: targetId }
    })

    if (!fiscalData || !fiscalData.rfc) {
      throw new Error('El cliente no tiene RFC configurado para facturación mexicana.')
    }

    let entity: any = null
    if (type === 'contact') {
      entity = await prisma.contact.findUnique({ where: { id: targetId } })
    } else {
      entity = await prisma.lead.findUnique({ where: { id: targetId } })
    }

    const stripeCustomerId = await this.getOrCreateStripeCustomer(entity, tenantId)

    if (!stripeCustomerId) throw new Error('No se pudo sincronizar el cliente con Stripe.')

    // Asegurar que el Tax ID esté en Stripe
    await this.syncCustomerFiscalData(targetId, type, tenantId)

    // Crear Invoice Items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: Math.round(item.price * 100),
        currency: currency.toLowerCase(),
        description: `${item.name}: ${item.description || ''}`,
      })
    }

    // Crear Factura con metadatos SAT (CFDI 4.0)
    // Nota: El uso de CFDI y Régimen son obligatorios en México
    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      auto_advance: true,
      collection_method: 'send_invoice',
      days_until_due: 7,
      description: description,
      metadata: {
        volkern_tenant_id: tenantId,
        sat_uso_cfdi: fiscalData.usoCFDI || 'G03',
        sat_regimen_fiscal: fiscalData.regimenFiscal || '601',
        sat_rfc: fiscalData.rfc,
        cfdi_version: '4.0'
      }
    })

    // Finalizar la factura (esto dispara el timbrado si Stripe Tax MX está configurado)
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id)

    return finalized
  }

  /**
   * Descarga y guarda archivos fiscales (XML/PDF)
   */
  static async syncFiscalFiles(stripeInvoiceId: string, tenantId: string) {
    const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId)
    
    // En una implementación real, buscaríamos el XML en los metadatos o archivos adjuntos de la factura
    const xmlUrl = (stripeInvoice.metadata as any)?.sat_xml_url || null
    const pdfUrl = stripeInvoice.invoice_pdf

    // Buscar la factura local por stripeInvoiceId
    const localInvoice = await prisma.invoice.findFirst({
      where: { stripeInvoiceId: stripeInvoiceId }
    })

    if (localInvoice) {
      await prisma.invoice.update({
        where: { id: localInvoice.id },
        data: {
          xmlUrl: xmlUrl,
          urlPdf: pdfUrl,
          fiscalStatus: 'timbrada',
          fiscalDetails: {
            stripe_status: stripeInvoice.status,
            finalized_at: stripeInvoice.status_transitions?.finalized_at,
            sat_metadata: stripeInvoice.metadata
          }
        }
      })
      
      console.log(`[StripeMX] Archivos sincronizados para factura ${stripeInvoiceId}`)

      // Disparar Inteligencia Fiscal (Parsing + Strategy Hub)
      await FiscalIntelligenceService.ingestFiscalDocument(localInvoice.id, tenantId)
    }
  }

  private static async getOrCreateStripeCustomer(entity: any, tenantId: string) {
    if (!entity) return null
    
    const customers = await stripe.customers.list({ email: entity.email, limit: 1 })
    if (customers.data.length > 0) return customers.data[0].id

    const customer = await stripe.customers.create({
      email: entity.email,
      name: entity.nombre,
      metadata: { tenantId, source: 'volkern_crm_mx' }
    })
    return customer.id
  }
}
