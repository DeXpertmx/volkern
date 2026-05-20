export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { OrderHistory } from '@/components/ecommerce/OrderHistory';

export default async function MyOrdersPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Mis pedidos</h1>
      <p className="text-gray-600 mb-8">Consulta el estado de tus compras</p>

      <Suspense fallback={<OrdersSkeleton />}>
        <OrderHistory tenant={params.tenant} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border p-6 animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-5 bg-gray-200 rounded w-24" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-24" />
        </div>
      ))}
    </div>
  );
}
