export const dynamic = 'force-dynamic';

import { AdminDashboard } from '@/components/ecommerce/admin/AdminDashboard';

export default async function EcommerceDashboardPage({
  params,
}: {
  params: { tenant: string };
}) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard E-commerce</h1>
      <AdminDashboard tenant={params.tenant} />
    </div>
  );
}
