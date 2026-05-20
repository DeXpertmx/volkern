'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface OrderHistoryProps {
  tenant: string;
  searchParams: { [key: string]: string | string[] | undefined };
}

interface Order {
  id: string;
  numero: string;
  estado: string;
  paymentStatus: string;
  total: number;
  moneda: string;
  fechaCreacion: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingCarrier: string | null;
  shippingMethod: string | null;
  invoice: {
    id: string;
    numero: string;
    fingerprint: string | null;
    aeatStatus: string | null;
  } | null;
  items: {
    concepto: string;
    cantidad: number;
    total: number;
    catalogItem: { slug: string | null; media: any } | null;
  }[];
  shippingAddress: {
    nombre: string;
    linea1: string;
    ciudad: string;
    codigoPostal: string;
    pais: string;
  } | null;
}

const estadoLabels: Record<string, string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

const estadoColors: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-800',
  pendiente: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-blue-100 text-blue-800',
  en_proceso: 'bg-purple-100 text-purple-800',
  completada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
};

const paymentLabels: Record<string, string> = {
  pending: 'Pendiente de pago',
  paid: 'Pagado',
  failed: 'Pago fallido',
  refunded: 'Reembolsado',
};

export function OrderHistory({ tenant, searchParams }: OrderHistoryProps) {
  const [email, setEmail] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setHasSearched(true);

    const res = await fetch(
      `/api/mis-ordenes?tenant=${tenant}&email=${encodeURIComponent(email)}`
    );
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  };

  const currencySymbol = orders.length > 0
    ? (orders[0].moneda === 'EUR' ? '€' : orders[0].moneda === 'MXN' ? '$' : orders[0].moneda)
    : '€';

  return (
    <div>
      {/* Email search */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border p-6 mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ingresa el email de facturación para ver tus pedidos
        </label>
        <div className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>

      {/* Results */}
      {hasSearched && (
        <>
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-gray-500 text-lg">No se encontraron pedidos</p>
              <p className="text-gray-400 text-sm mt-1">
                No hay pedidos asociados a este email
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {orders.length} {orders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
              </p>

              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border overflow-hidden"
                >
                  {/* Order header */}
                  <button
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    className="w-full p-6 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">
                          Pedido #{order.numero}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(order.fechaCreacion).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${estadoColors[order.estado] || 'bg-gray-100 text-gray-800'}`}>
                          {estadoLabels[order.estado] || order.estado}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          order.paymentStatus === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : order.paymentStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {paymentLabels[order.paymentStatus] || order.paymentStatus}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {currencySymbol}{order.total.toFixed(2)}
                        </span>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedOrder === order.id ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expandedOrder === order.id && (
                    <div className="border-t border-gray-100 p-6 bg-gray-50">
                      {/* Items */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Productos</h4>
                        <div className="space-y-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-900">
                                {item.concepto} × {item.cantidad}
                              </span>
                              <span className="text-gray-600">
                                {currencySymbol}{item.total.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tracking */}
                      {order.trackingNumber && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <h4 className="text-sm font-medium text-blue-900 mb-1">
                            Envío: {order.shippingCarrier || 'Estándar'}
                          </h4>
                          <p className="text-sm text-blue-700">
                            Número de seguimiento: <span className="font-mono font-medium">{order.trackingNumber}</span>
                          </p>
                          {order.trackingUrl && (
                            <a
                              href={order.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                            >
                              Rastrear paquete →
                            </a>
                          )}
                        </div>
                      )}

                      {/* Invoice */}
                      {order.invoice && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <h4 className="text-sm font-medium text-green-900 mb-1">
                            Factura: {order.invoice.numero}
                          </h4>
                          {order.invoice.aeatStatus && (
                            <p className="text-sm text-green-700">
                              Estado AEAT: <span className="font-medium">{order.invoice.aeatStatus}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Shipping address */}
                      {order.shippingAddress && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-1">
                            Dirección de envío
                          </h4>
                          <p className="text-sm text-gray-600">
                            {order.shippingAddress.nombre}<br />
                            {order.shippingAddress.linea1}<br />
                            {order.shippingAddress.ciudad}, {order.shippingAddress.codigoPostal}<br />
                            {order.shippingAddress.pais}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
