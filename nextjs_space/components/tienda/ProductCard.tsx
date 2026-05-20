'use client';

import Image from 'next/image';
import Link from 'next/link';

interface ProductCardProps {
  product: {
    id: string;
    nombre: string;
    slug: string;
    precioBase: number;
    precioComparativo: number | null;
    moneda: string;
    media: any;
    marca: string | null;
    promedioRating: number;
    totalReviews: number;
    inventarioPublico: number;
    tipo?: string;
    tipoEntrega?: string | null;
    destacado?: boolean;
  };
  tenant: string;
}

export function ProductCard({ product, tenant }: ProductCardProps) {
  const images = product.media && Array.isArray(product.media)
    ? product.media
    : product.media && typeof product.media === 'object' && product.media.url
      ? [product.media]
      : [];

  const mainImage = images[0]?.url || images[0]?.src || null;
  const discount = product.precioComparativo && product.precioComparativo > product.precioBase
    ? Math.round(((product.precioComparativo - product.precioBase) / product.precioComparativo) * 100)
    : 0;

  const currencySymbol = product.moneda === 'EUR' ? '€' : product.moneda === 'MXN' ? '$' : product.moneda;

  const isOutOfStock = (product.tipo === 'producto' || product.tipoEntrega === 'fisico')
    && product.inventarioPublico <= 0;

  return (
    <Link
      href={`/${tenant}/tienda/${product.slug}`}
      className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {mainImage ? (
          <Image
            src={mainImage}
            alt={product.nombre}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product.destacado && (
            <span className="px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-semibold rounded">
              Destacado
            </span>
          )}
          {discount > 0 && (
            <span className="px-2 py-1 bg-red-500 text-white text-xs font-semibold rounded">
              -{discount}%
            </span>
          )}
          {isOutOfStock && (
            <span className="px-2 py-1 bg-gray-800 text-white text-xs font-semibold rounded">
              Agotado
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {product.marca && (
          <p className="text-xs text-gray-500 mb-1">{product.marca}</p>
        )}
        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-primary transition-colors">
          {product.nombre}
        </h3>

        {/* Rating */}
        {product.totalReviews > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <div className="flex items-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  className={`w-3 h-3 ${
                    i < Math.round(product.promedioRating)
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-xs text-gray-500">({product.totalReviews})</span>
          </div>
        )}

        {/* Price */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-bold text-gray-900">
            {currencySymbol}{product.precioBase.toFixed(2)}
          </span>
          {product.precioComparativo && product.precioComparativo > product.precioBase && (
            <span className="text-sm text-gray-400 line-through">
              {currencySymbol}{product.precioComparativo.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
