import { eventBus, EVENTS } from '@/lib/skills/event-bus';
import { AccountingEventMapper } from './event-mapper';
import { skillsLogger } from '@/lib/skills/observability';

// Guard idempotente: Next.js standalone puede instanciar este módulo en
// varios bundles (instrumentation vs app). Sin el guard, cada llamada
// añadiría un listener más y cada evento crearía N asientos.
let accountingListenersInitialized = false;

/**
 * Asegura que los listeners EventBus → Contabilidad estén registrados en
 * EL MISMO bundle que emite el evento. En Next.js standalone el listener
 * registrado desde instrumentation.ts puede vivir en otra instancia del event
 * bus (bundles separados) y nunca recibiría el evento. Los emisores deben
 * llamar a esta función antes de emitir (mismo patrón que
 * ensureAutomationListeners). Idempotente: solo registra una vez por bundle.
 */
export function ensureAccountingListeners(): void {
  if (accountingListenersInitialized) return;
  initializeAccountingListeners();
}

/**
 * Initializes the accounting event listeners.
 */
export function initializeAccountingListeners() {
  if (accountingListenersInitialized) {
    console.log('🟡 [Accounting] Listeners ya inicializados, saltando...');
    return;
  }
  accountingListenersInitialized = true;
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
      } as any);
    }
  });

  // 2. Listen for new expenses to create ledger entries + tax records
  //    (IVA soportado → Modelo 303, retención IRPF → Modelo 111)
  eventBus.onEvent(EVENTS.EXPENSE_CREATED, async (payload) => {
    try {
      skillsLogger.info(`[Accounting] Processing auto-entry for expense: ${payload.expenseId}`, {
        tenantId: payload.tenantId,
      });

      await AccountingEventMapper.mapExpenseToEntry(payload.expenseId);

      skillsLogger.info(`[Accounting] Auto-entry created for expense: ${payload.expenseId}`, {
        tenantId: payload.tenantId,
      });
    } catch (error: any) {
      skillsLogger.error(`[Accounting] Failed to create auto-entry for expense: ${payload.expenseId}`, {
        error: error.message,
        tenantId: payload.tenantId,
      } as any);
    }
  });

  // 3. Listen for generated payrolls to create ledger entries + tax records
  //    (retención IRPF de nóminas → Modelo 111)
  eventBus.onEvent(EVENTS.PAYROLL_GENERATED, async (payload) => {
    try {
      skillsLogger.info(`[Accounting] Processing auto-entry for payroll: ${payload.payrollId}`, {
        tenantId: payload.tenantId,
      });

      await AccountingEventMapper.mapPayrollEsToEntry(payload.payrollId);

      skillsLogger.info(`[Accounting] Auto-entry created for payroll: ${payload.payrollId}`, {
        tenantId: payload.tenantId,
      });
    } catch (error: any) {
      skillsLogger.error(`[Accounting] Failed to create auto-entry for payroll: ${payload.payrollId}`, {
        error: error.message,
        tenantId: payload.tenantId,
      } as any);
    }
  });

  // 4. Listen for payments to settle debt (Optional, based on flow)
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
      } as any);
    }
  });

  console.log('✅ [Accounting] Listeners de contabilidad automatizada activos');
}
