'use client';

import { useState } from 'react';
import { useCartStore } from '@/lib/store/cart-store';

interface AddToCartButtonProps {
  product: {
    id: string;
    nombre: string;
    slug: string;
    sku: string | null;
    precioBase: number;
    moneda: string;
    media: any;
    tipo: string;
    tipoEntrega: string | null;
    inventarioPublico: number;
    minOrderQty: number;
    maxOrderQty: number | null;
  };
  selectedVariant?: {
    id: string;
    precio: number | null;
    stock: number;
    imagen: string | null;
  } | null;
  tenant: string;
}

export function AddToCartButton({ product, selectedVariant, tenant }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(product.minOrderQty || 1);
  const [adding, setAdding] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useCartStore((state) => state.openCart);
  const setTenant = useCartStore((state) => state.setTenant);

  const isOutOfStock = (product.tipo === 'producto' || product.tipoEntrega === 'fisico')
    && product.inventarioPublico <= 0;

  const price = selectedVariant?.precio ?? product.precioBase;
  const media = product.media && Array.isArray(product.media)
    ? product.media[0]
    : product.media && typeof product.media === 'object'
      ? product.media
      : null;
  const imagen = selectedVariant?.imagen || (media?.url || media?.src || null);

  const handleAddToCart = () => {
    setAdding(true);
    setTenant(tenant);

    addItem({
      catalogoItemId: product.id,
      variantId: selectedVariant?.id || null,
      nombre: product.nombre,
      slug: product.slug,
      sku: product.sku,
      precioUnitario: price,
      cantidad: quantity,
      imagen,
      moneda: product.moneda,
      maxOrderQty: product.maxOrderQty,
      minOrderQty: product.minOrderQty,
      tipo: product.tipo,
      tipoEntrega: product.tipoEntrega,
      inventarioPublico: product.inventarioPublico,
    });

    setTimeout(() => {
      setAdding(false);
      openCart();
    }, 300);
  };

  if (isOutOfStock) {
    return (
      <button
        disabled
        className="w-full bg-gray-300 text-gray-500 py-3 px-6 rounded-xl font-semibold cursor-not-allowed"
      >
        Agotado
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Quantity selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Cantidad:</label>
        <div className="flex items-center border border-gray-300 rounded-lg">
          <button
            onClick={() => setQuantity(Math.max(product.minOrderQty || 1, quantity - 1))}
            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-l-lg transition-colors"
            disabled={quantity <= (product.minOrderQty || 1)}
          >
            −
          </button>
          <span className="px-4 py-2 text-sm font-medium min-w-[3rem] text-center">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity(Math.min(product.maxOrderQty || 999, quantity + 1))}
            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-r-lg transition-colors"
            disabled={product.maxOrderQty ? quantity >= product.maxOrderQty : false}
          >
            +
          </button>
        </div>
      </div>

      {/* Add to cart button */}
      <button
        onClick={handleAddToCart}
        disabled={adding}
        className="w-full bg-primary text-white py-3 px-6 rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {adding ? (
          <>
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Agregando...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Agregar al carrito
          </>
        )}
      </button>
    </div>
  );
}
