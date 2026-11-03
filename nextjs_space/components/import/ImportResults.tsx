'use client'

import { useState } from 'react'
import { descargarTexto, nombreCuarentena } from './descargar'
import type { RespuestaImportacionApi } from './ImportWizard'

interface Props {
  resultado: RespuestaImportacionApi
  onNewImport: () => void
  onDeshacer: () => Promise<{ borrados: number; restaurados: number } | undefined>
}

export function ImportResults({ resultado, onNewImport, onDeshacer }: Props) {
  const { informe } = resultado
  const escritos = resultado.escritos
  const [pasoDeshacer, setPasoDeshacer] = useState<'inicial' | 'confirmar' | 'deshaciendo' | 'hecho'>('inicial')
  const [mensajeDeshacer, setMensajeDeshacer] = useState<string | null>(null)
  const [errorDeshacer, setErrorDeshacer] = useState<string | null>(null)

  const deshacer = async () => {
    setPasoDeshacer('deshaciendo')
    setErrorDeshacer(null)
    try {
      const data = await onDeshacer()
      setMensajeDeshacer(
        data
          ? `Lote deshecho: ${data.borrados} registro(s) borrados y ${data.restaurados} restaurados.`
          : 'Lote deshecho.',
      )
      setPasoDeshacer('hecho')
    } catch (error) {
      setErrorDeshacer(error instanceof Error ? error.message : 'No se pudo deshacer')
      setPasoDeshacer('inicial')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <div className="text-center mb-6">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${informe.rechazadas > 0 ? 'bg-amber-100' : 'bg-green-100'}`}>
          <svg className={`w-8 h-8 ${informe.rechazadas > 0 ? 'text-amber-600' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {informe.rechazadas > 0 ? 'Importación completada con rechazos' : 'Importación completada'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">ID de importación: {resultado.logId}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-xl font-bold text-green-700">{informe.nuevas}</div>
          <div className="text-[11px] text-gray-500 uppercase">Nuevas</div>
        </div>
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-xl font-bold text-blue-700">{informe.actualizadas}</div>
          <div className="text-[11px] text-gray-500 uppercase">Actualizadas</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-xl font-bold text-red-700">{informe.rechazadas}</div>
          <div className="text-[11px] text-gray-500 uppercase">Rechazadas</div>
        </div>
        <div className="text-center p-3 bg-amber-50 rounded-lg">
          <div className="text-xl font-bold text-amber-700">{informe.posiblesDuplicados}</div>
          <div className="text-[11px] text-gray-500 uppercase">Sin escribir (posibles duplicados)</div>
        </div>
      </div>

      {resultado.erroresEjecucion.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Filas que fallaron al escribir</h3>
          <div className="max-h-40 overflow-y-auto border rounded-lg divide-y divide-gray-100">
            {resultado.erroresEjecucion.map((error, i) => (
              <div key={`e-${i}`} className="p-3 text-sm">
                <span className="font-medium text-gray-700">Fila {error.fila}:</span>{' '}
                <span className="text-red-600">{error.mensaje}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {informe.rechazadas > 0 && resultado.cuarentenaCsv && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Corrige las {informe.rechazadas} rechazadas y vuelve a subir solo ese fichero.
          </p>
          <button
            onClick={() => descargarTexto(nombreCuarentena(informe.tipo), resultado.cuarentenaCsv)}
            className="text-sm text-indigo-600 hover:text-indigo-800 underline"
          >
            Descargar cuarentena (CSV)
          </button>
        </div>
      )}

      {resultado.puedeDeshacerse && (
        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-1">Deshacer este lote</h3>
          <p className="text-xs text-gray-500 mb-3">
            Borra los {escritos} registros creados y devuelve su estado anterior a los actualizados. Solo
            funciona si es el último lote importado.
          </p>

          {pasoDeshacer === 'inicial' && (
            <button
              onClick={() => setPasoDeshacer('confirmar')}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Deshacer importación
            </button>
          )}

          {pasoDeshacer === 'confirmar' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700">¿Seguro? Se borrarán datos de esta importación.</span>
              <button
                onClick={deshacer}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Sí, deshacer
              </button>
              <button
                onClick={() => setPasoDeshacer('inicial')}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancelar
              </button>
            </div>
          )}

          {pasoDeshacer === 'deshaciendo' && <p className="text-sm text-gray-500">Deshaciendo…</p>}
          {pasoDeshacer === 'hecho' && <p className="text-sm text-green-700">{mensajeDeshacer}</p>}
          {errorDeshacer && <p className="text-sm text-red-600 mt-2">{errorDeshacer}</p>}
        </div>
      )}

      <button onClick={onNewImport} className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
        Nueva importación
      </button>
    </div>
  )
}
