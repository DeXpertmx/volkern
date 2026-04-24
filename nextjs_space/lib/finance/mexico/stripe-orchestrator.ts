import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'

export class StripeOrchestrator {
  /**
   * Prepara y calcula los impuestos para una factura antes de emitirla
   */
  static async previewTax(options: {
    customerEmail: string,
    currency: string,
    items: Array<{ amount: number, description: string }>
  }) {
    // Nota: Esto requiere Stripe Tax activado. 
    // Usamos el API de Calculations para previsualizar sin crear la factura.
    try {
      // Simplificado: En un flujo real usaríamos stripe.tax.calculations.create
      // Por ahora devolvemos una estimación basada en el 16% si es MXN
      const subtotal = options.items.reduce((sum, item) => sum + item.amount, 0)
      const tax = options.currency.toLowerCase() === 'mxn' ? subtotal * 0.16 : 0
      return {
        subtotal,
        tax,
        total: subtotal + tax
      }
    } catch (error) {
      console.error('[StripeOrchestrator] Error en previsualización:', error)
      throw error
    }
  }

  /**
   * Orquestación atómica de la factura en Stripe
   */
  static async createDirectInvoice(options: {
    tenantId: string,
    targetId: string,
    type: 'lead' | 'contact',
    items: Array<{ name: string, price: number, description?: string, quantity: number }>,
    metadata?: any
  }) {
    const { tenantId, targetId, type, items, metadata } = options

    // 1. Obtener datos fiscales de Volkern
    const fiscalData = await prisma.customerFiscalData.findUnique({
      where: type === 'lead' ? { leadId: targetId } : { contactId: targetId }
    })

    if (!fiscalData || !fiscalData.rfc) {
      throw new Error('DATOS_FISCALES_INCOMPLETOS: Se requiere RFC y C.P. para facturación directa MX.')
    }

    // 2. Obtener/Crear Customer en Stripe
    let entity: any
    if (type === 'contact') {
      entity = await prisma.contact.findUnique({ where: { id: targetId } })
    } else {
      entity = await prisma.lead.findUnique({ where: { id: targetId } })
    }

    let stripeCustomerId = await this.getOrCreateStripeCustomer(entity, tenantId)

    // 3. Registrar Tax ID si no existe
    const taxIds = await stripe.customers.listTaxIds(stripeCustomerId)
    if (!taxIds.data.find(t => t.type === 'mx_rfc' && t.value === fiscalData.rfc)) {
      await stripe.customers.createTaxId(stripeCustomerId, {
        type: 'mx_rfc',
        value: fiscalData.rfc!
      })
    }

    // 4. Crear Invoice Items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: Math.round(item.price * 100), // Stripe usa centavos
        currency: 'mxn',
        description: item.name,
        metadata: { ...item }
      })
    }

    // 5. Crear la Factura con Timbrado Automático (finalización inmediata)
    const invoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      auto_advance: true,
      collection_method: 'send_invoice',
      days_until_due: 1,
      metadata: {
        volkern_tenant_id: tenantId,
        sat_uso_cfdi: fiscalData.usoCFDI || 'G03',
        sat_regimen_fiscal: fiscalData.regimenFiscal || '601',
        sat_rfc: fiscalData.rfc,
        cfdi_version: '4.0',
        ...metadata
      },
      // Habilitar Stripe Tax si está configurado
      automatic_tax: { enabled: true }
    })

    // Finalizar inmediatamente para disparar el timbrado
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id)

    return finalizedInvoice
  }

  private static async getOrCreateStripeCustomer(entity: any, tenantId: string) {
    const customers = await stripe.customers.list({ email: entity.email, limit: 1 })
    if (customers.data.length > 0) return customers.data[0].id

    const customer = await stripe.customers.create({
      email: entity.email,
      name: entity.nombre,
      metadata: { tenantId, source: 'volkern_direct_billing' }
    })
    return customer.id
  }
}
