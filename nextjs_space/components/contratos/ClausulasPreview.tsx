'use client'

import { useMemo } from 'react'
import { Eye, AlertTriangle } from 'lucide-react'
import {
  getUnresolvedPlaceholders,
  resolvePlaceholders,
  type PlaceholderContext,
  type TenantContext,
} from '@/lib/contratos/placeholders'

/**
 * Vista previa en vivo de las cláusulas: resuelve los placeholders
 * dinámicos con los datos actuales del formulario (cliente, fechas,
 * totales, tenant) y resalta los tokens que queden sin resolver.
 */
export function ClausulasPreview({
  text,
  context,
  tenant,
}: {
  text: string
  context?: PlaceholderContext | null
  tenant?: TenantContext | null
}) {
  const { resolved, unresolved } = useMemo(() => {
    const out = resolvePlaceholders(text, context, tenant)
    const pending = getUnresolvedPlaceholders(text, context, tenant)
    return { resolved: out, unresolved: pending }
  }, [text, context, tenant])

  if (!text.trim()) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-200">
        <Eye className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-medium text-slate-600">Vista previa con datos reales</span>
        {unresolved.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            {unresolved.length} placeholder(s) sin dato
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm whitespace-pre-wrap text-justify leading-relaxed text-slate-700">{resolved}</p>
        {unresolved.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {unresolved.map((t) => (
              <code key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                {t}
              </code>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
