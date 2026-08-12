'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckSquare, Square, GitCompareArrows } from 'lucide-react'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  ZOOM_WHEEL_STEP,
  adaptiveLensParams,
  clampZoom,
} from '@/components/finance/ocr-viewer-shared'

export interface ComparisonItem {
  field: string
  label: string
  /** Lo que leyó el parser genérico (puede ser null si no lo encontró). */
  ocrValue: string | null
  /** Lo que extrae la plantilla desde la región. */
  templateValue: string
  /** Valor de referencia guardado en la plantilla al aprenderla. */
  reference?: string | null
  /** La lectura no coincide con el formato del valor de referencia. */
  formatMismatch?: boolean
}

interface OcrComparisonModalProps {
  open: boolean
  items: ComparisonItem[]
  /** Imagen de la factura (blob/data URL si es posible; S3 como respaldo). */
  imageUrl?: string | null
  /** Páginas renderizadas del PDF, si el documento es un PDF. */
  pdfPages?: string[] | undefined
  /** Recibe solo los campos confirmados: field → templateValue. */
  onConfirm: (values: Record<string, string>) => void
  onClose: () => void
}

export default function OcrComparisonModal({ open, items, imageUrl, pdfPages, onConfirm, onClose }: OcrComparisonModalProps) {
  // Campos que el usuario decide aplicar desde la plantilla (todos por defecto)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Visor: página (para PDFs), zoom y lupa de precisión
  const [pdfPage, setPdfPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [lensPos, setLensPos] = useState<{ x: number; y: number; w: number; h: number; size: number; zoom: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imagePanelRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (open) setSelected(new Set(items.map(i => i.field)))
  }, [open, items])

  // Al abrir o cambiar de imagen se reinicia el visor
  useEffect(() => {
    if (open) {
      setPdfPage(0)
      setZoom(1)
      setLensPos(null)
    }
  }, [open, imageUrl, pdfPages])

  // Zoom con Ctrl + rueda sobre el panel de la imagen (listener nativo para
  // poder hacer preventDefault, ya que el onWheel de React es pasivo).
  useEffect(() => {
    const el = imagePanelRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(z => clampZoom(+(z - (e.deltaY > 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP)).toFixed(2)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

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

  const currentPageNumber = pdfPages?.length ? pdfPage + 1 : 1
  const currentImageUrl = pdfPages?.[pdfPage] || imageUrl

  // Convierte el cursor (relativo 0..1) a px CSS del contenedor para la lupa
  // y calcula el tamaño/aumento adaptativos según la densidad de la imagen.
  const updateLens = (p: { x: number; y: number }) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const w = rect.width / zoom
    const h = rect.height / zoom
    const naturalW = imgRef.current?.naturalWidth || 0
    const { size, zoom: lensZoom } = adaptiveLensParams(naturalW, w)
    setLensPos({ x: p.x * w, y: p.y * h, w, h, size, zoom: lensZoom })
  }

  const onPanelMove = (e: React.PointerEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    updateLens({
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-primary" />
            Comparar datos del escaneo
          </DialogTitle>
          <DialogDescription>
            La plantilla de este proveedor detectó campos distintos a los que leyó el OCR genérico.
            Revisa la imagen, marca cuáles quieres usar de la plantilla y confirma.
          </DialogDescription>
        </DialogHeader>

        {/* Visor de la imagen con zoom + lupa (mismo comportamiento que el de corrección) */}
        {currentImageUrl && (
          <div ref={imagePanelRef} className="overflow-auto bg-slate-100 rounded-lg p-3 max-h-[38vh]">
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border bg-white px-2 py-1.5">
              {pdfPages && pdfPages.length > 1 ? (
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPdfPage(page => Math.max(0, page - 1))} disabled={pdfPage === 0}>← Anterior</Button>
                  <span className="text-xs font-bold text-muted-foreground">Página {currentPageNumber} de {pdfPages.length}</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPdfPage(page => Math.min(pdfPages.length - 1, page + 1))} disabled={pdfPage >= pdfPages.length - 1}>Siguiente →</Button>
                </div>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setZoom(z => clampZoom(+(z - ZOOM_STEP).toFixed(2)))} disabled={zoom <= ZOOM_MIN} title="Reducir (Ctrl + rueda)">−</Button>
                <span className="text-xs font-bold text-muted-foreground w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setZoom(z => clampZoom(+(z + ZOOM_STEP).toFixed(2)))} disabled={zoom >= ZOOM_MAX} title="Ampliar (Ctrl + rueda)">＋</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setZoom(1)} disabled={zoom === 1} title="Restablecer zoom">100%</Button>
              </div>
            </div>
            <div
              ref={containerRef}
              className="relative inline-block touch-none select-none origin-top-left"
              style={{ zoom }}
              onPointerMove={onPanelMove}
              onPointerLeave={() => setLensPos(null)}
            >
              <img ref={imgRef} src={currentImageUrl} alt={`Factura, página ${currentPageNumber}`} className="block max-w-full" draggable={false} />
              {/* Lupa: amplía la zona bajo el cursor sin cambiar el zoom del visor */}
              {lensPos && (
                <div
                  className="absolute z-10 pointer-events-none overflow-hidden rounded-lg border-2 border-white shadow-xl"
                  style={{
                    left: Math.min(lensPos.w - lensPos.size, Math.max(0, lensPos.x + 18)),
                    top: Math.min(lensPos.h - lensPos.size, Math.max(0, lensPos.y - lensPos.size - 18)),
                    width: lensPos.size,
                    height: lensPos.size,
                    backgroundImage: `url(${currentImageUrl})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${lensPos.w * lensPos.zoom}px ${lensPos.h * lensPos.zoom}px`,
                    backgroundPosition: `${lensPos.size / 2 - lensPos.x * lensPos.zoom}px ${lensPos.size / 2 - lensPos.y * lensPos.zoom}px`,
                  }}
                >
                  <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-[2rem_1fr_1fr_1.2fr_1fr] gap-2 items-center px-2 py-1.5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span />
            <span>Campo</span>
            <span>OCR leyó</span>
            <span>Plantilla dice</span>
            <span>Referencia</span>
          </div>
          {items.map(item => {
            const on = selected.has(item.field)
            return (
              <button
                key={item.field}
                type="button"
                onClick={() => toggle(item.field)}
                className={`grid grid-cols-[2rem_1fr_1fr_1.2fr_1fr] gap-2 items-center w-full text-left px-2 py-2 rounded-lg border transition-colors ${
                  on
                    ? item.formatMismatch ? 'border-amber-400 bg-amber-50/60' : 'border-emerald-300 bg-emerald-50/60'
                    : 'border-muted-foreground/20 opacity-60'
                }`}
              >
                <span className={item.formatMismatch ? 'text-amber-600' : 'text-emerald-700'}>
                  {on ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="text-xs font-semibold flex items-center gap-1">
                  {item.label}
                  {item.formatMismatch && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1 py-0.5" title="La lectura no coincide con el formato del valor guardado en la plantilla">
                      ⚠ formato
                    </span>
                  )}
                </span>
                <span className={`text-xs font-mono ${item.ocrValue ? '' : 'text-muted-foreground italic'}`}>
                  {item.ocrValue || '— no leído —'}
                </span>
                <span className="text-xs font-mono text-emerald-800 font-semibold">{item.templateValue}</span>
                <span className={`text-[11px] font-mono ${item.reference ? '' : 'text-muted-foreground'}`}>
                  {item.reference || '—'}
                </span>
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
