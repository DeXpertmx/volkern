'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckSquare, Square, GitCompareArrows } from 'lucide-react'

export interface ComparisonItem {
  field: string
  label: string
  /** Lo que leyó el parser genérico (puede ser null si no lo encontró). */
  ocrValue: string | null
  /** Lo que extrae la plantilla desde la región. */
  templateValue: string
}

interface OcrComparisonModalProps {
  open: boolean
  items: ComparisonItem[]
  /** Recibe solo los campos confirmados: field → templateValue. */
  onConfirm: (values: Record<string, string>) => void
  onClose: () => void
}

export default function OcrComparisonModal({ open, items, onConfirm, onClose }: OcrComparisonModalProps) {
  // Campos que el usuario decide aplicar desde la plantilla (todos por defecto)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setSelected(new Set(items.map(i => i.field)))
  }, [open, items])

  const toggle = (field: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  const handleConfirm = () => {
    const values: Record<string, string> = {}
    for (const item of items) {
      if (selected.has(item.field)) values[item.field] = item.templateValue
    }
    onConfirm(values)
  }

  const count = selected.size

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-primary" />
            Comparar datos del escaneo
          </DialogTitle>
          <DialogDescription>
            La plantilla de este proveedor detectó campos distintos a los que leyó el OCR genérico.
            Marca cuáles quieres usar de la plantilla antes de aplicarlos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 items-center px-2 py-1.5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span />
            <span>Campo</span>
            <span>OCR leyó</span>
            <span>Plantilla dice</span>
          </div>
          {items.map(item => {
            const on = selected.has(item.field)
            return (
              <button
                key={item.field}
                type="button"
                onClick={() => toggle(item.field)}
                className={`grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 items-center w-full text-left px-2 py-2 rounded-lg border transition-colors ${
                  on ? 'border-emerald-300 bg-emerald-50/60' : 'border-muted-foreground/20 opacity-60'
                }`}
              >
                <span className="text-emerald-700">
                  {on ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="text-xs font-semibold">{item.label}</span>
                <span className={`text-xs font-mono ${item.ocrValue ? '' : 'text-muted-foreground italic'}`}>
                  {item.ocrValue || '— no leído —'}
                </span>
                <span className="text-xs font-mono text-emerald-800 font-semibold">{item.templateValue}</span>
              </button>
            )
          })}
        </div>

        <DialogFooter className="pt-3 border-t items-center">
          <p className="text-[11px] text-muted-foreground mr-auto">
            {count === 0
              ? 'Ningún campo seleccionado: no se aplicará nada.'
              : `${count} campo${count !== 1 ? 's' : ''} se aplicarán desde la plantilla.`}
          </p>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={count === 0} className="bg-emerald-700 hover:bg-emerald-800">
            Aplicar {count > 0 ? `${count} seleccionado${count !== 1 ? 's' : ''}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
