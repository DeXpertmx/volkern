'use client';

import { useEffect, useState } from 'react';
import { useCartStore } from '@/lib/store/cart-store';
import { CartItemRow } from './CartItemRow';
import { CartSummary } from './CartSummary';
import { useRouter } from 'next/navigation';

interface CartDrawerProps {
  tenant: string;
}

export function CartDrawer({ tenant }: CartDrawerProps) {
  const router = useRouter();
  const isOpen = useCartStore((state) => state.isOpen);
  const closeCart = useCartStore((state) => state.closeCart);
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    if (isOpen && !isSynced && items.length > 0) {
      syncCartWithServer();
    }
  }, [isOpen]);

  const syncCartWithServer = async () => {
    const sessionId = getOrCreateSessionId();

    for (const item of items) {
      if (item.id.startsWith('local-')) {
        try {
          await fetch('/api/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenant,
              sessionId,
              catalogoItemId: item.catalogoItemId,
              variantId: item.variantId,
              cantidad: item.cantidad,
            }),
          });
        } catch (e) {
          console.error('Error syncing cart item:', e);
        }
      }
    }
    setIsSynced(true);
  };

  const handleCheckout = () => {
    closeCart();
    router.push(`/${tenant}/checkout`);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={closeCart}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Carrito ({items.length} {items.length === 1 ? 'producto' : 'productos'})
          </h2>
          <button
            onClick={closeCart}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-gray-500">Tu carrito está vacío</p>
              <button
                onClick={closeCart}
                className="mt-4 text-primary font-medium hover:underline"
              >
                Continuar comprando
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {items.map((item) => (
                <CartItemRow key={item.id} item={item} tenant={tenant} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-200 p-4 space-y-4">
            <CartSummary tenant={tenant} />
            <button
              onClick={handleCheckout}
              className="w-full bg-primary text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
            >
              Ir al checkout
            </button>
            <button
              onClick={closeCart}
              className="w-full text-gray-600 py-2 text-sm font-medium hover:text-gray-900 transition-colors"
            >
              Continuar comprando
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem('volkern-session-id');
  if (!sessionId) {
    sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('volkern-session-id', sessionId);
  }
  return sessionId;
}
