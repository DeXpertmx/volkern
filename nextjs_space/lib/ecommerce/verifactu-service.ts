import { prisma } from '@/lib/db';
import { aeatQueue } from '@/lib/fiscal/aeat/queue';
import { createFingerprint } from '@/lib/fiscal/aeat/crypto';

export interface InvoiceData {
  tenantId: string;
  ordenVentaId: string;
  emisorId: string;
  numero: string;
  fechaEmision: Date;
  subtotal: number;
  totalImpuestos: number;
  total: number;
  moneda: string;
  clienteNombre: string;
  clienteNif: string;
  clienteDireccion: string;
  items: {
    concepto: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }[];
}

export async function createVerifactuInvoice(data: InvoiceData) {
  console.log(`[VeriFactu] Creando factura para orden ${data.ordenVentaId}`);

  const emisor = await prisma.configuracionFiscalEmisor.findUnique({
    where: { id: data.emisorId }
  });

  if (!emisor) {
    throw new Error('Emisor fiscal no encontrado');
  }

  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId: data.tenantId, verifactuVersion: 2 },
    orderBy: { sequenceNumber: 'desc' },
    select: { fingerprint: true, sequenceNumber: true }
  });

  const sequenceNumber = (lastInvoice?.sequenceNumber || 0) + 1;
  const parentFingerprint = lastInvoice?.fingerprint || 'GENESIS_VERIFACTU_2026';

  const invoicePayload = {
    id: `INV-${Date.now()}`,
    numero: data.numero,
    tenantId: data.tenantId,
    emisorId: data.emisorId,
    sequenceNumber,
    fechaEmision: data.fechaEmision,
    subtotal: data.subtotal,
    totalImpuestos: data.totalImpuestos,
    total: data.total,
    moneda: data.moneda,
    clienteNombre: data.clienteNombre,
    clienteNif: data.clienteNif,
    clienteDireccion: data.clienteDireccion,
    parentFingerprint,
    verifactuVersion: 2,
  };

  const fingerprint = createFingerprint(invoicePayload);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: data.tenantId,
      numero: data.numero,
      fechaEmision: data.fechaEmision,
      subtotal: data.subtotal,
      totalImpuestos: data.totalImpuestos,
      total: data.total,
      moneda: data.moneda,
      fingerprint,
      parentFingerprint,
      sequenceNumber,
      verifactuVersion: 2,
      isSealed: true,
      fechaFirma: new Date(),
      items: {
        create: data.items.map((item, index) => ({
          concepto: item.concepto,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          total: item.total,
          orden: index,
        }))
      },
    }
  });

  console.log(`[VeriFactu] Factura ${invoice.numero} creada con fingerprint ${fingerprint}`);

  if (emisor.verifactuEnabled) {
    try {
      await aeatQueue.add('send-invoice', {
        invoiceId: invoice.id,
        tenantId: data.tenantId,
        emisorId: data.emisorId,
      });

      console.log(`[VeriFactu] Factura ${invoice.numero} enviada a cola AEAT`);
    } catch (error) {
      console.error(`[VeriFactu] Error enviando a cola AEAT:`, error);
    }
  }

  return invoice;
}
