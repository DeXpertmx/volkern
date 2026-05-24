import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_billing';

// ─── Types ────────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'failed' | 'refunded';

export interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  date: string;
  dueDate: string;
  paidAt: string | null;
  items: { description: string; amount: number; quantity: number }[];
  pdfUrl: string | null;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'transfer' | 'paypal';
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: 'monthly' | 'yearly';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  trialEnd: string | null;
}

export const PLANS = [
  { id: 'starter', name: 'Starter', amount: 0, currency: 'USD', interval: 'monthly' as const },
  { id: 'business', name: 'Business', amount: 29, currency: 'USD', interval: 'monthly' as const },
  { id: 'enterprise', name: 'Enterprise', amount: 99, currency: 'USD', interval: 'monthly' as const },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const billingService = {
  async getSubscription(): Promise<SubscriptionPlan | null> {
    const sub = await getData<SubscriptionPlan>(STORAGE_KEY + '_subscription');
    return sub || null;
  },

  async getInvoices(): Promise<Invoice[]> {
    const invoices = await getData<Invoice[]>(STORAGE_KEY + '_invoices');
    return invoices || [];
  },

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const methods = await getData<PaymentMethod[]>(STORAGE_KEY + '_payment_methods');
    return methods || [];
  },

  async addPaymentMethod(method: Omit<PaymentMethod, 'id'>): Promise<PaymentMethod> {
    const methods = await this.getPaymentMethods();
    const now = Date.now().toString();
    const item: PaymentMethod = { id: generateId(), ...method };
    if (methods.length === 0) item.isDefault = true;
    methods.push(item);
    await saveData(STORAGE_KEY + '_payment_methods', methods);
    return item;
  },

  async removePaymentMethod(id: string): Promise<void> {
    const methods = await this.getPaymentMethods();
    const filtered = methods.filter(m => m.id !== id);
    if (filtered.length > 0 && !filtered.some(m => m.isDefault)) {
      filtered[0].isDefault = true;
    }
    await saveData(STORAGE_KEY + '_payment_methods', filtered);
  },

  async setDefaultPaymentMethod(id: string): Promise<void> {
    const methods = await this.getPaymentMethods();
    methods.forEach(m => { m.isDefault = m.id === id; });
    await saveData(STORAGE_KEY + '_payment_methods', methods);
  },

  async changePlan(planId: string): Promise<void> {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) throw new Error('Invalid plan');
    const existing = await this.getSubscription();
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const sub: SubscriptionPlan = {
      id: existing?.id || generateId(),
      name: plan.name,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      canceledAt: null,
      trialEnd: null,
    };
    await saveData(STORAGE_KEY + '_subscription', sub);
  },

  async cancelSubscription(): Promise<void> {
    const sub = await this.getSubscription();
    if (!sub) return;
    sub.status = 'canceled';
    sub.canceledAt = new Date().toISOString();
    await saveData(STORAGE_KEY + '_subscription', sub);
  },

  async downloadInvoice(id: string): Promise<string | null> {
    const invoices = await this.getInvoices();
    const inv = invoices.find(i => i.id === id);
    return inv?.pdfUrl || null;
  },
};
