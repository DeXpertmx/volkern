'use client'

import { useState, useRef } from 'react'

interface Props {
  onFileSelected: (file: File, result: any) => void
}

export function ImportFileUpload({ onFileSelected }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const validTypes = ['.csv', '.xlsx', '.xls']
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!validTypes.includes(ext)) {
      setError('Formato no soportado. Usa CSV o Excel (.xlsx, .xls)')
      return
    }

    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/import/detect', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error detectando formato')
      }
      const result = await res.json()
      onFileSelected(file, result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar archivo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Subir archivo</h2>
      <p className="text-sm text-gray-500 mb-6">Formatos aceptados: CSV, XLSX (Excel). Exportaciones de Sage, Microdata o genérico.</p>

      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {loading ? (
          <div className="text-indigo-600">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
            <p>Analizando archivo...</p>
          </div>
        ) : (
          <>
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-600">Arrastra tu archivo aquí o haz clic para seleccionar</p>
            <p className="text-xs text-gray-400 mt-1">CSV, XLSX o XLS</p>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
    </div>
  )
}
