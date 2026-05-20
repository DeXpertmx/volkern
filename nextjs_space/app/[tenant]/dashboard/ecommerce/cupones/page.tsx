export const dynamic = 'force-dynamic';

import { AdminCouponList } from '@/components/ecommerce/admin/AdminCouponList';

export default async function AdminCouponsPage({
  params,
}: {
  params: { tenant: string };
}) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Cupones</h1>
      <AdminCouponList tenant={params.tenant} />
    </div>
  );
}
