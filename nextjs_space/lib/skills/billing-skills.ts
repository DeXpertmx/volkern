import { prisma } from '@/lib/db';
import { InvoicingService } from '@/lib/invoicing-service';
import { trackSkillExecution } from './observability';

/**
 * Billing & Invoicing Skills (Veri*factu 2026 Compliance)
 */

export interface CreateInvoiceInput {
  tenantId: string;
  leadId?: string;
  contactId?: string;
  amount: number;
  currency?: string;
  description?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    description?: string;
    taxRate?: number;
  }>;
}

/**
 * Generar una factura legal
 */
export async function create_invoice(input: CreateInvoiceInput) {
  return await trackSkillExecution('create_invoice', async () => {
    return await InvoicingService.createInvoice(input as any);
  });
}

/**
 * Rectificar una factura existente
 */
export async function rectify_invoice(input: { tenantId: string; invoiceId: string; reason: string; amount?: number }) {
  return await trackSkillExecution('rectify_invoice', async () => {
    return await InvoicingService.rectifyInvoice(input.invoiceId, { 
      reason: input.reason, 
      amount: input.amount 
    });
  });
}

/**
 * Anular una factura
 */
export async function cancel_invoice(input: { tenantId: string; invoiceId: string }) {
  return await trackSkillExecution('cancel_invoice', async () => {
    return await InvoicingService.cancelInvoice(input.invoiceId);
  });
}

/**
 * Consultar estado fiscal de una factura
 */
export async function get_invoice_fiscal_status(input: { tenantId: string; invoiceId: string }) {
  return await trackSkillExecution('get_invoice_fiscal_status', async () => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        numero: true,
        fiscalStatus: true,
        isSealed: true,
        fingerprint: true,
        verifactuVersion: true
      }
    });
    return invoice;
  });
}
