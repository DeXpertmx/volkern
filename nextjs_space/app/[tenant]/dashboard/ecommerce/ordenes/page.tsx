export const dynamic = 'force-dynamic';

import { AdminOrderList } from '@/components/ecommerce/admin/AdminOrderList';

export default async function AdminOrdersPage({
  params,
}: {
  params: { tenant: string };
}) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
      <AdminOrderList tenant={params.tenant} />
    </div>
  );
}
