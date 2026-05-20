'use client';

import { useEffect, useState } from 'react';

interface AdminCategoryListProps {
  tenant: string;
}

export function AdminCategoryList({ tenant }: AdminCategoryListProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', parentId: '', orden: '0' });

  const fetchCategories = () => {
    setLoading(true);
    fetch(`/api/admin/ecommerce/categorias`)
      .then((res) => res.json())
      .then((data) => {
        setCategories(data.categories || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCategories();
  }, [tenant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await fetch(`/api/admin/ecommerce/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        orden: parseInt(form.orden),
        parentId: form.parentId || null,
      }),
    });

    setShowForm(false);
    setForm({ name: '', slug: '', parentId: '', orden: '0' });
    fetchCategories();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
        >
          {showForm ? 'Cancelar' : 'Nueva Categoría'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Padre</label>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Ninguna</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
              <input
                type="number"
                value={form.orden}
                onChange={(e) => setForm({ ...form, orden: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-primary text-white py-2 rounded-lg font-medium"
          >
            Crear Categoría
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Productos</th>
              <th className="px-4 py-3">Orden</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {cat.parentId && <span className="text-gray-400 mr-2">└─</span>}
                  {cat.name}
                </td>
                <td className="px-4 py-3 font-mono text-gray-500">{cat.slug}</td>
                <td className="px-4 py-3">{cat._count.catalogoItems}</td>
                <td className="px-4 py-3">{cat.orden}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">No hay categorías</div>
        )}
      </div>
    </div>
  );
}
