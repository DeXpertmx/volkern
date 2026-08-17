'use client'

import { useState } from 'react'
import { Info, ChevronDown, ChevronUp } from 'lucide-react'
import { PLACEHOLDER_GROUPS } from '@/lib/contratos/placeholders'

/**
 * Ayuda de placeholders dinámicos. Muestra los tokens disponibles agrupados
 * y permite insertarlos (o copiarlos) haciendo clic.
 */
export function PlaceholderHelp({
  onInsert,
  compact = false,
}: {
  /** Callback al hacer clic en un token (recibe el token sin llaves duplicadas) */
  onInsert?: (token: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-700 w-full text-left"
      >
        <Info className="h-3.5 w-3.5" />
        Placeholders dinámicos
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {PLACEHOLDER_GROUPS.map((g) => (
            <div key={g.group}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {g.fields.map((f) => (
                  <button
                    key={f.token}
                    type="button"
                    title={f.desc}
                    onClick={() => onInsert?.(f.token)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-blue-200 text-blue-800 hover:bg-blue-100 font-mono"
                  >
                    {f.token}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Los placeholders se rellenan automáticamente con los datos del contrato y de tu empresa al generar el PDF
            y en el portal de firma. Toca un token para insertarlo en el texto.
          </p>
        </div>
      )}
    </div>
  )
}
