'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCartStore, CartItem } from '@/lib/store/cart-store';

interface CartItemRowProps {
  item: CartItem;
  tenant: string;
}

export function CartItemRow({ item, tenant }: CartItemRowProps) {
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);

  const currencySymbol = item.moneda === 'EUR' ? '€' : item.moneda === 'MXN' ? '$' : item.moneda;

  return (
    <div className="flex gap-4 py-4 border-b border-gray-100 last:border-0">
      {/* Image */}
      <div className="relative w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
        {item.imagen ? (
          <Image
            src={item.imagen}
            alt={item.nombre}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/${tenant}/tienda/${item.slug}`}
          className="font-medium text-gray-900 hover:text-primary truncate block"
        >
          {item.nombre}
        </Link>
        {item.sku && (
          <p className="text-xs text-gray-500 mt-0.5">SKU: {item.sku}</p>
        )}
        <p className="text-sm font-semibold text-gray-900 mt-1">
          {currencySymbol}{item.precioUnitario.toFixed(2)}
        </p>

        {/* Quantity controls */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center border border-gray-300 rounded-lg">
            <button
              onClick={() => updateQuantity(item.id, item.cantidad - 1)}
              className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-l-lg transition-colors"
              disabled={item.cantidad <= item.minOrderQty}
            >
              −
            </button>
            <span className="px-3 py-1 text-sm font-medium min-w-[2rem] text-center">
              {item.cantidad}
            </span>
            <button
              onClick={() => updateQuantity(item.id, item.cantidad + 1)}
              className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-r-lg transition-colors"
              disabled={item.maxOrderQty ? item.cantidad >= item.maxOrderQty : false}
            >
              +
            </button>
          </div>

          <button
            onClick={() => removeItem(item.id)}
            className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
