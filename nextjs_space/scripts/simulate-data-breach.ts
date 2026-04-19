import { prisma } from '../lib/db';

async function corruptDatabase() {
  console.log('🚨 Iniciando Simulacro de Brecha de Seguridad (Data Corruption)...');

  // Intentamos corromper la Factura SEC-2026-002
  // Cambiamos el monto de 2500.00 a 3500.00 directamente en la tabla
  // Usamos $executeRaw para bypasser la extensión de bloqueo de Prisma
  
  const affected = await prisma.$executeRaw`
    UPDATE invoices 
    SET monto = 3500.00 
    WHERE numero = 'SEC-2026-002' 
    AND "tenantId" = 'cmo16k1ne0000mfgazm0imtgg';
  `;

  if (affected > 0) {
    console.log('💀 [CORRUPCIÓN EXITOSA] El monto de SEC-2026-002 ha sido manipulado directamente en la DB.');
    console.log('⚠️  El hash guardado ya NO coincide con el estado actual de los datos.');
  } else {
    console.error('❌ Error: No se pudo encontrar la factura para corromper.');
  }
}

corruptDatabase().catch(console.error);
