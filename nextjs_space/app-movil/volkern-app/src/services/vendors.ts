import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_vendors';

// ─── Types ────────────────────────────────────────────────────────────────────
export type VendorStatus = 'active' | 'inactive' | 'blacklisted';

export interface Vendor {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  status: VendorStatus;
  rating: number;
  notes: string;
  paymentTerms: string;
  createdAt: string;
  updatedAt: string;
}

export const VENDOR_CATEGORIES: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'supplier', label: 'Proveedor', icon: 'cube', color: '#3B82F6' },
  { value: 'manufacturer', label: 'Fabricante', icon: 'build', color: '#10B981' },
  { value: 'distributor', label: 'Distribuidor', icon: 'car', color: '#F59E0B' },
  { value: 'contractor', label: 'Contratista', icon: 'construct', color: '#8B5CF6' },
  { value: 'consultant', label: 'Consultor', icon: 'people', color: '#EC4899' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const vendorsService = {
  async getAll(): Promise<Vendor[]> {
    const items = await getData<Vendor[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<Vendor | null> {
    const items = await this.getAll();
    return items.find(v => v.id === id) || null;
  },

  async create(data: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vendor> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: Vendor = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, data: Partial<Vendor>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(v => v.id === id);
    if (idx === -1) throw new Error('Vendor not found');
    items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(v => v.id === id);
    if (idx === -1) return;
    items.splice(idx, 1);
    await saveData(STORAGE_KEY, items);
  },

  async getStats(): Promise<{ total: number; active: number; avgRating: number }> {
    const items = await this.getAll();
    const active = items.filter(v => v.status === 'active');
    return {
      total: items.length,
      active: active.length,
      avgRating: active.length > 0
        ? active.reduce((sum, v) => sum + v.rating, 0) / active.length
        : 0,
    };
  },
};
