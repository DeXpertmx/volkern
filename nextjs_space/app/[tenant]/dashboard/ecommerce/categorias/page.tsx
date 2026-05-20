export const dynamic = 'force-dynamic';

import { AdminCategoryList } from '@/components/ecommerce/admin/AdminCategoryList';

export default async function AdminCategoriesPage({
  params,
}: {
  params: { tenant: string };
}) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
      <AdminCategoryList tenant={params.tenant} />
    </div>
  );
}
