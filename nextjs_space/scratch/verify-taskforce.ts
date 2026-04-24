import { prisma } from '../lib/db';
import { SupportService } from '../lib/support/support-service';
import { SupportSLAMonitor } from '../lib/support/sla-monitor';
import { AuditService } from '../lib/audit-service';
import crypto from 'crypto';

/**
 * SCRIPT DE VERIFICACIÓN TÉCNICA - VOLKERN TASKFORCE SLA
 */
async function runVerification() {
  console.log('--- INICIANDO VERIFICACIÓN TASKFORCE ---');

  // 1. Sanity Check: Backfill de Tickets
  const missingSla = await prisma.supportTicket.count({
    where: { slaDueAt: null }
  });
  console.log(`[Sanity] Tickets sin slaDueAt: ${missingSla}`);

  // 2. Test E2E: Simulación de Ticket Crítico y Escalado
  console.log('\n[E2E] Simulando flujo de Ticket CRITICAL...');
  const testTenantId = 'cmo0axgu30000mfux54c6mb30'; 
  const testUserId = 'cmo3hy4jo0001mft4wro0s30b';

  try {
    const ticket = await SupportService.createTicket({
      tenantId: testTenantId,
      creatorId: testUserId,
      subject: 'ERROR CRÍTICO: Fallo en pasarela de pagos',
      description: 'Los clientes no pueden finalizar compras en el sitio web.',
      priority: 'CRITICAL',
      source: 'SYSTEM'
    });
    console.log(`[E2E] Ticket creado: ${ticket.id}. Prioridad: ${ticket.priority}`);
    console.log(`[E2E] SLA Due At original: ${ticket.slaDueAt}`);

    // Forzar BREACH (slaDueAt en el pasado)
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { slaDueAt: new Date(Date.now() - 3600000) } // 1 hora hace
    });
    
    console.log('[E2E] Ejecutando monitor de SLAs para BREACH...');
    await SupportSLAMonitor.monitorTenantSLAs(testTenantId);
    
    const breachedTicket = await prisma.supportTicket.findUnique({ where: { id: ticket.id } });
    console.log(`[E2E] Estado SLA tras monitor: ${breachedTicket?.slaState}`);
    console.log(`[E2E] Escalado a: ${breachedTicket?.escalatedTo}`);

  } catch (e) {
    console.error('[E2E] Error en simulación:', e);
  }

  // 3. Verificación Forense de Sellos (HMAC)
  console.log('\n[Forense] Verificando integridad de sellos AuditLog...');
  const lastAudit = await prisma.auditLog.findFirst({
    where: { accion: 'SUPPORT_SLA_BREACH_CRITICAL' },
    orderBy: { fechaCreacion: 'desc' }
  });

  if (lastAudit) {
    const isValid = AuditService.verifySeal(lastAudit);

    if (isValid) {
      console.log('[Forense] VERIFICACIÓN EXITOSA: El sello coincide con el contenido.');
    } else {
      console.error('[Forense] ALERTA: Sello no coincide. Integridad comprometida.');
    }
  } else {
    console.log('[Forense] No se encontraron logs de escalado para verificar.');
  }

  console.log('\n--- VERIFICACIÓN COMPLETADA ---');
}

runVerification().catch(console.error);
