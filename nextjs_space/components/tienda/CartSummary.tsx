'use client';

import { useCartStore } from '@/lib/store/cart-store';

interface CartSummaryProps {
  tenant: string;
}

export function CartSummary({ tenant }: CartSummaryProps) {
  const subtotal = useCartStore((state) => state.subtotal());
  const items = useCartStore((state) => state.items);

  const currencySymbol = items.length > 0
    ? (items[0].moneda === 'EUR' ? '€' : items[0].moneda === 'MXN' ? '$' : items[0].moneda)
    : '€';

  return (
    <div className="border-t border-gray-200 pt-4 space-y-2">
      <div className="flex justify-between text-sm text-gray-600">
        <span>Subtotal</span>
        <span>{currencySymbol}{subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm text-gray-600">
        <span>Envío</span>
        <span className="text-green-600">Calculado al pagar</span>
      </div>
      <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
        <span>Total</span>
        <span>{currencySymbol}{subtotal.toFixed(2)}</span>
      </div>
    </div>
  );
}
