import { prisma } from '../lib/db';
import { generateInvoiceHash, GENESIS_FINGERPRINT } from '../lib/crypto-utils';

/**
 * Script de Auditoría Forense Veri*factu
 * Verifica la integridad criptográfica de la cadena de facturación para un tenant.
 * Detecta: Manipulaciones de datos (Breach) y Saltos en la numeración (Gap).
 */
async function auditChain(tenantId: string) {
  console.log(`\n🔍 Iniciando auditoría forense para Tenant: ${tenantId}...`);
  console.log(`----------------------------------------------------------`);
  
  // 1. Obtener NIF del Emisor (Necesario para re-calcular el hash)
  const configFiscal = await prisma.configuracionFiscalEmisor.findFirst({
    where: { tenantId }
  });

  if (!configFiscal) {
    console.error('❌ ERROR: El tenant no tiene configuración fiscal configurada.');
    return;
  }

  const emisorNif = configFiscal.idFiscal || 'NIF-PENDIENTE';

  // 2. Obtener todas las facturas de la era Veri*factu (v2) en orden
  const invoices = await prisma.invoice.findMany({
    where: { 
      tenantId, 
      verifactuVersion: 2 
    },
    orderBy: { sequenceNumber: 'asc' },
    include: {
        contact: {
            include: {
                perfilFiscal: true
            }
        }
    }
  });

  if (invoices.length === 0) {
    console.log('⚠️ No se encontraron facturas Veri*factu (v2) para este tenant.');
    return;
  }

  let previousFingerprint = GENESIS_FINGERPRINT;
  let errors = 0;
  let gaps = 0;
  let expectedSequence = 1;

  for (const invoice of invoices) {
    // A. Verificación de Saltos de Secuencia (Gap Detection)
    if (invoice.sequenceNumber !== expectedSequence) {
      console.error(`🚨 GAP DETECTADO: Se esperaba secuencia ${expectedSequence} pero se encontró ${invoice.sequenceNumber} (Factura: ${invoice.numero})`);
      gaps++;
      expectedSequence = (invoice.sequenceNumber || 0) + 1;
    } else {
      expectedSequence++;
    }

    // B. Re-cálculo del Hash (Integrity Check)
    // El receptorNif viene del PerfilFiscalCliente asociado al Contacto de la factura
    const receptorNif = invoice.contact?.perfilFiscal?.idFiscal || '';

    const calculatedHash = generateInvoiceHash({
      tenantId: invoice.tenantId,
      emisorNif: emisorNif,
      receptorNif: receptorNif,
      numero: invoice.numero,
      fechaEmision: invoice.fechaEmision.toISOString(),
      monto: invoice.monto,
      moneda: invoice.moneda,
      parentFingerprint: previousFingerprint
    });

    // C. Comparación
    if (calculatedHash !== invoice.fingerprint) {
      console.error(`❌ BREACH DE INTEGRIDAD: La factura ${invoice.numero} ha sido manipulada.`);
      console.error(`   - Hash DB: ${invoice.fingerprint}`);
      console.error(`   - Hash Calculado: ${calculatedHash}`);
      errors++;
    } else {
      console.log(`✅ [OK] Factura ${invoice.numero} (Secuencia: ${invoice.sequenceNumber}) - Hash Válido.`);
    }

    // El fingerprint actual será el parent de la siguiente
    previousFingerprint = invoice.fingerprint || '';
  }

  console.log(`----------------------------------------------------------`);
  if (errors === 0 && gaps === 0) {
    console.log(`🏆 AUDITORÍA COMPLETADA: CADENA ÍNTEGRA. El tenant cumple con Veri*factu.`);
  } else {
    console.warn(`⚠️ AUDITORÍA FINALIZADA CON ALERTAS:`);
    console.warn(`   - Peligros de Integridad (Breaches): ${errors}`);
    console.warn(`   - Saltos de Secuencia (Gaps): ${gaps}`);
    console.warn(`❗ Se recomienda revisión inmediata de los registros en la base de datos.`);
  }
}

// Ejecución desde CLI
const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Uso: npx tsx scripts/audit-tenant-chain.ts <tenantId>');
  process.exit(1);
}

auditChain(tenantId)
  .catch(err => {
    console.error('Error fatal durante la auditoría:', err);
    process.exit(1);
  });
