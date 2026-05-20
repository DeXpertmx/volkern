export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ProductGallery } from '@/components/tienda/ProductGallery';
import { VariantSelector } from '@/components/tienda/VariantSelector';
import { ProductReviews } from '@/components/tienda/ProductReviews';
import { ProductCard } from '@/components/tienda/ProductCard';

interface ProductData {
  id: string;
  nombre: string;
  descripcion: string | null;
  slug: string;
  sku: string | null;
  tipo: string;
  precioBase: number;
  precioComparativo: number | null;
  moneda: string;
  media: any;
  categorias: string[];
  etiquetas: string[];
  marca: string | null;
  estadoProducto: string | null;
  tipoEntrega: string | null;
  destacado: boolean;
  activo: boolean;
  inventarioPublico: number;
  promedioRating: number;
  totalReviews: number;
  minOrderQty: number;
  maxOrderQty: number | null;
  peso: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  category: { id: string; name: string; slug: string } | null;
  variants: any[];
  reviews: any[];
  relatedProducts: any[];
  customFieldValues: any;
  pricing: any;
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { tenant: string; slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/public/catalogo/${params.slug}?tenant=${params.tenant}`,
    { next: { revalidate: 60 } }
  );

  if (!res.ok) {
    notFound();
  }

  const product: ProductData = await res.json();

  const images = product.media && Array.isArray(product.media)
    ? product.media
    : product.media && typeof product.media === 'object'
      ? [product.media]
      : [];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <a href={`/${params.tenant}/tienda`} className="hover:text-gray-900">
          Tienda
        </a>
        {product.category && (
          <>
            <span>/</span>
            <a
              href={`/${params.tenant}/tienda?categoria=${product.category.slug}`}
              className="hover:text-gray-900"
            >
              {product.category.name}
            </a>
          </>
        )}
        <span>/</span>
        <span className="text-gray-900">{product.nombre}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Gallery */}
        <div>
          <ProductGallery images={images} nombre={product.nombre} />
        </div>

        {/* Product Info */}
        <div>
          {product.marca && (
            <p className="text-sm text-gray-500 mb-1">{product.marca}</p>
          )}
          <h1 className="text-3xl font-bold text-gray-900">{product.nombre}</h1>

          {product.totalReviews > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    className={`w-4 h-4 ${
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
              <span className="text-sm text-gray-500">
                {product.promedioRating.toFixed(1)} ({product.totalReviews} reseñas)
              </span>
            </div>
          )}

          {/* Price */}
          <div className="mt-6">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-gray-900">
                {product.moneda === 'EUR' ? '€' : product.moneda === 'MXN' ? '$' : product.moneda}
                {product.precioBase.toFixed(2)}
              </span>
              {product.precioComparativo && product.precioComparativo > product.precioBase && (
                <span className="text-lg text-gray-400 line-through">
                  {product.moneda === 'EUR' ? '€' : product.moneda === 'MXN' ? '$' : product.moneda}
                  {product.precioComparativo.toFixed(2)}
                </span>
              )}
            </div>
            {product.precioComparativo && product.precioComparativo > product.precioBase && (
              <span className="inline-block mt-1 px-2 py-1 bg-red-100 text-red-700 text-sm font-medium rounded">
                -{Math.round(((product.precioComparativo - product.precioBase) / product.precioComparativo) * 100)}%
              </span>
            )}
          </div>

          {/* Description */}
          {product.descripcion && (
            <p className="mt-6 text-gray-600 leading-relaxed">
              {product.descripcion}
            </p>
          )}

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div className="mt-6">
              <VariantSelector variants={product.variants} />
            </div>
          )}

          {/* Stock status */}
          {(product.tipo === 'producto' || product.tipoEntrega === 'fisico') && (
            <div className="mt-6">
              {product.inventarioPublico > 0 ? (
                <p className="text-green-600 font-medium">
                  En stock ({product.inventarioPublico} disponibles)
                </p>
              ) : (
                <p className="text-red-600 font-medium">Agotado</p>
              )}
            </div>
          )}

          {/* Add to cart button */}
          <div className="mt-8 flex gap-4">
            <button className="flex-1 bg-primary text-white py-3 px-6 rounded-xl font-semibold hover:bg-primary/90 transition-colors">
              Agregar al carrito
            </button>
          </div>

          {/* Tags */}
          {product.etiquetas && product.etiquetas.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {product.etiquetas.map((tag: string) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      {product.reviews && product.reviews.length > 0 && (
        <div className="mt-16 border-t pt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Reseñas</h2>
          <ProductReviews reviews={product.reviews} />
        </div>
      )}

      {/* Related products */}
      {product.relatedProducts && product.relatedProducts.length > 0 && (
        <div className="mt-16 border-t pt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">
            Productos relacionados
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {product.relatedProducts.map((related: any) => (
              <ProductCard key={related.id} product={related} tenant={params.tenant} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
