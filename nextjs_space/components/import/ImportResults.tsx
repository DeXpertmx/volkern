'use client'

interface ImportResultData {
  success: boolean
  imported: number
  failed: number
  total: number
  errors: { row: number; field: string; message: string }[]
  logId: string
}

interface Props {
  result: ImportResultData
  onNewImport: () => void
}

export function ImportResults({ result, onNewImport }: Props) {
  const hasErrors = result.failed > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <div className="text-center mb-6">
        {result.failed === 0 ? (
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        )}

        <h2 className="text-lg font-semibold text-gray-900">
          {result.failed === 0 ? 'Importación completada' : 'Importación con errores'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">ID de importación: {result.logId || 'N/A'}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-gray-900">{result.total}</div>
          <div className="text-xs text-gray-500">Total registros</div>
        </div>
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{result.imported}</div>
          <div className="text-xs text-gray-500">Importados</div>
        </div>
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{result.failed}</div>
          <div className="text-xs text-gray-500">Errores</div>
        </div>
      </div>

      {hasErrors && result.errors.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Errores detectados</h3>
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-gray-100">
            {result.errors.map((err, i) => (
              <div key={i} className="p-3 text-sm">
                <span className="font-medium text-gray-700">Fila {err.row}:</span>{' '}
                <span className="text-gray-500">{err.field}</span> —{' '}
                <span className="text-red-600">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onNewImport} className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
        Nueva importación
      </button>
    </div>
  )
}
