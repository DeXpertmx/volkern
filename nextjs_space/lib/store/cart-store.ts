import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  catalogoItemId: string;
  variantId: string | null;
  nombre: string;
  slug: string;
  sku: string | null;
  precioUnitario: number;
  cantidad: number;
  imagen: string | null;
  moneda: string;
  maxOrderQty: number | null;
  minOrderQty: number;
  tipo: string;
  tipoEntrega: string | null;
  inventarioPublico: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  tenant: string | null;

  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, cantidad: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  setTenant: (tenant: string) => void;
  mergeCart: (serverItems: CartItem[]) => void;

  totalItems: () => number;
  subtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      tenant: null,

      addItem: (newItem) =>
        set((state) => {
          const existingIndex = state.items.findIndex(
            (item) =>
              item.catalogoItemId === newItem.catalogoItemId &&
              item.variantId === newItem.variantId
          );

          let updatedItems: CartItem[];

          if (existingIndex >= 0) {
            updatedItems = [...state.items];
            const existing = updatedItems[existingIndex];
            const maxQty = existing.maxOrderQty || 999;
            const newQty = Math.min(existing.cantidad + newItem.cantidad, maxQty);
            updatedItems[existingIndex] = { ...existing, cantidad: newQty };
          } else {
            updatedItems = [
              ...state.items,
              { ...newItem, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` },
            ];
          }

          return { items: updatedItems, isOpen: true };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      updateQuantity: (id, cantidad) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (!item) return state;

          const maxQty = item.maxOrderQty || 999;
          const newCantidad = Math.max(item.minOrderQty, Math.min(cantidad, maxQty));

          return {
            items: state.items.map((i) =>
              i.id === id ? { ...i, cantidad: newCantidad } : i
            ),
          };
        }),

      clearCart: () => set({ items: [] }),

      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      setTenant: (tenant) => set({ tenant }),

      mergeCart: (serverItems) =>
        set((state) => {
          const merged = [...state.items];

          for (const serverItem of serverItems) {
            const existingIndex = merged.findIndex(
              (item) =>
                item.catalogoItemId === serverItem.catalogoItemId &&
                item.variantId === serverItem.variantId
            );

            if (existingIndex >= 0) {
              const existing = merged[existingIndex];
              const maxQty = existing.maxOrderQty || 999;
              const newQty = Math.min(existing.cantidad + serverItem.cantidad, maxQty);
              merged[existingIndex] = { ...serverItem, id: existing.id, cantidad: newQty };
            } else {
              merged.push({
                ...serverItem,
                id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              });
            }
          }

          return { items: merged };
        }),

      totalItems: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + item.cantidad, 0);
      },

      subtotal: () => {
        const state = get();
        return state.items.reduce(
          (sum, item) => sum + item.precioUnitario * item.cantidad,
          0
        );
      },
    }),
    {
      name: 'volkern-cart',
    }
  )
);
