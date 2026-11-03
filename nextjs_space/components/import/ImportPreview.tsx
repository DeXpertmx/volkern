'use client'

import { useState } from 'react'
import { descargarTexto, nombreCuarentena } from './descargar'

export interface FilaCalidadApi {
  fila: number
  accion: string
  codigo: string | null
  motivo: string | null
  datos: Record<string, string>
  sePareceA?: string
  avisos: string[]
}

export interface InformeResumenApi {
  tipo: string
  total: number
  nuevas: number
  actualizadas: number
  rechazadas: number
  posiblesDuplicados: number
  omitidas: number
  aEscribir: number
  avisosGenerales: string[]
  muestras: {
    nuevas: FilaCalidadApi[]
    actualizadas: FilaCalidadApi[]
    rechazadas: FilaCalidadApi[]
    posiblesDuplicados: FilaCalidadApi[]
    omitidas: FilaCalidadApi[]
  }
}

interface Props {
  tipo: string
  informe: InformeResumenApi | null
  loading: boolean
  importing: boolean
  incluirPosibles: boolean
  onToggleIncluir: (valor: boolean) => void
  onExecute: () => void
  onBack: () => void
  cuarentenaCsv: string
  error: string | null
}

const TIPO_LABEL: Record<string, string> = {
  clients: 'clientes',
  catalog: 'servicios',
  accounting: 'cuentas contables',
}

const CODIGO_LABEL: Record<string, string> = {
  CAMPO_OBLIGATORIO: 'Falta un dato obligatorio',
  EMAIL_INVALIDO: 'Email inválido',
  NIF_INVALIDO: 'NIF inválido',
  PRECIO_INVALIDO: 'Precio inválido',
  SALDO_INVALIDO: 'Saldo inválido',
  DUPLICADO_FICHERO: 'Duplicado en el fichero',
  POSIBLE_DUPLICADO: 'Posible duplicado',
  CUENTA_DESCONOCIDA: 'Cuenta nueva',
}

function Contador({ valor, etiqueta, color }: { valor: number; etiqueta: string; color: string }) {
  return (
    <div className={`text-center p-3 rounded-lg border ${color}`}>
      <div className="text-xl font-bold">{valor}</div>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{etiqueta}</div>
    </div>
  )
}

export function ImportPreview({
  tipo,
  informe,
  loading,
  importing,
  incluirPosibles,
  onToggleIncluir,
  onExecute,
  onBack,
  cuarentenaCsv,
  error,
}: Props) {
  const [confirmed, setConfirmed] = useState(false)

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
        Analizando el archivo… no se escribe nada todavía.
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">No se pudo analizar el archivo</h2>
        <p className="text-sm text-red-600 mb-6">{error}</p>
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Volver al mapeo
        </button>
      </div>
    )
  }

  if (!informe) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-sm text-gray-500">
        Sin informe que mostrar.
      </div>
    )
  }

  const aEscribir = informe.nuevas + informe.actualizadas + (incluirPosibles ? informe.posiblesDuplicados : 0)
  const sinNadaQueEscribir = aEscribir === 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Informe antes de importar</h2>
      <p className="text-sm text-gray-500 mb-5">
        {informe.total} fila(s) leídas de {TIPO_LABEL[informe.tipo] || informe.tipo}. Nada se ha escrito todavía.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Contador valor={informe.nuevas} etiqueta="Nuevas" color="border-green-200 bg-green-50 text-green-700" />
        <Contador valor={informe.actualizadas} etiqueta="Actualizadas" color="border-blue-200 bg-blue-50 text-blue-700" />
        <Contador valor={informe.rechazadas} etiqueta="Rechazadas" color="border-red-200 bg-red-50 text-red-700" />
        <Contador
          valor={informe.posiblesDuplicados}
          etiqueta="Posibles duplicados"
          color="border-amber-200 bg-amber-50 text-amber-700"
        />
      </div>

      {informe.omitidas > 0 && (
        <p className="text-xs text-gray-500 mb-4">
          {informe.omitidas} fila(s) sin efecto (por ejemplo, saldo cero): no se escriben y no cuentan como error.
        </p>
      )}

      {informe.avisosGenerales.length > 0 && (
        <div className="mb-5 p-3 bg-blue-50 rounded-lg space-y-1">
          {informe.avisosGenerales.map((aviso) => (
            <p key={aviso} className="text-sm text-blue-800">{aviso}</p>
          ))}
        </div>
      )}

      {informe.rechazadas > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-sm font-medium text-gray-900">Por qué se rechazan</h3>
            {cuarentenaCsv && (
              <button
                onClick={() => descargarTexto(nombreCuarentena(informe.tipo), cuarentenaCsv)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                Descargar rechazadas (CSV)
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y divide-gray-100">
            {informe.muestras.rechazadas.map((fila) => (
              <div key={`r-${fila.fila}`} className="p-3 text-sm">
                <span className="font-medium text-gray-700">Fila {fila.fila}:</span>{' '}
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                  {fila.codigo ? CODIGO_LABEL[fila.codigo] || fila.codigo : 'Rechazada'}
                </span>{' '}
                <span className="text-gray-600">{fila.motivo}</span>
              </div>
            ))}
          </div>
          {informe.rechazadas > informe.muestras.rechazadas.length && (
            <p className="text-xs text-gray-400 mt-1">
              Se muestran {informe.muestras.rechazadas.length} de {informe.rechazadas}; la cuarentena lleva todas.
            </p>
          )}
        </div>
      )}

      {informe.posiblesDuplicados > 0 && (
        <div className="mb-5 border border-amber-200 bg-amber-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-amber-900 mb-1">Posibles duplicados: los decides tú</h3>
          <p className="text-xs text-amber-800 mb-2">
            Coinciden en nombre con un registro existente pero con otro email o NIF. No se fusionan solos.
          </p>
          <ul className="space-y-1 mb-3">
            {informe.muestras.posiblesDuplicados.map((fila) => (
              <li key={`d-${fila.fila}`} className="text-xs text-amber-900">
                Fila {fila.fila}: {fila.motivo}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm text-amber-900 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirPosibles}
              onChange={(e) => onToggleIncluir(e.target.checked)}
              className="rounded border-amber-400"
            />
            Importarlos también como registros nuevos ({informe.posiblesDuplicados})
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-sm text-gray-600">
          He revisado el informe y quiero escribir estos registros en el CRM
        </span>
      </label>

      <div className="flex justify-between items-center mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Atrás
        </button>
        <button
          onClick={onExecute}
          disabled={!confirmed || importing || sinNadaQueEscribir}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing
            ? 'Importando…'
            : sinNadaQueEscribir
              ? 'Nada que importar'
              : `Importar ${aEscribir} registro${aEscribir === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
