'use client'

import { useState } from 'react'
import { ImportFileUpload } from './ImportFileUpload'
import { ImportColumnMapping } from './ImportColumnMapping'
import { ImportPreview, type FilaCalidadApi, type InformeResumenApi } from './ImportPreview'
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

export interface RespuestaImportacionApi {
  mode: 'preview' | 'commit'
  informe: InformeResumenApi
  logId: string
  cuarentenaCsv: string
  puedeDeshacerse: boolean
  escritos: number
  erroresEjecucion: { fila: number; mensaje: string }[]
}

type Step = 'upload' | 'mapping' | 'preview' | 'results'

const PASOS: Step[] = ['upload', 'mapping', 'preview', 'results']

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMap[]>([])
  const [informe, setInforme] = useState<InformeResumenApi | null>(null)
  const [cuarentenaCsv, setCuarentenaCsv] = useState('')
  const [resultado, setResultado] = useState<RespuestaImportacionApi | null>(null)
  const [incluirPosibles, setIncluirPosibles] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tipo = (detectResult?.detectedType || 'clients') as ImportTypeOption

  const enviar = async (
    mode: 'preview' | 'commit',
    mapping: ColumnMap[] = columnMapping,
  ): Promise<RespuestaImportacionApi> => {
    if (!file) throw new Error('Selecciona un archivo')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('mapping', JSON.stringify(mapping))
    formData.append('mode', mode)
    formData.append('incluirPosiblesDuplicados', incluirPosibles ? 'true' : 'false')

    const res = await fetch(`/api/import/${tipo}`, { method: 'POST', body: formData })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'No se pudo procesar el archivo')
    return data as RespuestaImportacionApi
  }

  const handleFileSelected = (f: File, result: DetectResult) => {
    setFile(f)
    setDetectResult(result)
    setColumnMapping(result.suggestedMapping)
    setInforme(null)
    setResultado(null)
    setError(null)
    setStep('mapping')
  }

  const handleMappingConfirm = async (mapping: ColumnMap[]) => {
    setColumnMapping(mapping)
    setStep('preview')
    setInforme(null)
    setError(null)
    setLoading(true)
    try {
      const data = await enviar('preview', mapping)
      setInforme(data.informe)
      setCuarentenaCsv(data.cuarentenaCsv)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo analizar el archivo')
    } finally {
      setLoading(false)
    }
  }

  const handleExecuteImport = async () => {
    setImporting(true)
    setError(null)
    try {
      const data = await enviar('commit')
      setResultado(data)
      setStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar')
    } finally {
      setImporting(false)
    }
  }

  const handleBack = () => {
    if (step === 'mapping') setStep('upload')
    else if (step === 'preview') setStep('mapping')
    else if (step === 'results') {
      setStep('upload')
      setResultado(null)
      setInforme(null)
      setFile(null)
      setDetectResult(null)
      setError(null)
    }
  }

  const handleDeshacer = async () => {
    if (!resultado) return
    const res = await fetch('/api/import/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId: resultado.logId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'No se pudo deshacer la importación')
    setResultado((prev) =>
      prev
        ? {
            ...prev,
            puedeDeshacerse: false,
            informe: { ...prev.informe, avisosGenerales: [...prev.informe.avisosGenerales, 'Lote deshecho.'] },
          }
        : prev,
    )
    return data as { borrados: number; restaurados: number }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {PASOS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? 'bg-indigo-600 text-white'
                  : PASOS.indexOf(step) >= i
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'bg-gray-100 text-gray-400'
              }`}>
                {i + 1}
              </div>
              {i < PASOS.length - 1 && (
                <div className={`w-16 h-0.5 mx-1 ${PASOS.indexOf(step) > i ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 px-1">
          <span>Subir archivo</span>
          <span>Mapear columnas</span>
          <span>Revisar informe</span>
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
          tipo={tipo}
          informe={informe}
          loading={loading}
          importing={importing}
          incluirPosibles={incluirPosibles}
          onToggleIncluir={setIncluirPosibles}
          onExecute={handleExecuteImport}
          onBack={handleBack}
          cuarentenaCsv={cuarentenaCsv}
          error={error}
        />
      )}

      {step === 'results' && resultado && (
        <ImportResults resultado={resultado} onNewImport={handleBack} onDeshacer={handleDeshacer} />
      )}
    </div>
  )
}

export type { FilaCalidadApi }
