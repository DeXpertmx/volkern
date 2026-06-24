import { prisma } from './db'
import { v4 as uuidv4 } from 'uuid'
import { generateInvoiceFingerprint, GENESIS_FINGERPRINT } from './crypto-utils'
import { eventBus, EVENTS } from './skills/event-bus'

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

  static setSignatureProvider(provider: ISignatureProvider) {
    this.signatureProvider = provider;
  }

  static async createInvoice(options: CreateInvoiceOptions) {
    const { tenantId } = options

    const mockIntegration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'mock_billing' } }
    })

    if (!mockIntegration?.conectado || !mockIntegration?.activo) {
      await prisma.integration.upsert({
        where: { tenantId_tipo: { tenantId, tipo: 'mock_billing' } },
        update: { conectado: true, activo: true },
        create: {
          tenantId,
          tipo: 'mock_billing',
          nombre: 'Facturación Volkern (Veri*factu)',
          conectado: true,
          activo: true,
          credenciales: {},
        }
      });
    }

    return await this.createMockInvoice(options)
  }

  static async getClienteFiscal(leadId?: string, contactId?: string, tenantId?: string) {
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
    let taxRate = 21;
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
      recargoEquivalencia: false
    }
  }

  static async getEmisorFiscal(tenantId: string) {
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

  static async getOrCreateGoCardlessMandateLink(tenantId: string, leadId?: string, contactId?: string) {
    const integration = await prisma.integration.findUnique({
      where: { tenantId_tipo: { tenantId, tipo: 'gocardless' } }
    })

    if (!integration?.conectado) throw new Error('GoCardless no está conectado')

    const creds = integration.credenciales as any
    const gcEnvironment = creds.environment === 'live' ? GoCardlessEnvironment.Live : GoCardlessEnvironment.Sandbox
    const client = (gocardlessModule as any)(creds.accessToken, gcEnvironment)

    const cliente = await this.getClienteFiscal(leadId, contactId, tenantId)

    const billingRequest = await client.billingRequests.create({
      mandate_request: {
        scheme: 'sepa_core'
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

    const configFiscal = await this.getEmisorFiscal(tenantId);
    const emisorNif = configFiscal.idFiscal || 'NIF-PENDIENTE';

    if (!configFiscal.verifactuEnabled) {
      return {
        verifactuVersion: 1,
        isSealed: false,
        fingerprint: null,
        signature: null
      };
    }

    const lastInvoice = await prisma.invoice.findFirst({
      where: {
        tenantId,
        verifactuVersion: 2
      },
      orderBy: { sequenceNumber: 'desc' }
    });

    const parentFingerprint = lastInvoice?.fingerprint || GENESIS_FINGERPRINT;
    const nextSequence = (lastInvoice?.sequenceNumber || 0) + 1;

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

    if (configFiscal.certP12 && invoiceId) {
      const { aeatQueue } = await import('./queues/aeat-queue');
      await aeatQueue.add('ship_invoice', {
        invoiceId,
        tenantId
      });
    }

    return security;
  }

  static async shipToAEAT(tenantId: string, data: any) {
    const { AEATXmlGenerator } = await import('./fiscal/aeat/xml-generator');
    const { AEATSigner } = await import('./fiscal/aeat/signer');
    const { AEATClient } = await import('./fiscal/aeat/client');
    const { CryptoService } = await import('./crypto-service');

    const config = await this.getEmisorFiscal(tenantId);
    if (!config.certP12 || !config.certPassword) {
      throw new Error('Certificado no configurado para este Tenant');
    }

    const p12Base64 = CryptoService.decrypt(config.certP12);
    const password = CryptoService.decrypt(config.certPassword);

    const { xml, expiresAt, certFingerprint } = await AEATSigner.signXml(
      AEATXmlGenerator.generateAltaFactura(data),
      p12Base64,
      password
    ) as any;

    if (new Date(expiresAt) < new Date()) {
      throw new Error(`Certificado expirado el ${expiresAt}`);
    }

    const response = await AEATClient.sendSoap(xml, p12Base64, password);

    return {
      response,
      certFingerprint,
      sentAt: new Date()
    };
  }

  private static async lockPerfilFiscal(contactId: string, tenantId: string) {
    try {
      await prisma.perfilFiscalCliente.update({
        where: { contactId },
        data: { isLocked: true }
      });
    } catch (error) {
      console.error('Error locking fiscal profile:', error);
    }
  }

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

    if (contactId) {
      await this.lockPerfilFiscal(contactId, tenantId)
    }

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

  static async rectifyInvoice(invoiceId: string, options: { reason: string, amount?: number }) {
    const original = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: true }
    })

    if (!original) throw new Error('Factura original no encontrada')

    const numero = `R-${original.numero}`
    const amount = options.amount || (original.monto * -1)
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

  static async cancelInvoice(invoiceId: string) {
    const original = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    })

    if (!original) throw new Error('Factura no encontrada')
    if (original.fiscalStatus === 'anulada') throw new Error('La factura ya está anulada')

    const numero = `ANUL-${original.numero}`

    const security = await this.sealInvoiceMetadata({
      tenantId: original.tenantId,
      numero,
      monto: 0,
      moneda: original.moneda,
      fechaEmision: new Date().toISOString(),
      receptorNif: await this.getReceptorNif(original)
    })

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
