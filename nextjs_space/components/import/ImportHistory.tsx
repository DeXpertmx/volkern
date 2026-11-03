'use client'

import { useState, useEffect } from 'react'

interface ImportLog {
  id: string
  type: string
  source: string
  fileName: string
  recordsTotal: number
  recordsImported: number
  recordsFailed: number
  status: string
  createdAt: string
}

export function ImportHistory() {
  const [logs, setLogs] = useState<ImportLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/import/history')
      .then(r => r.json())
      .then(data => setLogs(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const typeLabels: Record<string, string> = { clients: 'Clientes', accounting: 'Contabilidad', catalog: 'Servicios' }
  const statusColors: Record<string, string> = { completed: 'bg-green-100 text-green-700', partial: 'bg-amber-100 text-amber-700', failed: 'bg-red-100 text-red-700', reverted: 'bg-gray-200 text-gray-600' }
  const statusLabels: Record<string, string> = { completed: 'completada', partial: 'con rechazos', failed: 'fallida', reverted: 'deshecha' }

  if (loading) return <div className="text-sm text-gray-400 p-4 text-center">Cargando historial...</div>
  if (logs.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Historial de importaciones</h3>
      <div className="space-y-3">
        {logs.slice(0, 10).map(log => (
          <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
            <div>
              <span className="font-medium text-gray-700">{typeLabels[log.type] || log.type}</span>
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-500 capitalize">{log.source}</span>
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-500">{log.recordsImported}/{log.recordsTotal} registros</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[log.status] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabels[log.status] || log.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
