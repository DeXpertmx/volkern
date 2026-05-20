'use client';

import { useState } from 'react';

interface VariantSelectorProps {
  variants: {
    id: string;
    sku: string;
    nombre: string;
    precio: number | null;
    stock: number;
    attributes: any;
    imagen: string | null;
  }[];
}

export function VariantSelector({ variants }: VariantSelectorProps) {
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const attributeKeys = variants.length > 0 ? Object.keys(variants[0].attributes) : [];

  const uniqueAttributes = attributeKeys.map((key) => ({
    key,
    values: [...new Set(variants.map((v) => v.attributes[key]))],
  }));

  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  const matchingVariant = variants.find((v) =>
    Object.entries(selectedAttributes).every(
      ([key, value]) => v.attributes[key] === value
    )
  );

  const handleAttributeSelect = (key: string, value: string) => {
    setSelectedAttributes((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {uniqueAttributes.map(({ key, values }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-2 capitalize">
            {key}
          </label>
          <div className="flex flex-wrap gap-2">
            {values.map((value) => {
              const isSelected = selectedAttributes[key] === value;
              const isAvailable = variants.some(
                (v) =>
                  v.attributes[key] === value &&
                  Object.entries(selectedAttributes)
                    .filter(([k]) => k !== key)
                    .every(([k, val]) => v.attributes[k] === val)
              );

              return (
                <button
                  key={String(value)}
                  onClick={() => handleAttributeSelect(key, String(value))}
                  disabled={!isAvailable}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    isSelected
                      ? 'bg-primary text-white border-primary'
                      : isAvailable
                        ? 'bg-white text-gray-700 border-gray-300 hover:border-primary'
                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  }`}
                >
                  {String(value)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {matchingVariant && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            <span className="font-medium">Seleccionado:</span> {matchingVariant.nombre}
            {matchingVariant.precio && (
              <span className="ml-2">
                - {matchingVariant.precio.toFixed(2)}€
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
