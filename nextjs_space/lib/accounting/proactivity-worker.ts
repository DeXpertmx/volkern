import { prisma } from '@/lib/db';
import { BankingService } from './banking-service';
import { AutoReconciler } from './auto-reconciler';
import { notificationService } from '@/lib/skills/notification-layer';
import { skillsLogger } from '@/lib/skills/observability';

export class AccountingProactivityWorker {
  /**
   * Scans for unreconciled accounting entries and looks for high-confidence bank matches.
   * If found, Gemma sends a proactive notification to the user.
   */
  static async scanForSuggestions() {
    skillsLogger.info('[GemmaAccounting] Starting proactivity scan for reconciliations...');
    
    // 1. Obtener sugerencias del AutoReconciler
    const suggestions = await AutoReconciler.getSuggestions(""); // Se filtrará por tenant en el bucle si es necesario, pero mejor hacerlo por tenant
    
    const tenants = await prisma.tenant.findMany({
      include: {
        users: { where: { role: 'OWNER' }, take: 1 }
      }
    });

    let suggestionsCount = 0;

    for (const tenant of tenants) {
      const tenantSuggestions = await AutoReconciler.getSuggestions(tenant.id);
      
      for (const match of tenantSuggestions) {
        if (match.confidence >= 0.9) {
          const owner = tenant.users[0];
          if (owner) {
            await notificationService.send(
              { type: 'user', id: owner.id },
              {
                title: 'Gemma: Sugerencia de Conciliación',
                body: `He encontrado un cobro en el banco que coincide al ${Math.round(match.confidence * 100)}% con la ${match.entry.description}. ¿Quieres que la concilie ahora?`,
                actions: [
                  { 
                    label: 'Conciliar automáticamente', 
                    url: `/dashboard/finanzas/contabilidad/reconciliacion?transactionId=${match.transactionId}` 
                  }
                ]
              },
              { channel: 'in_app', priority: 'normal' },
              { tenantId: tenant.id, source: 'automation', timestamp: new Date(), correlationId: `gemma-recon-${match.entryId}` }
            );
            suggestionsCount++;
          }
        }
      }
    }

    return { suggestionsCount };
  }

  /**
   * Scans for pending tax liabilities and alerts owners.
   */
  static async scanForTaxAlerts() {
    skillsLogger.info('[GemmaAccounting] Starting scan for tax alerts...');
    
    const tenants = await prisma.tenant.findMany({
      include: {
        users: { where: { role: 'OWNER' }, take: 1 }
      }
    });

    let alertsCount = 0;

    for (const tenant of tenants) {
      const vatDue = await prisma.taxRecord.aggregate({
        where: {
          tenantId: tenant.id,
          type: 'IVA_REPERCUTIDO',
          isFiled: false
        },
        _sum: { taxAmount: true }
      });

      const totalVat = Number(vatDue._sum.taxAmount || 0);

      if (totalVat > 0) {
        const owner = tenant.users[0];
        if (owner) {
          await notificationService.send(
            { type: 'user', id: owner.id },
            {
              title: 'Gemma: Alerta Fiscal',
              body: `Aviso de Caja: Tienes ${totalVat.toFixed(2)}€ en IVA pendiente de declaración para el periodo actual.`,
            },
            { channel: 'in_app', priority: 'high' },
            { tenantId: tenant.id, source: 'automation', timestamp: new Date(), correlationId: `gemma-tax-${tenant.id}` }
          );
          alertsCount++;
        }
      }
    }

    return { alertsCount };
  }
}
