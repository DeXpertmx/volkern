'use client'

import { useState, useEffect } from 'react'

interface ColumnMap {
  sourceField: string
  targetField: string
}

interface Props {
  headers: string[]
  template: { name: string } | null
  initialMapping: ColumnMap[]
  onConfirm: (mapping: ColumnMap[]) => void
  onBack: () => void
}

const TARGET_FIELDS: Record<string, { label: string; type: string }[]> = {
  clients: [
    { label: 'Nombre / Razón Social', type: 'nombre' },
    { label: 'NIF / CIF', type: 'nif' },
    { label: 'Email', type: 'email' },
    { label: 'Teléfono', type: 'telefono' },
    { label: 'Dirección', type: 'direccion' },
    { label: 'Código Postal', type: 'codigo_postal' },
    { label: 'Ciudad', type: 'ciudad' },
    { label: 'Provincia', type: 'provincia' },
    { label: 'País', type: 'pais' },
    { label: 'Código Cliente', type: 'codigo_cliente' },
    { label: '-- Ignorar --', type: '__skip__' },
  ],
  accounting: [
    { label: 'Cuenta Contable', type: 'cuenta' },
    { label: 'Nombre Cuenta', type: 'nombre_cuenta' },
    { label: 'Saldo / Importe', type: 'saldo' },
    { label: 'Debe (Cargo)', type: 'debe' },
    { label: 'Haber (Abono)', type: 'haber' },
    { label: 'Fecha', type: 'fecha' },
    { label: 'Concepto', type: 'concepto' },
    { label: 'Documento', type: 'documento' },
    { label: 'Tipo (Deudor/Acreedor)', type: 'tipo' },
    { label: 'Importe Total', type: 'importe' },
    { label: '-- Ignorar --', type: '__skip__' },
  ],
  catalog: [
    { label: 'Nombre del Servicio', type: 'nombre' },
    { label: 'Descripción', type: 'descripcion' },
    { label: 'Precio', type: 'precio' },
    { label: 'Duración (minutos)', type: 'duracion' },
    { label: '-- Ignorar --', type: '__skip__' },
  ],
}

export function ImportColumnMapping({ headers, template, initialMapping, onConfirm, onBack }: Props) {
  const [mapping, setMapping] = useState<ColumnMap[]>(initialMapping)
  const [importType, setImportType] = useState<string>('clients')
  const targetFields = TARGET_FIELDS[importType] || TARGET_FIELDS.clients

  useEffect(() => {
    if (template?.name?.toLowerCase().includes('contabilidad') || template?.name?.toLowerCase().includes('balance') || template?.name?.toLowerCase().includes('asiento')) {
      setImportType('accounting')
    }
  }, [template])

  const updateMapping = (sourceField: string, targetField: string) => {
    setMapping(prev => prev.map(m => m.sourceField === sourceField ? { ...m, targetField } : m))
  }

  const getSelected = (sourceField: string) => mapping.find(m => m.sourceField === sourceField)?.targetField || '__skip__'

  const unusedTargets = targetFields.filter(
    t => t.type === '__skip__' || !mapping.some(m => m.targetField === t.type)
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mapear columnas</h2>
          <p className="text-sm text-gray-500">
            {template ? `Plantilla detectada: ${template.name}` : 'Asigna cada columna del archivo al campo correspondiente'}
          </p>
        </div>
        <select value={importType} onChange={e => setImportType(e.target.value)} className="text-sm border rounded-lg px-3 py-1.5">
          <option value="clients">Clientes</option>
          <option value="accounting">Contabilidad</option>
          <option value="catalog">Servicios</option>
        </select>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {headers.map(header => (
          <div key={header} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1 font-medium text-sm text-gray-700 truncate">{header}</div>
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <select
              value={getSelected(header)}
              onChange={e => updateMapping(header, e.target.value)}
              className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-white"
            >
              {targetFields.map(tf => (
                <option key={tf.type} value={tf.type}>
                  {tf.label} {!mapping.some(m => m.targetField === tf.type && m.sourceField !== header) || tf.type === '__skip__' ? '' : '(ya asignado)'}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {unusedTargets.filter(t => t.type !== '__skip__').length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
          Campos sin asignar: {unusedTargets.filter(t => t.type !== '__skip__').map(t => t.label).join(', ')}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Atrás</button>
        <button
          onClick={() => onConfirm(mapping)}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          Confirmar mapeo
        </button>
      </div>
    </div>
  )
}
