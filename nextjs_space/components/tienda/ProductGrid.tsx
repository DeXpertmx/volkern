'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  tenant: string;
  searchParams: { [key: string]: string | string[] | undefined };
}

export function ProductGrid({ tenant, searchParams }: ProductGridProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('tenant', tenant);

      if (searchParams.page) params.set('page', String(searchParams.page));
      if (searchParams.limit) params.set('limit', String(searchParams.limit));
      if (searchParams.search) params.set('search', String(searchParams.search));
      if (searchParams.categoria) params.set('categoria', String(searchParams.categoria));
      if (searchParams.marca) params.set('marca', String(searchParams.marca));
      if (searchParams.tipo) params.set('tipo', String(searchParams.tipo));
      if (searchParams.minPrice) params.set('minPrice', String(searchParams.minPrice));
      if (searchParams.maxPrice) params.set('maxPrice', String(searchParams.maxPrice));
      if (searchParams.destacados) params.set('destacados', String(searchParams.destacados));
      if (searchParams.conStock) params.set('conStock', String(searchParams.conStock));
      if (searchParams.orderBy) params.set('orderBy', String(searchParams.orderBy));
      if (searchParams.orderDir) params.set('orderDir', String(searchParams.orderDir));

      const res = await fetch(`/api/public/catalogo?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items);
        setPagination(data.pagination);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [tenant, searchParams]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
            <div className="h-48 bg-gray-200 rounded-lg mb-4" />
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
            <div className="h-6 bg-gray-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900">No se encontraron productos</h3>
        <p className="text-gray-500 mt-1">Intenta ajustar los filtros de búsqueda</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} tenant={tenant} />
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center mt-8 gap-2">
          {Array.from({ length: pagination.totalPages }).map((_, i) => (
            <a
              key={i}
              href={`?${new URLSearchParams({
                ...Object.fromEntries(
                  Object.entries(searchParams).map(([k, v]) => [k, String(v || '')])
                ),
                page: String(i + 1),
              })}`}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pagination.page === i + 1
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
