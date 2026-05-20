export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { ProductFilters } from '@/components/tienda/ProductFilters';
import { ProductGrid } from '@/components/tienda/ProductGrid';

export default async function TiendaPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tienda</h1>
        <p className="text-gray-600 mt-1">Explora nuestros productos y servicios</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-64 flex-shrink-0">
          <Suspense fallback={<div className="h-64 bg-gray-200 animate-pulse rounded-lg" />}>
            <ProductFilters tenant={params.tenant} />
          </Suspense>
        </aside>

        <main className="flex-1">
          <Suspense fallback={<ProductGridSkeleton />}>
            <ProductGrid tenant={params.tenant} searchParams={searchParams} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function ProductGridSkeleton() {
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
