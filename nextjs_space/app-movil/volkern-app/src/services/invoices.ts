import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: 'cash' | 'transfer' | 'card' | 'other';
  reference: string;
  paidAt: number;
  notes: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  notes: string;
  terms: string;
  dueDate: number;
  issuedAt: number;
  paidAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface InvoiceStats {
  total: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  byStatus: Record<InvoiceStatus, number>;
  averageValue: number;
  paidCount: number;
  overdueCount: number;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'volkern_invoices';
const PAYMENTS_KEY = 'volkern_invoice_payments';

export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: '#6B7280',
  sent: '#3B82F6',
  paid: '#10B981',
  overdue: '#EF4444',
  cancelled: '#F97316',
};

export function getNextInvoiceNumber(invoices: Invoice[]): string {
  if (invoices.length === 0) return 'F-0001';
  const nums = invoices.map(inv => {
    const m = inv.number.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return `F-${String(Math.max(...nums, 0) + 1).padStart(4, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateNumber(idx: number): string {
  const year = new Date().getFullYear();
  return `F-${year}-${String(idx + 1).padStart(4, '0')}`;
}

function calcTotals(items: InvoiceItem[], taxRate: number, discount: number): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax - discount;
  return { subtotal, tax, total };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class InvoicesService {
  // ── CRUD ──────────────────────────────────────────────────────────────

  async getAll(): Promise<Invoice[]> {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Invoice[];
    } catch { /* ignore */ }
    return [];
  }

  async getById(id: string): Promise<Invoice | null> {
    const all = await this.getAll();
    return all.find(inv => inv.id === id) || null;
  }

  async getByStatus(status: InvoiceStatus): Promise<Invoice[]> {
    const all = await this.getAll();
    return all.filter(inv => inv.status === status)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async search(query: string): Promise<Invoice[]> {
    const all = await this.getAll();
    const lower = query.toLowerCase();
    return all.filter(inv =>
      inv.number.toLowerCase().includes(lower) ||
      inv.clientName.toLowerCase().includes(lower) ||
      inv.clientEmail.toLowerCase().includes(lower)
    );
  }

  async create(data: Omit<Invoice, 'id' | 'number' | 'createdAt' | 'updatedAt'>): Promise<Invoice> {
    const all = await this.getAll();
    const invoice: Invoice = {
      ...data,
      id: generateId(),
      number: generateNumber(all.length),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(invoice);
    await this.persist(all);
    return invoice;
  }

  async update(id: string, data: Partial<Omit<Invoice, 'id' | 'number' | 'createdAt'>>): Promise<Invoice | null> {
    const all = await this.getAll();
    const idx = all.findIndex(inv => inv.id === id);
    if (idx === -1) return null;

    if (data.items) {
      const totals = calcTotals(data.items, data.taxRate ?? all[idx].taxRate, data.discount ?? all[idx].discount);
      data = { ...data, ...totals };
    }

    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    await this.persist(all);
    return all[idx];
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    await this.persist(all.filter(inv => inv.id !== id));
    // Remove associated payments
    const payments = await this.getAllPayments();
    await this.persistPayments(payments.filter(p => p.invoiceId !== id));
  }

  // ── Status ────────────────────────────────────────────────────────────

  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice | null> {
    return this.update(id, { status });
  }

  async markSent(id: string): Promise<Invoice | null> {
    return this.update(id, { status: 'sent' });
  }

  async markPaid(id: string, payment: Omit<Payment, 'id' | 'invoiceId'>): Promise<Invoice | null> {
    const all = await this.getAll();
    const idx = all.findIndex(inv => inv.id === id);
    if (idx === -1) return null;

    const payments = await this.getAllPayments();
    const newPayment: Payment = {
      ...payment,
      id: generateId(),
      invoiceId: id,
    };
    payments.push(newPayment);
    await this.persistPayments(payments);

    all[idx] = {
      ...all[idx],
      status: 'paid',
      paidAt: payment.paidAt,
      updatedAt: Date.now(),
    };
    await this.persist(all);
    return all[idx];
  }

  async markOverdue(id: string): Promise<Invoice | null> {
    return this.update(id, { status: 'overdue' });
  }

  async markCancelled(id: string): Promise<Invoice | null> {
    return this.update(id, { status: 'cancelled' });
  }

  // ── Payments ──────────────────────────────────────────────────────────

  async getPayments(invoiceId: string): Promise<Payment[]> {
    const all = await this.getAllPayments();
    return all.filter(p => p.invoiceId === invoiceId)
      .sort((a, b) => b.paidAt - a.paidAt);
  }

  async deletePayment(id: string): Promise<void> {
    const all = await this.getAllPayments();
    await this.persistPayments(all.filter(p => p.id !== id));
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getStats(): Promise<InvoiceStats> {
    const all = await this.getAll();
    const totalAmount = all.reduce((sum, inv) => sum + inv.total, 0);
    const paidAmount = all.filter(inv => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.total, 0);
    const outstandingAmount = all.filter(inv => inv.status === 'sent' || inv.status === 'draft')
      .reduce((sum, inv) => sum + inv.total, 0);
    const overdueAmount = all.filter(inv => inv.status === 'overdue')
      .reduce((sum, inv) => sum + inv.total, 0);
    const byStatus = {
      draft: all.filter(inv => inv.status === 'draft').length,
      sent: all.filter(inv => inv.status === 'sent').length,
      paid: all.filter(inv => inv.status === 'paid').length,
      overdue: all.filter(inv => inv.status === 'overdue').length,
      cancelled: all.filter(inv => inv.status === 'cancelled').length,
    };

    return {
      total: all.length,
      totalAmount,
      paidAmount,
      outstandingAmount,
      overdueAmount,
      byStatus,
      averageValue: all.length > 0 ? totalAmount / all.length : 0,
      paidCount: byStatus.paid,
      overdueCount: byStatus.overdue,
    };
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async persist(items: Invoice[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(items));
    } catch {
      console.error('[InvoicesService] Error saving invoices');
    }
  }

  private async getAllPayments(): Promise<Payment[]> {
    try {
      const raw = await SecureStore.getItemAsync(PAYMENTS_KEY);
      if (raw) return JSON.parse(raw) as Payment[];
    } catch { /* ignore */ }
    return [];
  }

  private async persistPayments(items: Payment[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(PAYMENTS_KEY, JSON.stringify(items));
    } catch {
      console.error('[InvoicesService] Error saving payments');
    }
  }
}

export const invoicesService = new InvoicesService();
