'use client'

import { useState } from 'react'

interface ColumnMap {
  sourceField: string
  targetField: string
}

interface Props {
  preview: Record<string, string>[]
  mapping: ColumnMap[]
  loading: boolean
  onExecute: () => void
  onBack: () => void
}

const TARGET_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  nif: 'NIF',
  email: 'Email',
  telefono: 'Teléfono',
  direccion: 'Dirección',
  codigo_postal: 'CP',
  ciudad: 'Ciudad',
  provincia: 'Provincia',
  pais: 'País',
  codigo_cliente: 'Código',
  cuenta: 'Cuenta',
  nombre_cuenta: 'Nombre Cuenta',
  saldo: 'Saldo',
  debe: 'Debe',
  haber: 'Haber',
  fecha: 'Fecha',
  concepto: 'Concepto',
  tipo: 'Tipo',
  importe: 'Importe',
  documento: 'Documento',
  descripcion: 'Descripción',
  precio: 'Precio',
  duracion: 'Duración',
}

export function ImportPreview({ preview, mapping, loading, onExecute, onBack }: Props) {
  const [confirmed, setConfirmed] = useState(false)

  const activeColumns = mapping.filter(m => m.targetField !== '__skip__')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Previsualizar datos</h2>
      <p className="text-sm text-gray-500 mb-4">Mostrando {Math.min(preview.length, 10)} de {preview.length} filas detectadas</p>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              {activeColumns.map(col => (
                <th key={col.sourceField} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  {TARGET_LABELS[col.targetField] || col.targetField}
                  <span className="block text-[10px] text-gray-400 font-normal">{col.sourceField}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {preview.slice(0, 10).map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                {activeColumns.map(col => (
                  <td key={col.sourceField} className="px-3 py-2 text-gray-700 max-w-[200px] truncate">
                    {row[col.sourceField] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        Se importarán {preview.length} registros. Los duplicados se actualizarán.
      </div>

      <label className="flex items-center gap-2 mt-4 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="rounded border-gray-300" />
        <span className="text-sm text-gray-600">Confirmo que los datos son correctos y deseo proceder con la importación</span>
      </label>

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Atrás</button>
        <button
          onClick={onExecute}
          disabled={!confirmed || loading}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Importando...' : 'Ejecutar importación'}
        </button>
      </div>
    </div>
  )
}
