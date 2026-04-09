import { prisma } from './db'
import { stripe } from './stripe'
import { SquareClient, SquareEnvironment } from 'square'
import gocardless, { Environments as GoCardlessEnvironment } from 'gocardless-nodejs'
import { v4 as uuidv4 } from 'uuid'

export interface InvoiceItem {
  name: string
  quantity: number
  price: number
  description?: string
  taxRate?: number
}

export interface CreateInvoiceOptions {
  tenantId: string
  leadId?: string
  contactId?: string
  ordenVentaId?: string
  amount: number
  currency?: string
  description?: string
  items?: InvoiceItem[]
  dueDate?: Date
}

export class InvoicingService {
  /**
   * Genera una factura usando el proveedor activo del tenant
   */
  static async createInvoice(options: CreateInvoiceOptions) {
    const { tenantId, leadId, contactId, amount, currency = 'EUR', items = [] } = options

    const holdedIntegration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'holded' } }
    })

    const stripeIntegration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'stripe_invoicing' } }
    })

    const squareIntegration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'square' } }
    })

    const gocardlessIntegration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'gocardless' } }
    })

    // 2. Prioridad: Holded, Square, Stripe, GoCardless
    if (holdedIntegration?.conectado && holdedIntegration?.activo) {
      return await this.createHoldedInvoice(options, holdedIntegration.credenciales as any)
    }

    if (squareIntegration?.conectado && squareIntegration?.activo) {
      return await this.createSquareInvoice(options, squareIntegration.credenciales as any)
    }

    if (stripeIntegration?.conectado && stripeIntegration?.activo) {
      return await this.createStripeInvoice(options)
    }

    if (gocardlessIntegration?.conectado && gocardlessIntegration?.activo) {
      return await this.createGoCardlessPayment(options, gocardlessIntegration.credenciales as any)
    }

    throw new Error('No hay ninguna integración de facturación activa y configurada.')
  }

  /**
   * Integración con Holded API
   */
  private static async createHoldedInvoice(options: CreateInvoiceOptions, credentials: { apiKey: string }) {
    const { tenantId, leadId, contactId, amount, currency, items = [], description } = options

    // Obtener datos del cliente
    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)
    
    // Preparar body para Holded
    // Doc: POST https://api.holded.com/api/invoicing/v1/documents/invoice
    const body = {
      contactName: cliente.nombre,
      contactEmail: cliente.email,
      contactCode: cliente.idFiscal, // NIF/CIF
      date: Math.floor(Date.now() / 1000),
      notes: description,
      items: items.map(item => ({
        name: item.name,
        units: item.quantity,
        subtotal: item.price,
        desc: item.description,
        tax: item.taxRate || 21
      })),
      applyContactDefaults: true,
      approveDoc: true // Aprovar automáticamente
    }

    const response = await fetch('https://api.holded.com/api/invoicing/v1/documents/invoice', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'key': credentials.apiKey
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Error en Holded: ${error.message || response.statusText}`)
    }

    const data = await response.json()

    // Guardar en DB local
    return await prisma.invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: data.id,
        provider: 'holded',
        numero: data.docNumber || `H-${Date.now()}`,
        monto: amount,
        moneda: currency || 'EUR',
        estado: 'pendiente',
        urlPdf: data.downloadUrl || null,
        metadata: data
      }
    })
  }

  /**
   * Integración con Stripe Invoicing
   */
  private static async createStripeInvoice(options: CreateInvoiceOptions) {
    const { tenantId, leadId, contactId, amount, currency = 'eur', items = [], description } = options

    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)

    // 1. Buscar o crear cliente en Stripe
    let stripeCustomerId = await this.getOrCreateStripeCustomer(cliente, tenantId)

    // 2. Crear Invoice Items (Stripe requiere crearlos antes que la factura si no es un One-Off)
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: Math.round(item.price * 100), // Stripe usa centavos
        currency: currency.toLowerCase(),
        description: item.name + (item.description ? `: ${item.description}` : ''),
      })
    }

    // 3. Crear el Invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice', // Enviar por email
      days_until_due: 30,
      description: description || 'Factura generada desde Volkern CRM',
    })

    // 4. Finalizar y enviar (opcional, pero suele ser lo deseado)
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id)

    // Guardar en DB local
    return await prisma.invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: finalizedInvoice.id,
        provider: 'stripe',
        numero: finalizedInvoice.number || `S-${Date.now()}`,
        monto: amount,
        moneda: currency.toUpperCase(),
        estado: 'pendiente',
        urlPdf: finalizedInvoice.invoice_pdf || null,
        metadata: finalizedInvoice as any
      }
    })
  }

  /**
   * Helper para obtener datos fiscales consolidados
   */
  private static async getClienteFiscal(leadId?: string, contactId?: string, tenantId?: string) {
    let clienteData: any = null
    
    if (leadId) {
      clienteData = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { perfilFiscal: true }
      })
    } else if (contactId) {
      clienteData = await prisma.contact.findUnique({
        where: { id: contactId },
        include: { perfilFiscal: true }
      })
    }

    if (!clienteData) throw new Error('Cliente no encontrado')

    return {
      nombre: clienteData.perfilFiscal?.razonSocial || clienteData.nombre,
      email: clienteData.email,
      idFiscal: clienteData.perfilFiscal?.idFiscal || '',
      direccion: clienteData.perfilFiscal?.direccionFiscal || clienteData.ubicacion || ''
    }
  }

  /**
   * Helper para Stripe Customer sync
   */
  private static async getOrCreateStripeCustomer(cliente: any, tenantId: string) {
    // Buscar si ya tiene customerId registrado en el tenant/perfil
    // Para simplificar, buscamos por email en Stripe
    const customers = await stripe.customers.list({ email: cliente.email, limit: 1 })
    
    if (customers.data.length > 0) {
      return customers.data[0].id
    }

    // Crear nuevo
    const customer = await stripe.customers.create({
      email: cliente.email,
      name: cliente.nombre,
      metadata: {
        tenantId: tenantId,
        source: 'volkern_crm'
      }
    })

    return customer.id
  }

  /**
   * Integración con Square API
   */
  private static async createSquareInvoice(options: CreateInvoiceOptions, credentials: { accessToken: string, locationId: string, environment?: string }) {
    const { tenantId, leadId, contactId, amount, currency = 'USD', items = [], description } = options
    
    const client = new SquareClient({
      token: credentials.accessToken,
      environment: credentials.environment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
    })

    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)

    // 1. Crear o buscar cliente en Square
    const { customers } = await client.customers.search({
      query: { filter: { emailAddress: { fuzzy: cliente.email } } }
    })
    
    let squareCustomerId = customers?.[0]?.id
    if (!squareCustomerId) {
      const { customer } = await client.customers.create({
        givenName: cliente.nombre,
        emailAddress: cliente.email,
        referenceId: contactId || leadId
      })
      squareCustomerId = customer?.id
    }

    // 2. Crear Orden
    const { order } = await client.orders.create({
      order: {
        locationId: credentials.locationId,
        customerId: squareCustomerId,
        lineItems: items.length > 0 ? items.map(item => ({
          name: item.name,
          quantity: item.quantity.toString(),
          basePriceMoney: {
            amount: BigInt(Math.round(item.price * 100)),
            currency: currency as any
          }
        })) : [{
          name: description || 'Servicios CRM',
          quantity: '1',
          basePriceMoney: {
            amount: BigInt(Math.round(amount * 100)),
            currency: currency as any
          }
        }]
      }
    })

    // 3. Crear Factura
    const { invoice } = await client.invoices.create({
      invoice: {
        orderId: order?.id,
        primaryRecipient: { customerId: squareCustomerId },
        paymentRequests: [{
          requestType: 'BALANCE',
          dueDate: options.dueDate?.toISOString().split('T')[0] || new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]
        }],
        deliveryMethod: 'EMAIL',
        title: description || 'Factura Volkern CRM'
      }
    })

    // 4. Publicar Factura
    const { invoice: publishedInvoice } = await client.invoices.publish({
      invoiceId: invoice?.id!,
      version: invoice?.version!
    })

    // Guardar en DB local
    return await (prisma as any).invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: publishedInvoice?.id!,
        provider: 'square',
        numero: publishedInvoice?.invoiceNumber || `SQ-${Date.now()}`,
        monto: amount,
        moneda: currency,
        estado: 'pendiente',
        urlPdf: publishedInvoice?.publicUrl || null,
        metadata: JSON.parse(JSON.stringify(publishedInvoice, (_, v) => typeof v === 'bigint' ? v.toString() : v))
      }
    })
  }

  /**
   * Integración con GoCardless API
   */
  private static async createGoCardlessPayment(options: CreateInvoiceOptions, credentials: { accessToken: string, environment?: string }) {
    const { tenantId, leadId, contactId, amount, currency = 'EUR', description } = options
    
    const gcEnvironment = credentials.environment === 'live' ? GoCardlessEnvironment.Live : GoCardlessEnvironment.Sandbox
    const client = gocardless(credentials.accessToken, gcEnvironment)

    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)
    
    // 1. Obtener Mandato
    const targetId = contactId || leadId
    const targetModel: any = contactId ? (prisma as any).contact : (prisma as any).lead
    
    const record = await targetModel.findUnique({
      where: { id: targetId },
      select: { metadata: true }
    })

    const mandateId = (record?.metadata as any)?.gocardlessMandateId
    
    if (!mandateId) {
      throw new Error('El cliente no tiene un mandato de GoCardless autorizado. Debes enviar primero el link de autorización.')
    }

    // 2. Crear Cobro
    const payment = await client.payments.create({
      amount: Math.round(amount * 100).toString(),
      currency: currency as any,
      links: { mandate: mandateId },
      description: description || 'Cobro por domiciliación Volkern CRM'
    })

    // Guardar en DB local
    return await (prisma as any).invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: payment.id,
        provider: 'gocardless',
        numero: `GC-${payment.id}`,
        monto: amount,
        moneda: currency,
        estado: 'pendiente',
        urlPdf: null,
        metadata: payment as any
      }
    })
  }

  /**
   * Genera un link de autorización para GoCardless (Mandato)
   */
  static async getOrCreateGoCardlessMandateLink(tenantId: string, leadId?: string, contactId?: string) {
    const integration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'gocardless' } }
    })

    if (!integration?.conectado) throw new Error('GoCardless no está conectado')
    
    const creds = integration.credenciales as any
    const gcEnvironment = creds.environment === 'live' ? GoCardlessEnvironment.Live : GoCardlessEnvironment.Sandbox
    const client = gocardless(creds.accessToken, gcEnvironment)

    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)

    // 1. Crear Billing Request Flow
    // Doc: https://developer.gocardless.com/api-reference#billing-request-flows
    const billingRequest = await client.billingRequests.create({
      mandate_request: {
        scheme: 'sepa_core' // SEPA para Europa, o autodetectar
      }
    })

    const flow = await client.billingRequestFlows.create({
      links: { billing_request: billingRequest.id },
      redirect_uri: `https://volkern.com/api/integrations/gocardless/callback?tenantId=${tenantId}&leadId=${leadId || ''}&contactId=${contactId || ''}`,
      exit_uri: `https://volkern.com/dashboard/integraciones?tab=contabilidad`
    })

    return {
      authorizationUrl: flow.authorisation_url,
      billingRequestId: billingRequest.id
    }
  }
}
