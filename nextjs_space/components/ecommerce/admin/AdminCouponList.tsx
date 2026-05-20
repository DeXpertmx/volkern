'use client';

import { useEffect, useState } from 'react';

interface AdminCouponListProps {
  tenant: string;
}

export function AdminCouponList({ tenant }: AdminCouponListProps) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    minPurchase: '',
    maxDiscount: '',
    validoDesde: '',
    validoHasta: '',
  });

  const fetchCoupons = () => {
    setLoading(true);
    fetch(`/api/admin/ecommerce/cupones`)
      .then((res) => res.json())
      .then((data) => {
        setCoupons(data.coupons || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCoupons();
  }, [tenant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await fetch(`/api/admin/ecommerce/cupones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        value: parseFloat(form.value),
        minPurchase: form.minPurchase ? parseFloat(form.minPurchase) : undefined,
        maxDiscount: form.maxDiscount ? parseFloat(form.maxDiscount) : undefined,
      }),
    });

    setShowForm(false);
    setForm({ code: '', type: 'percentage', value: '', minPurchase: '', maxDiscount: '', validoDesde: '', validoHasta: '' });
    fetchCoupons();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
        >
          {showForm ? 'Cancelar' : 'Nuevo Cupón'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="percentage">Porcentaje</option>
                <option value="fixed">Monto fijo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
              <input
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compra mínima</label>
              <input
                type="number"
                value={form.minPurchase}
                onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descuento máximo</label>
              <input
                type="number"
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Válido desde</label>
              <input
                type="date"
                value={form.validoDesde}
                onChange={(e) => setForm({ ...form, validoDesde: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Válido hasta</label>
              <input
                type="date"
                value={form.validoHasta}
                onChange={(e) => setForm({ ...form, validoHasta: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-primary text-white py-2 rounded-lg font-medium"
          >
            Crear Cupón
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Usos</th>
              <th className="px-4 py-3">Válido</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium">{coupon.code}</td>
                <td className="px-4 py-3 capitalize">{coupon.type === 'percentage' ? '%' : 'Fijo'}</td>
                <td className="px-4 py-3">
                  {coupon.type === 'percentage' ? `${coupon.value}%` : `€${coupon.value}`}
                </td>
                <td className="px-4 py-3">
                  {coupon.usesCount} / {coupon.maxUses || '∞'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(coupon.validoDesde).toLocaleDateString('es-ES')} - {coupon.validoHasta ? new Date(coupon.validoHasta).toLocaleDateString('es-ES') : '∞'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    coupon.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {coupon.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {coupons.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">No hay cupones</div>
        )}
      </div>
    </div>
  );
}
