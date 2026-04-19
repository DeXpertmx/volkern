import { prisma } from '../lib/db';
import { generateInvoiceHash, GENESIS_FINGERPRINT } from '../lib/crypto-utils';

async function seedInvoices(tenantId: string, contactId: string) {
  console.log('🌱 Sembrando datos fiscales para auditoría...');

  // 1. Asegurar Perfil Fiscal
  const nifReceptor = '12345678Z';
  const emisorNif = 'B98765432';

  await prisma.perfilFiscalCliente.upsert({
    where: { contactId },
    update: { nif: nifReceptor, tipo: 'AUTONOMO', country: 'ES', tipoIdFiscal: 'NIF' },
    create: {
      tenantId,
      contactId,
      nif: nifReceptor,
      tipo: 'AUTONOMO',
      tipoIdFiscal: 'NIF',
      razonSocial: 'Carlos Perez Fiscal',
      country: 'ES',
      address: 'Calle Falsa 123',
      zipCode: '28001',
      city: 'Madrid',
      province: 'Madrid'
    }
  });

  // 2. Asegurar Emisor
  await prisma.configuracionFiscalEmisor.deleteMany({ where: { tenantId } });
  await prisma.configuracionFiscalEmisor.create({
    data: {
      tenantId,
      razonSocial: 'Volkern Tech Solutions SL',
      idFiscal: emisorNif,
      tipoIdFiscal: 'CIF',
      pais: 'ES',
      direccion: 'Av. de la Castellana 100',
      ciudad: 'Madrid',
      codigoPostal: '28046',
      email: 'facturacion@volkern.com',
      monedaPredeterminada: 'EUR',
      esPrincipal: true,
      activo: true
    }
  });

  // 3. Crear facturas encadenadas
  const invoiceData = [
    { numero: 'FAC-2026-001', monto: 1210.0, fecha: new Date('2026-04-10') },
    { numero: 'FAC-2026-002', monto: 500.0, fecha: new Date('2026-04-12') },
    { numero: 'FAC-2026-003', monto: 150.0, fecha: new Date('2026-04-15') }
  ];

  let prevFingerprint = GENESIS_FINGERPRINT;

  for (let i = 0; i < invoiceData.length; i++) {
    const data = invoiceData[i];
    const sequence = i + 1;

    const hash = generateInvoiceHash({
      tenantId,
      emisorNif,
      receptorNif: nifReceptor,
      numero: data.numero,
      fechaEmision: data.fecha.toISOString(),
      monto: data.monto,
      moneda: 'EUR',
      parentFingerprint: prevFingerprint
    });

    await prisma.invoice.create({
      data: {
        tenantId,
        contactId,
        numero: data.numero,
        sequenceNumber: sequence,
        fechaEmision: data.fecha,
        fechaVencimiento: new Date(data.fecha.getTime() + 30 * 24 * 60 * 60 * 1000),
        monto: data.monto,
        moneda: 'EUR',
        estado: 'emitida',
        isSealed: true,
        verifactuVersion: 2,
        fingerprint: hash,
        parentFingerprint: prevFingerprint
      }
    });

    console.log(`✅ Creada Invoice ${data.numero} - Hash: ${hash.substring(0, 10)}...`);
    prevFingerprint = hash;
  }

  console.log('✅ Semilla completada.');
}

seedInvoices('cmo09jrkc0000mf0ebul7xe9q', 'cmo09jy0l0001mf0edx65g67g')
  .catch(console.error);
