import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { AccountingEventMapper } from './event-mapper';
import { skillsLogger } from '@/lib/skills/observability';

/**
 * Initializes the accounting event listeners.
 */
export function initializeAccountingListeners() {
  // 1. Listen for new invoices to create ledger entries
  eventBus.onEvent(EVENTS.INVOICE_CREATED, async (payload) => {
    try {
      skillsLogger.info(`[Accounting] Processing auto-entry for invoice: ${payload.numero}`, { 
        tenantId: payload.tenantId,
        invoiceId: payload.invoiceId 
      });
      
      await AccountingEventMapper.mapInvoiceToEntry(payload.invoiceId);
      
      skillsLogger.info(`[Accounting] Auto-entry created for invoice: ${payload.numero}`, { 
        tenantId: payload.tenantId 
      });
    } catch (error: any) {
      skillsLogger.error(`[Accounting] Failed to create auto-entry for invoice: ${payload.numero}`, {
        error: error.message,
        tenantId: payload.tenantId
      });
    }
  });

  // 2. Listen for payments to settle debt (Optional, based on flow)
  eventBus.onEvent(EVENTS.PAYMENT_RECEIVED, async (payload) => {
    try {
      // Logic for automatic payment accounting if reference is available
      skillsLogger.info(`[Accounting] Processing payment entry for: ${payload.paymentId}`, { 
        tenantId: payload.tenantId 
      });
      
      // Additional logic would go here to find the matching invoice/debt
    } catch (error: any) {
      skillsLogger.error(`[Accounting] Failed to process payment entry`, {
        error: error.message,
        tenantId: payload.tenantId
      });
    }
  });

  console.log('✅ [Accounting] Listeners de contabilidad automatizada activos');
}
