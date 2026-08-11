'use client'

import { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/**
 * Editor de tipos de IVA (p. ej. [21, 10, 4]) con chips añadir/eliminar.
 * Un proveedor puede facturar a varios tipos; estos se ofrecen al registrar
 * un gasto. Se usa en la página de proveedores y en el formulario de gasto.
 */
export default function IvaRatesEditor({
  value,
  onChange,
  placeholder = '21',
}: {
  value: number[]
  onChange: (v: number[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')

  const addRate = () => {
    const n = parseFloat(input.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0 && !value.includes(n)) {
      onChange([...value, n].sort((a, b) => a - b))
    }
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sin tipos configurados (se usará el que indiques en el gasto)</span>
        ) : (
          value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 text-primary text-xs font-bold px-2 py-1">
              {v}%
              <button
                type="button"
                onClick={() => onChange(value.filter(x => x !== v))}
                className="hover:text-rose-500 leading-none"
                aria-label={`Quitar ${v}%`}
              >×</button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRate() } }}
          placeholder={placeholder}
          className="rounded-xl h-9 w-24"
        />
        <Button type="button" variant="outline" size="sm" onClick={addRate} className="rounded-xl h-9">Añadir tipo</Button>
      </div>
    </div>
  )
}
