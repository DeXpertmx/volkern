import { prisma } from '../lib/db';
import { InvoicingService } from '../lib/invoicing-service';
import { GENESIS_FINGERPRINT } from '../lib/crypto-utils';
import { FiscalAuditService } from '../lib/fiscal/audit-service';

async function testVerifactu() {
  console.log('🚀 INICIANDO BATERÍA DE PRUEBAS VERI*FACTU\n');

  const tenantId = 'verifactu-test-' + Math.random().toString(36).substring(7);
  
  // 1. Setup Tenant y Configuración
  await prisma.tenant.create({
    data: {
      id: tenantId,
      nombre: 'Veri*Factu Test Corp',
      slug: tenantId,
      moneda: 'EUR'
    }
  });

  await prisma.configuracionFiscalEmisor.create({
    data: {
      tenantId,
      idFiscal: 'B12345678',
      tipoIdFiscal: 'CIF',
      razonSocial: 'Volkern Test S.L.',
      pais: 'ES',
      direccion: 'Calle de la Prueba 123',
      ciudad: 'Madrid',
      codigoPostal: '28001',
      email: 'fiscal@test.com',
      verifactuEnabled: true,
      activo: true
    }
  });

  await prisma.integration.create({
    data: {
      tenantId,
      tipo: 'mock_billing',
      nombre: 'Mock Billing',
      conectado: true,
      activo: true,
      credenciales: {}
    }
  });

  // Helper para crear un lead con perfil fiscal
  const createTestLead = async (nombre: string, nif: string, country = 'ES', extra = {}) => {
    const lead = await prisma.lead.create({
      data: {
        tenantId,
        nombre,
        email: `${nombre.toLowerCase().replace(/ /g, '.')}@test.com`,
        ...extra
      }
    });
    await prisma.perfilFiscalCliente.create({
      data: {
        tenantId,
        leadId: lead.id,
        nif,
        tipoIdFiscal: 'NIF',
        razonSocial: nombre,
        country
      }
    });
    return lead;
  };

  const leadES = await createTestLead('Cliente Español', '12345678Z');
  const leadEU = await createTestLead('Cliente Alemán', 'DE123456789', 'DE', { ubicacion: 'Berlin, DE' });

  // --- CASOS BÁSICOS ---
  console.log('🔹 CASO: Alta de factura válida (IVA 21%)');
  const inv1 = await InvoicingService.createInvoice({
    tenantId,
    leadId: leadES.id,
    amount: 121,
    items: [{ name: 'Servicio Base', quantity: 1, price: 100, taxRate: 21 }]
  });
  console.log(`✅ Factura ${inv1.numero} creada. Fingerprint: ${inv1.fingerprint?.substring(0, 10)}...`);

  const leadSimplificada = await createTestLead('Publico General', '99999999R');

  console.log('\n🔹 CASO: Factura simplificada');
  const inv2 = await InvoicingService.createInvoice({
    tenantId,
    leadId: leadSimplificada.id,
    amount: 50,
    description: 'Venta simplificada p. general',
    items: [{ name: 'Producto', quantity: 1, price: 50, taxRate: 21 }]
  });
  console.log(`✅ Factura simplificada ${inv2.numero} creada.`);

  // --- CASOS CRÍTICOS ---
  console.log('\n🔹 CASO: Envío duplicado (Mismo Número)');
  try {
    // Forzamos el mismo número simulando un error de concurrencia o lógica
    // Nota: El InvoicingService genera números únicos, pero si intentamos crear una con el mismo número:
    await prisma.invoice.create({
      data: {
        tenantId,
        numero: inv1.numero, // Duplicado
        monto: 100,
        provider: 'mock',
        isSealed: true
      }
    });
    console.error('❌ ERROR: Se permitió duplicar el número de factura');
  } catch (e) {
    console.log('✅ ÉXITO: El sistema rechazó la factura duplicada (Unique Constraint).');
  }

  console.log('\n🔹 CASO: Cliente extranjero (NIF EU)');
  const invEU = await InvoicingService.createInvoice({
    tenantId,
    leadId: leadEU.id,
    amount: 100,
    items: [{ name: 'Consultoría Intracomunitaria', quantity: 1, price: 100, taxRate: 0 }]
  });
  console.log(`✅ Factura ${invEU.numero} (EU) creada.`);

  console.log('\n🔹 CASO: Factura rectificativa');
  const invRect = await InvoicingService.rectifyInvoice(inv1.id, { reason: 'Error en precio' });
  console.log(`✅ Factura rectificativa ${invRect.numero} creada.`);

  console.log('\n🔹 CASO: Factura anulada');
  const invAnul = await InvoicingService.cancelInvoice(inv2.id);
  console.log(`✅ Factura ${inv2.numero} marcada como anulada.`);

  // --- CASOS TÉCNICOS ---
  console.log('\n🔹 CASO: Verificación de encadenamiento (Chain Integrity)');
  const audit = await FiscalAuditService.auditTenant(tenantId);
  console.log(`📊 Resultado Auditoría: ${audit.status}`);
  if (audit.status === 'ÍGTEGRA') {
    console.log('✅ Cadena de confianza verificada correctamente.');
  } else {
    console.error('❌ ERROR: La cadena está rota:', audit.breaches);
  }

  console.log('\n🔹 CASO: Intento de alteración (Inmutabilidad)');
  try {
    await prisma.invoice.update({
      where: { id: inv1.id },
      data: { monto: 0.01 }
    });
    console.error('❌ ERROR: ¡Se permitió modificar una factura sellada!');
  } catch (e: any) {
    console.log('✅ ÉXITO: Modificación bloqueada por middleware/trigger.');
  }

  console.log('\n✨ PRUEBAS FINALIZADAS');
}

testVerifactu().catch(console.error);
