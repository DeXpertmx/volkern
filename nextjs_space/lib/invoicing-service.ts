import { prisma } from './db'
import { stripe } from './stripe'
import { SquareClient, SquareEnvironment } from 'square'
import { v4 as uuidv4 } from 'uuid'
import { generateInvoiceFingerprint, GENESIS_FINGERPRINT } from './crypto-utils'
import { eventBus, EVENTS } from './skills/event-bus'
import { StripeMXService } from './finance/mexico/stripe-mx-service'

// Dynamic import for gocardless-nodejs - only available on server
let gocardlessModule: any;
let GoCardlessEnvironment: any;
async function getGoCardless() {
  if (!gocardlessModule) {
    const mod = await import('gocardless-nodejs');
    gocardlessModule = mod.default;
    GoCardlessEnvironment = mod.Environments;
  }
  return { client: gocardlessModule, Environment: GoCardlessEnvironment };
}

export interface ISignatureProvider {
  sign(payload: string): Promise<{ signature: string; algorithm: string }>;
}

export class MockSignatureProvider implements ISignatureProvider {
  async sign(payload: string): Promise<{ signature: string; algorithm: string }> {
    // Simulación de procesamiento asíncrono externo (Vault)
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      signature: `MOCK_SIG_${Buffer.from(payload).toString('base64').substring(0, 32).toUpperCase()}`,
      algorithm: 'RSA-SHA256-MOCK'
    };
  }
}

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
  private static signatureProvider: ISignatureProvider = new MockSignatureProvider();

  /**
   * Permite inyectar un proveedor de firma diferente (ej. FNMT, Vault)
   */
  static setSignatureProvider(provider: ISignatureProvider) {
    this.signatureProvider = provider;
  }

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

    const mockIntegration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'mock_billing' } }
    })

    // 2. Prioridad: Holded, Square, Stripe, GoCardless, Mock
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

    if (mockIntegration?.conectado && mockIntegration?.activo) {
      return await this.createMockInvoice(options)
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
        tax: item.taxRate || cliente.taxRate // Usa el default del perfil fiscal
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
    const numero = data.docNumber || `H-${Date.now()}`
    const fechaEmision = new Date()

    // 4. Sello Veri*factu
    const security = await this.sealInvoiceMetadata({
      tenantId,
      numero,
      monto: amount,
      moneda: currency || 'EUR',
      fechaEmision: fechaEmision.toISOString(),
      receptorNif: cliente.idFiscal
    })

    // Guardar en DB local
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: data.id,
        provider: 'holded',
        numero,
        monto: amount,
        moneda: currency || 'EUR',
        estado: 'pendiente',
        fechaEmision,
        urlPdf: data.downloadUrl || null,
        metadata: data,
        ...security
      }
    })

    // 5. Bloquear perfil fiscal (Gobernanza)
    if (contactId) {
      await this.lockPerfilFiscal(contactId, tenantId)
    }

    // Emitir evento
    eventBus.emitEvent(EVENTS.INVOICE_CREATED, {
      tenantId,
      invoiceId: invoice.id,
      monto: invoice.monto,
      moneda: invoice.moneda,
      numero: invoice.numero,
      leadId: invoice.leadId || undefined,
      contactId: invoice.contactId || undefined,
      source: 'api',
      timestamp: new Date()
    })

    return invoice
  }

  /**
   * Integración con Stripe Invoicing
   */
  private static async createStripeInvoice(options: CreateInvoiceOptions) {
    const { tenantId, leadId, contactId, amount, currency = 'eur', items = [], description } = options

    // --- INTEGRACIÓN VOLKERN MX (STRIPE NATIVE) ---
    if (currency.toUpperCase() === 'MXN') {
      const stripeMxInvoice = await StripeMXService.createAndEmitInvoice({
        tenantId,
        targetId: contactId || leadId!,
        type: contactId ? 'contact' : 'lead',
        amount,
        currency,
        description: description || 'Factura Volkern MX',
        items
      })

      const numero = stripeMxInvoice.number || `MX-${Date.now()}`

      // Guardar en DB local
      const invoice = await prisma.invoice.create({
        data: {
          tenantId,
          leadId,
          contactId,
          ordenVentaId: options.ordenVentaId,
          externalId: stripeMxInvoice.id,
          stripeInvoiceId: stripeMxInvoice.id,
          provider: 'stripe_mx',
          numero,
          monto: amount,
          moneda: 'MXN',
          estado: 'pendiente',
          urlPdf: stripeMxInvoice.invoice_pdf || null,
          fiscalStatus: 'pendiente_timbrado',
          metadata: stripeMxInvoice as any,
        }
      })

      // Emitir evento
      eventBus.emitEvent(EVENTS.INVOICE_CREATED, {
        tenantId,
        invoiceId: invoice.id,
        monto: invoice.monto,
        moneda: invoice.moneda,
        numero: invoice.numero,
        leadId: invoice.leadId || undefined,
        contactId: invoice.contactId || undefined,
        source: 'api_mx',
        timestamp: new Date()
      })

      return invoice
    }
    // --- FIN INTEGRACIÓN MX ---

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
    const numero = finalizedInvoice.number || `S-${Date.now()}`
    const fechaEmision = new Date()

    // 5. Sello Veri*factu
    const security = await this.sealInvoiceMetadata({
      tenantId,
      numero,
      monto: amount,
      moneda: currency.toUpperCase(),
      fechaEmision: fechaEmision.toISOString(),
      receptorNif: cliente.idFiscal
    })

    // Guardar en DB local
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: finalizedInvoice.id,
        provider: 'stripe',
        numero,
        monto: amount,
        moneda: currency.toUpperCase(),
        estado: 'pendiente',
        fechaEmision,
        urlPdf: finalizedInvoice.invoice_pdf || null,
        metadata: finalizedInvoice as any,
        ...security
      }
    })

    // 6. Bloquear perfil fiscal (Gobernanza)
    if (contactId) {
      await this.lockPerfilFiscal(contactId, tenantId)
    }

    // Emitir evento
    eventBus.emitEvent(EVENTS.INVOICE_CREATED, {
      tenantId,
      invoiceId: invoice.id,
      monto: invoice.monto,
      moneda: invoice.moneda,
      numero: invoice.numero,
      leadId: invoice.leadId || undefined,
      contactId: invoice.contactId || undefined,
      source: 'api',
      timestamp: new Date()
    })

    return invoice
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

    const p = clienteData.perfilFiscal;
    let taxRate = 21; // Default
    if (p?.regimenFiscal === 'RED') taxRate = 10;
    else if (p?.regimenFiscal === 'SRE') taxRate = 4;
    else if (p?.regimenFiscal === 'EXE') taxRate = 0;

    return {
      nombre: p?.razonSocial || clienteData.nombre,
      email: clienteData.email,
      idFiscal: p?.nif || '',
      direccion: p?.address || clienteData.ubicacion || '',
      taxRate,
      retencionIrpf: Number(p?.defaultIrpf || 0),
      recargoEquivalencia: false // No disponible en el schema simplificado actual
    }
  }

  /**
   * Obtiene la configuración fiscal del emisor para un tenant
   */
  private static async getEmisorFiscal(tenantId: string) {
    const config = await prisma.configuracionFiscalEmisor.findFirst({
      where: { tenantId, esPrincipal: true }
    }) || await prisma.configuracionFiscalEmisor.findFirst({
      where: { tenantId }
    })

    if (!config) {
      throw new Error('Configuración fiscal del emisor no encontrada para este tenant')
    }

    return config
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
    const { invoice: squareInvoice } = await client.invoices.create({
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

    const numero = squareInvoice?.invoiceNumber || `SQ-${Date.now()}`

    // 5. Sello Veri*factu
    const security = await (InvoicingService as any).sealInvoiceMetadata({
      tenantId,
      numero,
      monto: amount,
      moneda: currency,
      fechaEmision: new Date().toISOString(),
      receptorNif: cliente.idFiscal
    })

    // Guardar en DB local
    const invoice = await (prisma as any).invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: squareInvoice?.id!,
        provider: 'square',
        numero,
        monto: amount,
        moneda: currency,
        estado: 'pendiente',
        urlPdf: squareInvoice?.publicUrl || null,
        metadata: JSON.parse(JSON.stringify(squareInvoice, (_, v) => typeof v === 'bigint' ? v.toString() : v)),
        ...security
      }
    })

    // Emitir evento
    eventBus.emitEvent(EVENTS.INVOICE_CREATED, {
      tenantId,
      invoiceId: invoice.id,
      monto: invoice.monto,
      moneda: invoice.moneda,
      numero: invoice.numero,
      leadId: invoice.leadId || undefined,
      contactId: invoice.contactId || undefined,
      source: 'api',
      timestamp: new Date()
    })

    return invoice
  }

  /**
   * Integración con GoCardless API
   */
  private static async createGoCardlessPayment(options: CreateInvoiceOptions, credentials: { accessToken: string, environment?: string }) {
    const { tenantId, leadId, contactId, amount, currency = 'EUR', description } = options
    
    const { client: gocardless, Environment: GCEnv } = await getGoCardless()
    const gcEnvironment = credentials.environment === 'live' ? GCEnv.Live : GCEnv.Sandbox
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

    const numero = `GC-${payment.id}`

    // 3. Sello Veri*factu
    const security = await (InvoicingService as any).sealInvoiceMetadata({
      tenantId,
      numero,
      monto: amount,
      moneda: currency,
      fechaEmision: new Date().toISOString(),
      receptorNif: cliente.idFiscal
    })

    // Guardar en DB local
    const invoice = await (prisma as any).invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: payment.id,
        provider: 'gocardless',
        numero,
        monto: amount,
        moneda: currency,
        estado: 'pendiente',
        urlPdf: null,
        metadata: payment as any,
        ...security
      }
    })

    // Emitir evento
    eventBus.emitEvent(EVENTS.INVOICE_CREATED, {
      tenantId,
      invoiceId: invoice.id,
      monto: invoice.monto,
      moneda: invoice.moneda,
      numero: invoice.numero,
      leadId: invoice.leadId || undefined,
      contactId: invoice.contactId || undefined,
      source: 'api',
      timestamp: new Date()
    })

    return invoice
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

  /**
   * Lógica de Sellado Veri*factu
   */
  private static async sealInvoiceMetadata(params: {
    tenantId: string,
    numero: string,
    monto: number,
    moneda: string,
    fechaEmision: string,
    receptorNif: string,
    invoiceId?: string
  }) {
    const { tenantId, numero, monto, moneda, fechaEmision, receptorNif, invoiceId } = params;

    // 1. Obtener Configuración del Emisor
    const configFiscal = await this.getEmisorFiscal(tenantId);
    const emisorNif = configFiscal.idFiscal || 'NIF-PENDIENTE';

    // 2. Si Veri*factu NO está activado, devolvemos versión Legacy
    if (!configFiscal.verifactuEnabled) {
      return {
        verifactuVersion: 1,
        isSealed: false,
        fingerprint: null,
        signature: null
      };
    }

    // 3. Obtener última factura Veri*factu para encadenar
    const lastInvoice = await prisma.invoice.findFirst({
      where: { 
        tenantId,
        verifactuVersion: 2
      },
      orderBy: { sequenceNumber: 'desc' }
    });

    const parentFingerprint = lastInvoice?.fingerprint || GENESIS_FINGERPRINT;
    const nextSequence = (lastInvoice?.sequenceNumber || 0) + 1;

    // 4. Generar Fingerprint (Hash base)
    const fingerprint = generateInvoiceFingerprint({
      tenantId,
      emisorNif,
      receptorNif,
      numero,
      fechaEmision,
      monto,
      moneda,
      parentFingerprint
    });

    // 5. Firma Digital Externa (Integridad de Capa 2)
    const { signature, algorithm } = await this.signatureProvider.sign(fingerprint);

    const security = {
      fingerprint,
      parentFingerprint,
      sequenceNumber: nextSequence,
      verifactuVersion: 2,
      isSealed: true,
      signature,
      signatureAlgorithm: algorithm,
      aeatStatus: 'PENDING' as const
    };

    // 6. Encolar envío a AEAT si hay certificado y tenemos el ID de factura
    if (configFiscal.certP12 && invoiceId) {
      const { aeatQueue } = await import('./queues/aeat-queue');
      await aeatQueue.add('ship_invoice', { 
        invoiceId, 
        tenantId 
      });
    }

    return security;
  }

  /**
   * Envía una factura a la AEAT usando la infraestructura XAdES/SOAP (Llamado por Worker)
   */
  static async shipToAEAT(tenantId: string, data: any) {
    const { AEATXmlGenerator } = await import('./fiscal/aeat/xml-generator');
    const { AEATSigner } = await import('./fiscal/aeat/signer');
    const { AEATClient } = await import('./fiscal/aeat/client');
    const { CryptoService } = await import('./crypto-service');

    const config = await this.getEmisorFiscal(tenantId);
    if (!config.certP12 || !config.certPassword) {
      throw new Error('Certificado no configurado para este Tenant');
    }

    // 1. Desencriptar Certificado y Password
    const p12Base64 = CryptoService.decrypt(config.certP12);
    const password = CryptoService.decrypt(config.certPassword);

    // 2. Validar expiración en runtime
    const { xml, expiresAt, certFingerprint } = await AEATSigner.signXml(
      AEATXmlGenerator.generateAltaFactura(data),
      p12Base64,
      password
    );

    if (new Date(expiresAt) < new Date()) {
      throw new Error(`Certificado expirado el ${expiresAt}`);
    }

    // 3. Enviar vía SOAP (Mutual TLS)
    const response = await AEATClient.sendSoap(xml, p12Base64, password);

    // 4. Auditoría de uso (Opcional: guardar evidencia en S3 aquí)
    return {
      response,
      certFingerprint,
      sentAt: new Date()
    };
  }

  /**
   * Bloquea el perfil fiscal para evitar ediciones que rompan la integridad
   */
  private static async lockPerfilFiscal(contactId: string, tenantId: string) {
    try {
      await prisma.perfilFiscalCliente.update({
        where: { contactId },
        data: { isLocked: true }
      });
    } catch (error) {
      console.error('Error locking fiscal profile:', error);
      // No lanzamos error para no interrumpir el flujo de facturación,
      // pero el audit script lo detectará después si hubo cambios.
    }
  }

  /**
   * Generación de factura MOCK (para testing y Veri*factu interno)
   */
  private static async createMockInvoice(options: CreateInvoiceOptions) {
    const { tenantId, leadId, contactId, amount, currency = 'EUR' } = options
    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)
    const numero = `MOCK-${Date.now()}`
    const fechaEmision = new Date()

    const security = await this.sealInvoiceMetadata({
      tenantId,
      numero,
      monto: amount,
      moneda: currency,
      fechaEmision: fechaEmision.toISOString(),
      receptorNif: cliente.idFiscal
    })

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        leadId,
        contactId,
        ordenVentaId: options.ordenVentaId,
        externalId: `mock_${uuidv4()}`,
        provider: 'mock',
        numero,
        monto: amount,
        moneda: currency,
        estado: 'completado',
        fechaEmision,
        metadata: { isMock: true },
        ...security
      }
    })

    return invoice
  }

  /**
   * Rectificar una factura (Veri*factu R1/R2)
   */
  static async rectifyInvoice(invoiceId: string, options: { reason: string, amount?: number }) {
    const original = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: true }
    })

    if (!original) throw new Error('Factura original no encontrada')
    
    // Generar número de rectificativa
    const numero = `R-${original.numero}`
    const amount = options.amount || (original.monto * -1) // Por defecto invierte el signo
    const fechaEmision = new Date()

    const security = await this.sealInvoiceMetadata({
      tenantId: original.tenantId,
      numero,
      monto: amount,
      moneda: original.moneda,
      fechaEmision: fechaEmision.toISOString(),
      receptorNif: await this.getReceptorNif(original)
    })

    const rectification = await prisma.invoice.create({
      data: {
        tenantId: original.tenantId,
        leadId: original.leadId,
        contactId: original.contactId,
        provider: original.provider,
        numero,
        monto: amount,
        moneda: original.moneda,
        estado: 'completado',
        fechaEmision,
        metadata: { 
          isRectification: true, 
          originalInvoiceId: original.id,
          reason: options.reason
        },
        ...security
      }
    })

    return rectification
  }

  /**
   * Anular una factura (Veri*factu Anulación)
   */
  static async cancelInvoice(invoiceId: string) {
    const original = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    })

    if (!original) throw new Error('Factura no encontrada')
    if (original.fiscalStatus === 'anulada') throw new Error('La factura ya está anulada')

    // En Veri*factu, la anulación genera un evento en la cadena
    const numero = `ANUL-${original.numero}`
    
    const security = await this.sealInvoiceMetadata({
      tenantId: original.tenantId,
      numero,
      monto: 0, // Las anulaciones suelen registrarse con importe 0 o el original según el sistema
      moneda: original.moneda,
      fechaEmision: new Date().toISOString(),
      receptorNif: await this.getReceptorNif(original)
    })

    // Actualizamos la original y creamos el registro de anulación si es necesario, 
    // o simplemente marcamos la original y guardamos el sello de anulación en fiscalDetails.
    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        fiscalStatus: 'anulada',
        metadata: {
          ...(original.metadata as any || {}),
          annulmentSecurity: security
        }
      }
    })

    return updated
  }

  private static async getReceptorNif(invoice: any): Promise<string> {
    const cliente = await this.getClienteFiscal(invoice.leadId, invoice.contactId, invoice.tenantId)
    return cliente.idFiscal
  }
}
