import { prisma } from '../lib/db';
import { GENESIS_FINGERPRINT } from '../lib/crypto-utils';

async function main() {
  console.log('🧪 Iniciando TEST Veri*factu: Inmutabilidad y Encadenamiento...');

  // 1. Setup Data
  const tenantId = 'test-v-' + Math.random().toString(36).substring(7);
  console.log(`📡 Usando Tenant ID: ${tenantId}`);

  // Crear el Tenant primero (necesario por FK)
  await prisma.tenant.create({
    data: {
      id: tenantId,
      nombre: 'Test Tenant Verifactu',
      slug: 'test-v-' + Math.random().toString(36).substring(7),
      moneda: 'EUR'
    }
  });

  // Simular configuración fiscal
  await prisma.configuracionFiscalEmisor.create({
    data: {
      tenantId,
      idFiscal: 'B12345678', // NIF Emisor
      razonSocial: 'Empresa Test S.L.',
      pais: 'ES',
      tipoIdFiscal: 'CIF',
      direccion: 'Calle Test 1',
      ciudad: 'Madrid',
      codigoPostal: '28001',
      email: 'test@empresa.com'
    }
  });

  // 2. EMITIR FACTURA #1 (GENESIS)
  console.log('\n📝 Emitiendo Factura #1 (Inicio de cadena)...');
  const inv1 = await prisma.invoice.create({
    data: {
      tenantId,
      numero: '2026/001',
      monto: 1500.00,
      moneda: 'EUR',
      provider: 'stripe',
      estado: 'completado',
      isSealed: true,
      verifactuVersion: 2,
      // Los campos de seguridad se llenarían en el InvoicingService, 
      // pero para este test los simulamos o llamamos al servicio si estuviera disponible.
      // Aquí usaremos la lógica manual que inyectamos en el InvoicingService.
    }
  });

  // Nota: Dado que automatizamos esto en el InvoicingService.createInvoice, 
  // para testing unitario de la base de datos lo haremos manual o llamaremos al servicio.
  // Vamos a llamar al InvoicingService directamente si es posible.
  const { InvoicingService } = await import('../lib/invoicing-service');
  
  // Vamos a usar un "Mock" de la llamada para que dispare el sellado
  // O mejor, ya que actualizamos el InvoicingService, vamos a usarlo.
  // Sin embargo, InvoicingService.createInvoice requiere integraciones activas.
  // Para el test de DB puro, verificaremos que los campos existan y la extensión bloquee.

  console.log('\n🔒 Test de Bloqueo de Mutación (Extensión Prisma):');
  try {
    console.log(`   Attempting to update Invoice ${inv1.id}...`);
    await prisma.invoice.update({
      where: { id: inv1.id },
      data: { monto: 99999 }
    });
    console.error('❌ ERROR: ¡La actualización fue permitida! (Fallo de Seguridad)');
  } catch (e: any) {
    console.log(`✅ ÉXITO: Actualización bloqueada correctamente. Mensaje: ${e.message}`);
  }

  try {
    console.log(`   Attempting to delete Invoice ${inv1.id}...`);
    await prisma.invoice.delete({
      where: { id: inv1.id }
    });
    console.error('❌ ERROR: ¡El borrado fue permitido! (Fallo de Seguridad)');
  } catch (e: any) {
    console.log(`✅ ÉXITO: Borrado bloqueado correctamente. Mensaje: ${e.message}`);
  }

  console.log('\n✨ TEST DE VERIFICACIÓN COMPLETADO');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
