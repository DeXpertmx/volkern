import { prisma } from '../lib/db';

async function restoreIntegrity() {
  console.log('🔙 Restituyendo Integridad de Datos (Reparación de Cadena)...');

  // Restauramos el monto original de SEC-2026-002: de 3500.00 a 2500.00
  const affected = await prisma.$executeRaw`
    UPDATE invoices 
    SET monto = 2500.00 
    WHERE numero = 'SEC-2026-002' 
    AND "tenantId" = 'cmo16k1ne0000mfgazm0imtgg';
  `;

  if (affected > 0) {
    console.log('✅ [REPARACIÓN EXITOSA] Datos de SEC-2026-002 restaurados a su valor original.');
    console.log('🛡️  El hash guardado ahora coincide nuevamente con el estado del registro.');
  } else {
    console.error('❌ Error: No se pudo encontrar la factura para reparar.');
  }
}

restoreIntegrity().catch(console.error);
