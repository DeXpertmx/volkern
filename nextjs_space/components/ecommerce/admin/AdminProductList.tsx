'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AdminProductListProps {
  tenant: string;
}

export function AdminProductList({ tenant }: AdminProductListProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchProducts = () => {
    setLoading(true);
    fetch(`/api/admin/ecommerce/productos?search=${encodeURIComponent(search)}`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, [tenant]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;

    await fetch(`/api/admin/ecommerce/productos/${id}`, { method: 'DELETE' });
    fetchProducts();
  };

  return (
    <div className="bg-white rounded-xl border">
      <div className="p-4 border-b flex items-center justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchProducts()}
          placeholder="Buscar productos..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
        <Link
          href={`/${tenant}/dashboard/ecommerce/productos/nuevo`}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          Nuevo Producto
        </Link>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Cargando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {product.nombre}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{product.sku || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{product.category?.name || '-'}</td>
                  <td className="px-4 py-3 font-medium">
                    {product.moneda === 'EUR' ? '€' : '$'}{product.precioBase.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">{product.inventarioPublico}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      product.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {product.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/${tenant}/dashboard/ecommerce/productos/${product.id}`}
                        className="text-primary hover:underline"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No se encontraron productos
            </div>
          )}
        </div>
      )}
    </div>
  );
}
