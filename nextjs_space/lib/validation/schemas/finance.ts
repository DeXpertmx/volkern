import { z } from 'zod';

// ─── Telephony / Zadarma ────────────────────────────────────

export const ZadarmaTestSchema = z.object({
  apiKey: z.string().min(1, 'API Key es requerida'),
  apiSecret: z.string().min(1, 'API Secret es requerido'),
});

export const ZadarmaCallbackSchema = z.object({
  destination: z.string().min(1, 'Destination number is required'),
});

export const TelephonyConfigSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  fromExtension: z.string().optional(),
  recordingEnabled: z.boolean().optional().default(true),
  activo: z.boolean().optional().default(true),
});

// ─── Stripe Invoicing ────────────────────────────────────────

export const StripeInvoicingConfigSchema = z.object({
  activo: z.boolean().optional(),
});

// ─── External Invoicing ──────────────────────────────────────

const InvoiceItemSchema = z.object({
  name: z.string().min(1, 'Nombre del item requerido'),
  quantity: z.coerce.number().min(1, 'Cantidad mínima 1').default(1),
  price: z.coerce.number().min(0.01, 'Precio debe ser positivo'),
  taxRate: z.coerce.number().min(0).max(100).default(21),
});

export const ExternalInvoiceCreateSchema = z.object({
  leadId: z.string().optional(),
  contactId: z.string().optional(),
  amount: z.coerce.number().positive('amount debe ser un número positivo'),
  currency: z.string().length(3).optional().default('EUR'),
  description: z.string().optional().default('Factura externa'),
  items: z.array(InvoiceItemSchema).optional(),
  dueDate: z.string().datetime().optional(),
}).refine(
  (data) => data.leadId || data.contactId,
  { message: 'leadId o contactId es requerido', path: ['leadId'] }
);

// ─── Expense Verification ────────────────────────────────────

export const VerifyExpenseSchema = z.object({
  expenseId: z.string().min(1, 'expenseId es requerido'),
  action: z.enum(['VALIDATE', 'REJECT'], {
    required_error: 'action es requerido (VALIDATE o REJECT)',
    invalid_type_error: 'action debe ser VALIDATE o REJECT',
  }),
  metadata: z.object({
    comments: z.string().optional(),
    overrideLocation: z.boolean().optional(),
  }).optional(),
});
