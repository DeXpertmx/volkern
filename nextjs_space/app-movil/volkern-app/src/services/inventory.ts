import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_inventory';

// ─── Types ────────────────────────────────────────────────────────────────────
export type MovementType = 'in' | 'out' | 'adjustment';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  quantity: number;
  minStock: number;
  unitPrice: number;
  location: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  reference: string;
  createdAt: string;
}

export const INVENTORY_CATEGORIES: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'raw_materials', label: 'Materia Prima', icon: 'cube', color: '#F59E0B' },
  { value: 'finished_goods', label: 'Producto Terminado', icon: 'gift', color: '#10B981' },
  { value: 'supplies', label: 'Insumos', icon: 'construct', color: '#3B82F6' },
  { value: 'packaging', label: 'Embalaje', icon: 'archive', color: '#8B5CF6' },
  { value: 'equipment', label: 'Equipo', icon: 'hardware-chip', color: '#EC4899' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const inventoryService = {
  async getAll(): Promise<InventoryItem[]> {
    const items = await getData<InventoryItem[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<InventoryItem | null> {
    const items = await this.getAll();
    return items.find(i => i.id === id) || null;
  },

  async create(data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: InventoryItem = { ...data, id: generateId(), createdAt: now, updatedAt: now };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, data: Partial<InventoryItem>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Item not found');
    items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    items.splice(idx, 1);
    await saveData(STORAGE_KEY, items);
  },

  async getMovements(itemId: string): Promise<StockMovement[]> {
    const saved = await getData<StockMovement[]>(STORAGE_KEY + '_movements');
    if (!saved) return [];
    return saved.filter(m => m.itemId === itemId).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  async recordMovement(data: Omit<StockMovement, 'id' | 'createdAt'>): Promise<void> {
    const saved = await getData<StockMovement[]>(STORAGE_KEY + '_movements') || [];
    const movement: StockMovement = { ...data, id: generateId(), createdAt: new Date().toISOString() };
    saved.unshift(movement);

    // Update quantity
    const items = await this.getAll();
    const item = items.find(i => i.id === data.itemId);
    if (item) {
      if (data.type === 'in') item.quantity += data.quantity;
      else if (data.type === 'out') item.quantity = Math.max(0, item.quantity - data.quantity);
      else item.quantity = data.quantity; // adjustment sets exact quantity
      item.updatedAt = new Date().toISOString();
      await saveData(STORAGE_KEY, items);
    }

    await saveData(STORAGE_KEY + '_movements', saved);
  },

  async getStats(): Promise<{ totalItems: number; lowStock: number; totalValue: number }> {
    const items = await this.getAll();
    return {
      totalItems: items.length,
      lowStock: items.filter(i => i.quantity <= i.minStock).length,
      totalValue: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
    };
  },
};
