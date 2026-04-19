import { prisma } from '../lib/db';
import { generateInvoiceHash } from '../lib/crypto-utils';

async function generateNextInChain() {
  const tenantId = 'cmo16k1ne0000mfgazm0imtgg';
  const contact = await prisma.contact.findFirst({ where: { tenantId } });
  
  if (!contact) throw new Error('No contact found for demo tenant');

  console.log(`🔗 Generando SEC-2026-004 para el Tenant: ${tenantId}...`);

  // 1. Obtener última factura
  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId, verifactuVersion: 2 },
    orderBy: { sequenceNumber: 'desc' }
  });

  if (!lastInvoice) throw new Error('No se encontró la factura SEC-003 para encadenar.');
  
  console.log(`📡 Hash Padre detectado (SEC-003): ${lastInvoice.fingerprint}`);

  // 2. Datos del Emisor y Receptor
  const emisor = await prisma.configuracionFiscalEmisor.findFirst({ where: { tenantId } });
  const receptor = await prisma.perfilFiscalCliente.findFirst({ where: { contactId: contact.id } });

  const invoiceData = {
    numero: 'SEC-2026-004',
    monto: 300.0,
    fecha: new Date('2026-04-16T10:00:00.000Z'),
    moneda: 'EUR'
  };

  // 3. Generar nuevo Fingerprint
  const nextHash = generateInvoiceHash({
    tenantId,
    emisorNif: emisor?.idFiscal || '',
    receptorNif: receptor?.nif || '',
    numero: invoiceData.numero,
    fechaEmision: invoiceData.fecha.toISOString(),
    monto: invoiceData.monto,
    moneda: invoiceData.moneda,
    parentFingerprint: lastInvoice.fingerprint || ''
  });

  // 4. Persistir
  const newInvoice = await prisma.invoice.create({
    data: {
      tenantId,
      contactId: contact.id,
      provider: 'INTERNAL',
      numero: invoiceData.numero,
      sequenceNumber: (lastInvoice.sequenceNumber || 0) + 1,
      fechaEmision: invoiceData.fecha,
      monto: invoiceData.monto,
      moneda: invoiceData.moneda,
      estado: 'emitida',
      isSealed: true,
      verifactuVersion: 2,
      fingerprint: nextHash,
      parentFingerprint: lastInvoice.fingerprint
    }
  });

  console.log(`✅ [EXITO] Factura SEC-2026-004 generada e incorporada a la cadena.`);
  console.log(`🛡️ Nuevo Fingerprint: ${newInvoice.fingerprint}`);
}

generateNextInChain().catch(console.error);
