'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardData {
  revenue: number;
  totalOrders: number;
  avgOrderValue: number;
  recentOrders: any[];
  topProducts: any[];
  ordersByStatus: any[];
}

interface AdminDashboardProps {
  tenant: string;
}

export function AdminDashboard({ tenant }: AdminDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/ecommerce/dashboard?tenant=${tenant}`)
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tenant]);

  if (loading) {
    return <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl" />
        ))}
      </div>
    </div>;
  }

  if (!data) return null;

  const currencySymbol = '€';

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <p className="text-sm text-gray-600">Ingresos</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {currencySymbol}{data.revenue.toFixed(2)}
          </p>
          <p className="text-sm text-green-600 mt-1">Últimos 30 días</p>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <p className="text-sm text-gray-600">Pedidos</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {data.totalOrders}
          </p>
          <p className="text-sm text-gray-500 mt-1">Total</p>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <p className="text-sm text-gray-600">Ticket Promedio</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {currencySymbol}{data.avgOrderValue.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pedidos Recientes</h2>
            <Link href={`/${tenant}/dashboard/ecommerce/ordenes`} className="text-sm text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="space-y-3">
            {data.recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-gray-900">#{order.numero}</p>
                  <p className="text-sm text-gray-500">
                    {order.contact?.nombre || 'Anónimo'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">
                    {currencySymbol}{order.total.toFixed(2)}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    order.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Productos Más Vendidos</h2>
          <div className="space-y-3">
            {data.topProducts.map((product, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-gray-900">{product.concepto}</p>
                  <p className="text-sm text-gray-500">
                    {product._sum.cantidad} vendidos
                  </p>
                </div>
                <p className="font-medium text-gray-900">
                  {currencySymbol}{product._sum.total.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Orders by Status */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pedidos por Estado</h2>
        <div className="flex flex-wrap gap-4">
          {data.ordersByStatus.map((status) => (
            <div key={status.estado} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm text-gray-600 capitalize">{status.estado}</span>
              <span className="font-medium text-gray-900">{status._count.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
