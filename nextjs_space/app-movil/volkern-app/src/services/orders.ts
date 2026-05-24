import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_orders';

// ─── Types ────────────────────────────────────────────────────────────────────
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  id: string;
  product: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  number: string;
  customer: string;
  customerEmail: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const ORDER_STATUSES: { value: OrderStatus; label: string; icon: string; color: string }[] = [
  { value: 'pending', label: 'Pendiente', icon: 'time', color: '#F59E0B' },
  { value: 'confirmed', label: 'Confirmado', icon: 'checkmark-circle', color: '#3B82F6' },
  { value: 'processing', label: 'Procesando', icon: 'cog', color: '#8B5CF6' },
  { value: 'shipped', label: 'Enviado', icon: 'airplane', color: '#06B6D4' },
  { value: 'delivered', label: 'Entregado', icon: 'checkmark-done', color: '#10B981' },
  { value: 'cancelled', label: 'Cancelado', icon: 'close-circle', color: '#EF4444' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function generateNumber(): string {
  const n = Math.floor(Math.random() * 9999) + 1;
  return `ORD-${String(n).padStart(4, '0')}`;
}

export const ordersService = {
  async getAll(): Promise<Order[]> {
    const items = await getData<Order[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<Order | null> {
    const items = await this.getAll();
    return items.find(o => o.id === id) || null;
  },

  async create(data: Omit<Order, 'id' | 'number' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: Order = {
      ...data,
      id: generateId(),
      number: generateNumber(),
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, data: Partial<Order>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(o => o.id === id);
    if (idx === -1) throw new Error('Order not found');
    items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(o => o.id === id);
    if (idx === -1) return;
    items.splice(idx, 1);
    await saveData(STORAGE_KEY, items);
  },

  async getStats(): Promise<{ total: number; pending: number; revenue: number }> {
    const items = await this.getAll();
    return {
      total: items.length,
      pending: items.filter(o => o.status === 'pending').length,
      revenue: items.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0),
    };
  },
};
