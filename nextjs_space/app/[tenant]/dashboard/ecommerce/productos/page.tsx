export const dynamic = 'force-dynamic';

import { AdminProductList } from '@/components/ecommerce/admin/AdminProductList';

export default async function AdminProductsPage({
  params,
}: {
  params: { tenant: string };
}) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
      </div>
      <AdminProductList tenant={params.tenant} />
    </div>
  );
}
