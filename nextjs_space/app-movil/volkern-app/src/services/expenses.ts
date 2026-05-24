import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_expenses';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'office'
  | 'travel'
  | 'marketing'
  | 'software'
  | 'salary'
  | 'utilities'
  | 'food'
  | 'other';

export type ExpenseType = 'expense' | 'income';

export interface Expense {
  id: string;
  type: ExpenseType;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  notes: string;
  isRecurring: boolean;
  recurringInterval: 'monthly' | 'yearly' | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  type: ExpenseType;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  notes?: string;
  isRecurring?: boolean;
  recurringInterval?: 'monthly' | 'yearly' | null;
}

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: string; color: string }[] = [
  { value: 'office', label: 'Office', icon: 'business', color: '#3B82F6' },
  { value: 'travel', label: 'Travel', icon: 'airplane', color: '#8B5CF6' },
  { value: 'marketing', label: 'Marketing', icon: 'megaphone', color: '#F59E0B' },
  { value: 'software', label: 'Software', icon: 'code-slash', color: '#10B981' },
  { value: 'salary', label: 'Salary', icon: 'people', color: '#EF4444' },
  { value: 'utilities', label: 'Utilities', icon: 'flash', color: '#06B6D4' },
  { value: 'food', label: 'Food', icon: 'fast-food', color: '#F97316' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#64748B' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const expenseService = {
  async getAll(): Promise<Expense[]> {
    const items = await getData<Expense[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<Expense | null> {
    const items = await this.getAll();
    return items.find(i => i.id === id) || null;
  },

  async create(input: CreateExpenseInput): Promise<Expense> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: Expense = {
      id: generateId(),
      ...input,
      notes: input.notes || '',
      isRecurring: input.isRecurring || false,
      recurringInterval: input.recurringInterval || null,
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, input: Partial<CreateExpenseInput>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Expense not found');
    items[idx] = {
      ...items[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const filtered = items.filter(i => i.id !== id);
    await saveData(STORAGE_KEY, filtered);
  },

  async getStats(): Promise<{
    totalExpenses: number;
    totalIncome: number;
    balance: number;
    monthlyExpenses: number;
    monthlyIncome: number;
    categoryTotals: Record<ExpenseCategory, number>;
  }> {
    const items = await this.getAll();
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);

    const monthlyItems = items.filter(i => i.date.startsWith(currentMonth));
    const categoryTotals = {} as Record<ExpenseCategory, number>;
    EXPENSE_CATEGORIES.forEach(c => { categoryTotals[c.value] = 0; });

    items.forEach(i => {
      if (i.type === 'expense') {
        categoryTotals[i.category] = (categoryTotals[i.category] || 0) + i.amount;
      }
    });

    return {
      totalExpenses: items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0),
      totalIncome: items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0),
      balance: items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0) -
               items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0),
      monthlyExpenses: monthlyItems.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0),
      monthlyIncome: monthlyItems.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0),
      categoryTotals,
    };
  },
};
