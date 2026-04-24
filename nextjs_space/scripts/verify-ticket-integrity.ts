import crypto from 'crypto';
import { prisma } from '../lib/db';
import { AuditService } from '../lib/audit-service';

/**
 * VOLKERN AUDIT TOOL: VERIFICADOR DE INTEGRIDAD
 * Comprueba si el sello forense de un ticket coincide con los datos en DB.
 */

async function verifyTicketIntegrity(ticketId: string) {
  console.log(`\n🔍 Iniciando auditoría forense para el ticket: ${ticketId}`);

  // 1. Obtener los logs de auditoría vinculados al ticket
  const auditLogs = await prisma.auditLog.findMany({
    where: { 
      entidadId: ticketId,
      entidad: 'SupportTicket'
    },
    orderBy: { fechaCreacion: 'desc' }
  });

  if (auditLogs.length === 0) {
    console.error('❌ Error: No se encontraron registros de auditoría para este ticket.');
    return;
  }

  console.log(`📊 Se encontraron ${auditLogs.length} eventos auditados.\n`);

  let failures = 0;

  for (const log of auditLogs) {
    const isValid = AuditService.verifySeal(log);
    const date = new Date(log.fechaCreacion).toLocaleString();
    
    if (isValid) {
      console.log(`✅ [${date}] ${log.accion}: INTEGRIDAD VERIFICADA.`);
    } else {
      console.error(`🚨 [${date}] ${log.accion}: ALERTA DE INTEGRIDAD - Sello no coincide.`);
      console.error(`   Hash en DB: ${log.hash}`);
      failures++;
    }
  }

  if (failures === 0) {
    console.log('\n✨ Conclusión: Todos los registros son inmutables y válidos.');
  } else {
    console.error(`\n❌ Conclusión: Se detectaron ${failures} posibles manipulaciones de datos.`);
    process.exit(1);
  }
}

// Ejemplo de uso: npx tsx scripts/verify-ticket-integrity.ts tk_abc123
const targetId = process.argv[2];

if (targetId) {
  verifyTicketIntegrity(targetId)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      prisma.$disconnect();
    });
} else {
  console.log('Uso: npx tsx scripts/verify-ticket-integrity.ts <TICKET_ID>');
  process.exit(1);
}
