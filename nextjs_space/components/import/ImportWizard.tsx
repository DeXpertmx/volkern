'use client'

import { useState } from 'react'
import { ImportFileUpload } from './ImportFileUpload'
import { ImportColumnMapping } from './ImportColumnMapping'
import { ImportPreview } from './ImportPreview'
import { ImportResults } from './ImportResults'

export type ImportTypeOption = 'clients' | 'accounting' | 'catalog'
export type SourceOption = 'sage' | 'microdata' | 'generic'

interface ColumnMap {
  sourceField: string
  targetField: string
}

interface DetectResult {
  headers: string[]
  preview: Record<string, string>[]
  detectedSource: string | null
  detectedType: string | null
  template: { name: string } | null
  suggestedMapping: ColumnMap[]
}

interface ImportResultData {
  success: boolean
  imported: number
  failed: number
  total: number
  errors: { row: number; field: string; message: string }[]
  logId: string
}

type Step = 'upload' | 'mapping' | 'preview' | 'results'

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMap[]>([])
  const [importResult, setImportResult] = useState<ImportResultData | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFileSelected = async (f: File, result: DetectResult) => {
    setFile(f)
    setDetectResult(result)
    setColumnMapping(result.suggestedMapping)
    setStep('mapping')
  }

  const handleMappingConfirm = (mapping: ColumnMap[]) => {
    setColumnMapping(mapping)
    setStep('preview')
  }

  const handleExecuteImport = async () => {
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mapping', JSON.stringify(columnMapping))

      const type = detectResult?.detectedType || 'clients'
      const endpoint = `/api/import/${type}`

      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()
      setImportResult(data)
      setStep('results')
    } catch (err) {
      setImportResult({
        success: false,
        imported: 0,
        failed: 0,
        total: 0,
        errors: [{ row: 0, field: 'general', message: err instanceof Error ? err.message : 'Error de conexión' }],
        logId: '',
      })
      setStep('results')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (step === 'mapping') setStep('upload')
    else if (step === 'preview') setStep('mapping')
    else if (step === 'results') { setStep('upload'); setImportResult(null); setFile(null); setDetectResult(null) }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {['upload', 'mapping', 'preview', 'results'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-indigo-600 text-white' : 
                ['upload', 'mapping', 'preview', 'results'].indexOf(step) >= i ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {i + 1}
              </div>
              {i < 3 && <div className={`w-16 h-0.5 mx-1 ${['upload', 'mapping', 'preview', 'results'].indexOf(step) > i ? 'bg-indigo-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 px-1">
          <span>Subir archivo</span>
          <span>Mapear columnas</span>
          <span>Previsualizar</span>
          <span>Resultados</span>
        </div>
      </div>

      {step === 'upload' && <ImportFileUpload onFileSelected={handleFileSelected} />}
      {step === 'mapping' && detectResult && (
        <ImportColumnMapping
          headers={detectResult.headers}
          template={detectResult.template}
          initialMapping={columnMapping}
          onConfirm={handleMappingConfirm}
          onBack={handleBack}
        />
      )}
      {step === 'preview' && detectResult && (
        <ImportPreview
          preview={detectResult.preview}
          mapping={columnMapping}
          loading={loading}
          onExecute={handleExecuteImport}
          onBack={handleBack}
        />
      )}
      {step === 'results' && importResult && (
        <ImportResults result={importResult} onNewImport={handleBack} />
      )}
    </div>
  )
}
