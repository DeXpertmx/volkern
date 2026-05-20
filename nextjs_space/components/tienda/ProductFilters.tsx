'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface ProductFiltersProps {
  tenant: string;
}

export function ProductFilters({ tenant }: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('categoria') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [marca, setMarca] = useState(searchParams.get('marca') || '');
  const [conStock, setConStock] = useState(searchParams.get('conStock') === 'true');
  const [orderBy, setOrderBy] = useState(searchParams.get('orderBy') || 'fechaCreacion');

  useEffect(() => {
    fetch(`/api/public/categorias?tenant=${tenant}`)
      .then((res) => res.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => {});
  }, [tenant]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategory) params.set('categoria', selectedCategory);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (marca) params.set('marca', marca);
    if (conStock) params.set('conStock', 'true');
    if (orderBy) params.set('orderBy', orderBy);
    router.push(`/${tenant}/tienda?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setMinPrice('');
    setMaxPrice('');
    setMarca('');
    setConStock(false);
    setOrderBy('fechaCreacion');
    router.push(`/${tenant}/tienda`);
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          placeholder="Nombre, SKU, marca..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
          <div className="space-y-1">
            <button
              onClick={() => setSelectedCategory('')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                !selectedCategory
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Todas
            </button>
            {categories.map((cat) => (
              <CategoryItem
                key={cat.id}
                category={cat}
                selected={selectedCategory}
                onSelect={setSelectedCategory}
              />
            ))}
          </div>
        </div>
      )}

      {/* Price range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Precio</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>
      </div>

      {/* Marca */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Marca</label>
        <input
          type="text"
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          placeholder="Marca"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>

      {/* Stock */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="conStock"
          checked={conStock}
          onChange={(e) => setConStock(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label htmlFor="conStock" className="text-sm text-gray-700">
          Solo con stock
        </label>
      </div>

      {/* Order by */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Ordenar por</label>
        <select
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
        >
          <option value="fechaCreacion">Más recientes</option>
          <option value="precioBase">Precio: menor a mayor</option>
          <option value="nombre">Nombre A-Z</option>
          <option value="promedioRating">Mejor valorados</option>
        </select>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={applyFilters}
          className="flex-1 bg-primary text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Aplicar
        </button>
        <button
          onClick={clearFilters}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}

function CategoryItem({
  category,
  selected,
  onSelect,
  depth = 0,
}: {
  category: any;
  selected: string;
  onSelect: (slug: string) => void;
  depth?: number;
}) {
  return (
    <>
      <button
        onClick={() => onSelect(category.slug)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
          selected === category.slug
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {category.name}
      </button>
      {category.children?.map((child: any) => (
        <CategoryItem
          key={child.id}
          category={child}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
