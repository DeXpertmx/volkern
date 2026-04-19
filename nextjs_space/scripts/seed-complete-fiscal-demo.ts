import { prisma } from '../lib/db';
import { generateInvoiceHash, GENESIS_FINGERPRINT } from '../lib/crypto-utils';

async function seedEverything() {
  console.log('🚀 Iniciando Sembrado Completo para Demo Fiscal...');

  // 1. Crear o Buscar Tenant (Fresco para evitar bloqueo de borrado de facturas)
  const suffix = Date.now().toString().slice(-4);
  const tenantSlug = `demo-fiscal-${suffix}`;
  
  const tenant = await prisma.tenant.create({
    data: {
      nombre: `Demo Fiscal Corp ${suffix}`,
      slug: tenantSlug,
      plan: 'profesional',
      estado: 'activo'
    }
  });
  const tenantId = tenant.id;

  // 2. Crear Contacto
  const contact = await prisma.contact.create({
    data: {
      tenantId,
      nombre: 'Juan Perez Finanzas',
      email: 'juan@demo.com',
      tipo: 'person'
    }
  });

  // 3. Crear Perfil Fiscal del Cliente
  const nifReceptor = '12345678Z';
  await prisma.perfilFiscalCliente.create({
    data: {
      tenantId,
      contactId: contact.id,
      tipo: 'AUTONOMO',
      tipoIdFiscal: 'NIF',
      nif: nifReceptor,
      razonSocial: 'Juan Perez Fiscal Autonomo',
      country: 'ES',
      address: 'Paseo de la Castellana 50',
      city: 'Madrid',
      zipCode: '28001'
    }
  });

  // 4. Crear Emisor
  const emisorNif = 'B98765432';
  await prisma.configuracionFiscalEmisor.create({
    data: {
      tenantId,
      razonSocial: 'Volkern Secure Systems SL',
      idFiscal: emisorNif,
      tipoIdFiscal: 'CIF',
      pais: 'ES',
      direccion: 'Av. Diagonal 400',
      ciudad: 'Barcelona',
      codigoPostal: '08001',
      email: 'facturas@volkern.secure',
      monedaPredeterminada: 'EUR',
      esPrincipal: true,
      activo: true
    }
  });

  // 5. Crear Facturas Encadenadas
  const invoiceData = [
    { numero: 'SEC-2026-001', monto: 1000.0, fecha: new Date('2026-04-01') },
    { numero: 'SEC-2026-002', monto: 2500.0, fecha: new Date('2026-04-05') },
    { numero: 'SEC-2026-003', monto: 800.0, fecha: new Date('2026-04-10') }
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
        contactId: contact.id,
        provider: 'INTERNAL',
        numero: data.numero,
        sequenceNumber: sequence,
        fechaEmision: data.fecha,
        fechaVencimiento: new Date(data.fecha.getTime() + 15 * 24 * 60 * 60 * 1000),
        monto: data.monto,
        moneda: 'EUR',
        estado: 'emitida',
        isSealed: true,
        verifactuVersion: 2,
        fingerprint: hash,
        parentFingerprint: prevFingerprint
      }
    });

    console.log(`✅ [OK] Invoice ${data.numero} - Cryptographically Linked.`);
    prevFingerprint = hash;
  }

  console.log(`\n🏆 DEMO SEEDED. Tenant ID: ${tenantId}`);
}

seedEverything().catch(console.error);
