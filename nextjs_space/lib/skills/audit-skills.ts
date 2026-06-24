import { prisma } from '@/lib/db';
import { FiscalAuditService } from '../fiscal/audit-service';
import { ExpenseIntegrityService } from '../finance/expense-integrity';
import { sendTelegramMessage, loadTelegramCredentials } from '../telegram';
import { skillsLogger } from './observability';
import { EntryManager } from '../accounting/entry-manager';

/**
 * SKILL: audit_finance_integrity
 * Auditoría forense automatizada para Veri*factu.
 * Detecta brechas de integridad y dispara el Protocolo de Desconfianza.
 */
export async function audit_finance_integrity({ tenantId }: { tenantId: string }) {
  const resultInvoices = await FiscalAuditService.auditTenant(tenantId);
  
  // Auditar Gastos (Expenses)
  const expenses = await prisma.expense.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const expenseBreaches: string[] = [];
  for (let i = 0; i < expenses.length - 1; i++) {
    const current = expenses[i];
    const next = expenses[i + 1];

    if (current.parentFingerprint && current.parentFingerprint !== next.fingerprint) {
      expenseBreaches.push(`Discontinuidad en Gastos: El gasto ${current.id} reporta como padre el hash del gasto previo, pero no coincide.`);
    }
  }

  // Auditar Libro Diario (Accounting Ledger)
  const ledgerAudit = await EntryManager.verifyLedgerIntegrity(tenantId);
  const ledgerBreaches = ledgerAudit.breaches.map(b => b.reason);

  const isCompromised = resultInvoices.status === 'COMPROMETIDA' || expenseBreaches.length > 0 || !ledgerAudit.isValid;

  if (isCompromised) {
    const message = `🚨 <b>PROTOCOLO DE DESCONFIANZA ACTIVADO</b>\n\nBrecha de integridad detectada en Veri*factu para el tenant ${tenantId}.\n\nInfracciones Facturas: ${resultInvoices.breaches.length}\nInfracciones Gastos: ${expenseBreaches.length}\nInfracciones Libro Diario: ${ledgerBreaches.length}`;

    // 1. Crear Alerta de Sistema Urgente
    await prisma.systemAlert.create({
      data: {
        level: 'URGENT',
        message: `BRECHA DE INTEGRIDAD VERI*FACTU: ${tenantId}`,
        auditId: `audit-${Date.now()}`
      }
    });

    // 2. Notificación Inmediata vía Telegram
    const creds = await (loadTelegramCredentials as any)(tenantId);
    if (creds?.admin_chat_id) {
      await sendTelegramMessage(creds.admin_chat_id, message, creds.bot_token);
    }

    skillsLogger.error(`[ForensicAudit] Brecha detectada`, { tenantId, breaches: [...resultInvoices.breaches, ...expenseBreaches, ...ledgerBreaches] } as any);
  }

  return {
    status: isCompromised ? 'COMPROMETIDA' : 'ÍNTEGRA',
    invoiceAudit: resultInvoices,
    expenseBreaches,
    ledgerAudit,
    timestamp: new Date().toISOString()
  };
}
