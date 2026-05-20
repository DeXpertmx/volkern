export const dynamic = 'force-dynamic';

import { ShippingConfig } from '@/components/ecommerce/admin/ShippingConfig';

export default async function AdminShippingPage({
  params,
}: {
  params: { tenant: string };
}) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración de Envíos</h1>
      <ShippingConfig tenant={params.tenant} />
    </div>
  );
}
