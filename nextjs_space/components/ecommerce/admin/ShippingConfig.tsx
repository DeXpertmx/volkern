'use client';

import { useState } from 'react';

interface ShippingConfigProps {
  tenant: string;
}

export function ShippingConfig({ tenant }: ShippingConfigProps) {
  const [origin, setOrigin] = useState({
    postalCode: '28001',
    country: 'España',
  });
  const [testDestination, setTestDestination] = useState({
    postalCode: '',
    country: 'España',
  });
  const [testPackage, setTestPackage] = useState({
    weight: '1',
    length: '20',
    width: '15',
    height: '10',
  });
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shipping/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination: testDestination,
          package: {
            weight: parseFloat(testPackage.weight),
            length: parseFloat(testPackage.length),
            width: parseFloat(testPackage.width),
            height: parseFloat(testPackage.height),
          },
        }),
      });
      const data = await res.json();
      setOptions(data.options || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Origin */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Origen de Envíos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal</label>
            <input
              type="text"
              value={origin.postalCode}
              onChange={(e) => setOrigin({ ...origin, postalCode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
            <input
              type="text"
              value={origin.country}
              onChange={(e) => setOrigin({ ...origin, country: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Test Calculator */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Calculadora de Prueba</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CP Destino</label>
            <input
              type="text"
              value={testDestination.postalCode}
              onChange={(e) => setTestDestination({ ...testDestination, postalCode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">País Destino</label>
            <input
              type="text"
              value={testDestination.country}
              onChange={(e) => setTestDestination({ ...testDestination, country: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg)</label>
            <input
              type="number"
              value={testPackage.weight}
              onChange={(e) => setTestPackage({ ...testPackage, weight: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dimensiones (cm)</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="L"
                value={testPackage.length}
                onChange={(e) => setTestPackage({ ...testPackage, length: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="number"
                placeholder="W"
                value={testPackage.width}
                onChange={(e) => setTestPackage({ ...testPackage, width: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <input
                type="number"
                placeholder="H"
                value={testPackage.height}
                onChange={(e) => setTestPackage({ ...testPackage, height: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>
        <button
          onClick={handleCalculate}
          disabled={loading}
          className="w-full bg-primary text-white py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Calculando...' : 'Calcular Envío'}
        </button>
      </div>

      {/* Results */}
      {options.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Opciones de Envío</h2>
          <div className="space-y-3">
            {options.map((option, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{option.carrier} - {option.service}</p>
                  <p className="text-sm text-gray-500">
                    {option.estimatedDays} {option.estimatedDays === 1 ? 'día' : 'días'} · Tracking disponible
                  </p>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {option.currency === 'EUR' ? '€' : '$'}{option.cost.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
