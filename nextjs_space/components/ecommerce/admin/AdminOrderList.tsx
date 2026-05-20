'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AdminOrderListProps {
  tenant: string;
}

export function AdminOrderList({ tenant }: AdminOrderListProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [search, setSearch] = useState('');

  const fetchOrders = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (estado) params.set('estado', estado);
    if (paymentStatus) params.set('paymentStatus', paymentStatus);
    if (search) params.set('search', search);

    fetch(`/api/admin/ecommerce/ordenes?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, [tenant]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    await fetch(`/api/admin/ecommerce/ordenes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, estado: newStatus }),
    });
    fetchOrders();
  };

  const estadoLabels: Record<string, string> = {
    borrador: 'Borrador',
    pendiente: 'Pendiente',
    confirmada: 'Confirmada',
    en_proceso: 'En proceso',
    completada: 'Completada',
    cancelada: 'Cancelada',
  };

  return (
    <div className="bg-white rounded-xl border">
      <div className="p-4 border-b flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
          placeholder="Buscar por número..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(estadoLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos los pagos</option>
          <option value="pending">Pendiente</option>
          <option value="paid">Pagado</option>
          <option value="failed">Fallido</option>
          <option value="refunded">Reembolsado</option>
        </select>
        <button
          onClick={fetchOrders}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
        >
          Filtrar
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Cargando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">#{order.numero}</td>
                  <td className="px-4 py-3 text-gray-500">{order.contact?.nombre || '-'}</td>
                  <td className="px-4 py-3 font-medium">
                    {order.moneda === 'EUR' ? '€' : '$'}{order.total.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={order.estado}
                      onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    >
                      {Object.entries(estadoLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                      order.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(order.fechaCreacion).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/${tenant}/dashboard/ecommerce/ordenes/${order.id}`}
                      className="text-primary hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No se encontraron pedidos
            </div>
          )}
        </div>
      )}
    </div>
  );
}
