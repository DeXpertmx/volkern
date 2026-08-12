'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Save, Wand2, Trash2, MousePointerClick, X, Plus } from 'lucide-react'
import {
  OCR_FIELD_DEFS,
  applyTemplate,
  getOcrFieldDef,
  type OcrOverlay,
  type OcrTemplateField,
} from '@/lib/finance/ocr-template'

interface OcrCorrectionModalProps {
  open: boolean
  onClose: () => void
  /** URL de la imagen (S3 para imágenes, página 1 renderizada para PDFs). */
  imageUrl: string | null
  overlay: OcrOverlay | null
  supplierName: string
  supplierNif: string
  /** Recibe los valores extraídos por campo (p. ej. { fecha_emision: '24/07/2026' }). */
  onApply: (values: Record<string, string>) => void
}

interface TemplateMeta {
  id: string
  supplierName: string
  nif: string | null
  name: string
  fields: OcrTemplateField[]
  updatedAt: string
}

const NEW_TEMPLATE_ID = '__new__'

// Color por campo para distinguir las regiones anotadas
const FIELD_COLORS = [
  '#7c3aed', '#0891b2', '#d97706', '#059669', '#db2777', '#4f46e5', '#ca8a04', '#0284c7', '#9333ea', '#16a34a', '#e11d48', '#0d9488',
]

export default function OcrCorrectionModal({ open, onClose, imageUrl, overlay, supplierName, supplierNif, onApply }: OcrCorrectionModalProps) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<string>(NEW_TEMPLATE_ID)
  const [templateName, setTemplateName] = useState('Formato 1')
  const [fields, setFields] = useState<OcrTemplateField[]>([])
  const [selectedField, setSelectedField] = useState<string>(OCR_FIELD_DEFS[0].field)
  const [drawing, setDrawing] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<{ startX: number; startY: number } | null>(null)

  const colorFor = (field: string) => FIELD_COLORS[OCR_FIELD_DEFS.findIndex(f => f.field === field) % FIELD_COLORS.length]

  const isEditing = activeTemplateId !== NEW_TEMPLATE_ID
  const activeTemplate = templates.find(t => t.id === activeTemplateId) || null

  // Carga todas las plantillas del proveedor al abrir
  useEffect(() => {
    if (!open) return
    setFields([])
    setDrawing(null)
    setTemplates([])
    setActiveTemplateId(NEW_TEMPLATE_ID)
    setTemplateName('Formato 1')
    if (!supplierName) return
    setLoadingTemplate(true)
    const q = new URLSearchParams({ supplierName })
    if (supplierNif) q.set('nif', supplierNif)
    fetch(`/api/erp/expenses/ocr-templates?${q.toString()}`)
      .then(r => r.json())
      .then(data => {
        const list: TemplateMeta[] = Array.isArray(data?.templates) ? data.templates : (data?.template ? [data.template] : [])
        setTemplates(list)
        if (list.length > 0) {
          // La más reciente es la más probable para el formato actual
          setActiveTemplateId(list[0].id)
          setTemplateName(list[0].name)
          setFields(list[0].fields || [])
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTemplate(false))
  }, [open, supplierName, supplierNif])

  const loadTemplate = (id: string) => {
    if (id === NEW_TEMPLATE_ID) {
      setActiveTemplateId(NEW_TEMPLATE_ID)
      setFields([])
      setTemplateName(`Formato ${templates.length + 1}`)
      return
    }
    const t = templates.find(x => x.id === id)
    if (!t) return
    setActiveTemplateId(id)
    setTemplateName(t.name)
    setFields(t.fields || [])
  }

  const regionOf = (field: string) => fields.find(f => f.field === field)

  // Convierte un evento de puntero a coordenadas relativas 0..1
  const toRelative = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!selectedField) return
    const p = toRelative(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = { startX: p.x, startY: p.y }
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    const p = toRelative(e)
    if (!p) return
    const { startX, startY } = drawingRef.current
    setDrawing({
      x: Math.min(startX, p.x),
      y: Math.min(startY, p.y),
      w: Math.abs(p.x - startX),
      h: Math.abs(p.y - startY),
    })
  }

  const onPointerUp = () => {
    if (!drawingRef.current || !drawing || !selectedField) return
    const region = { ...drawing }
    drawingRef.current = null
    setDrawing(null)
    if (region.w < 0.01 || region.h < 0.01) return // clic sin arrastre: ignorar
    const def = getOcrFieldDef(selectedField)
    setFields(prev => [...prev.filter(f => f.field !== selectedField), { field: selectedField, label: def?.label || selectedField, ...region }])
  }

  const removeRegion = (field: string) => {
    setFields(prev => prev.filter(f => f.field !== field))
  }

  // Extrae valores de todas las regiones y los aplica al formulario
  const extractedValues = useMemo(() => {
    if (!overlay || fields.length === 0) return {}
    return applyTemplate(overlay, fields)
  }, [overlay, fields])

  const handleApply = () => {
    const values = extractedValues
    const count = Object.keys(values).length
    if (count === 0) {
      toast.warning('No se encontraron palabras dentro de las regiones dibujadas. Ajusta los rectángulos.')
      return
    }
    onApply(values)
    toast.success(`${count} campo${count !== 1 ? 's' : ''} corregido${count !== 1 ? 's' : ''} desde la imagen`)
  }

  const handleSave = async () => {
    if (!supplierName) {
      toast.error('Indica primero el proveedor en el formulario')
      return
    }
    if (fields.length === 0) {
      toast.warning('Dibuja al menos una región sobre la imagen antes de guardar la plantilla')
      return
    }
    const name = templateName.trim()
    if (!name) {
      toast.warning('Ponle un nombre a la plantilla (p. ej. "Factura estándar" o "Sucursal Madrid")')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/erp/expenses/ocr-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName,
          nif: supplierNif || undefined,
          name,
          fields,
          ...(isEditing ? { templateId: activeTemplateId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      toast.success(`Plantilla «${name}» guardada para ${supplierName}`)
      // Refresca la lista local para que el selector refleje el cambio
      const listRes = await fetch(`/api/erp/expenses/ocr-templates?${new URLSearchParams({ supplierName })}`)
      const listData = await listRes.json()
      if (Array.isArray(listData?.templates)) {
        setTemplates(listData.templates)
        const saved = listData.templates.find((t: TemplateMeta) => t.name === name) || listData.templates[0]
        if (saved) {
          setActiveTemplateId(saved.id)
          setTemplateName(saved.name)
          setFields(saved.fields || [])
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar la plantilla')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEditing || !activeTemplateId) return
    if (!window.confirm(`¿Eliminar la plantilla «${templateName}» de ${supplierName}?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/erp/expenses/ocr-templates?id=${encodeURIComponent(activeTemplateId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success(`Plantilla «${templateName}» eliminada`)
      const rest = templates.filter(t => t.id !== activeTemplateId)
      setTemplates(rest)
      if (rest.length > 0) {
        setActiveTemplateId(rest[0].id)
        setTemplateName(rest[0].name)
        setFields(rest[0].fields || [])
      } else {
        setActiveTemplateId(NEW_TEMPLATE_ID)
        setTemplateName('Formato 1')
        setFields([])
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointerClick className="h-5 w-5 text-primary" />
            Corregir datos sobre la imagen
          </DialogTitle>
          <DialogDescription>
            Selecciona el formato del proveedor (o crea uno nuevo), dibuja un rectángulo sobre cada dato que el OCR
            no leyó bien y guarda la plantilla para que el sistema lo lea solo en los próximos escaneos.
          </DialogDescription>
        </DialogHeader>

        {/* Selector de plantilla */}
        <div className="flex items-center gap-2 pb-2 border-b">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Plantilla:</span>
          <Select value={activeTemplateId} onValueChange={loadTemplate} disabled={loadingTemplate}>
            <SelectTrigger className="w-52 h-8 text-sm">
              <SelectValue placeholder="Elegir plantilla…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
              <SelectItem value={NEW_TEMPLATE_ID} className="text-primary">
                ＋ Nueva plantilla
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="Nombre del formato (p. ej. Factura estándar)"
            className="h-8 text-sm flex-1"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => loadTemplate(NEW_TEMPLATE_ID)} title="Crear nueva plantilla" disabled={loadingTemplate}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={handleDelete} title="Eliminar esta plantilla" disabled={!isEditing || deleting || loadingTemplate}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Lista de campos */}
          <div className="w-56 shrink-0 overflow-y-auto border rounded-lg p-2 space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1">
              1 · Elige el campo
            </p>
            {OCR_FIELD_DEFS.map(def => {
              const active = selectedField === def.field
              const hasRegion = !!regionOf(def.field)
              return (
                <button
                  key={def.field}
                  type="button"
                  onClick={() => setSelectedField(def.field)}
                  className={`w-full text-left text-xs rounded-md px-2 py-1.5 flex items-center justify-between gap-1 transition-colors ${
                    active ? 'bg-primary/10 ring-1 ring-primary/30 font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  <span className="truncate">{def.label}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: hasRegion ? colorFor(def.field) : 'transparent', border: hasRegion ? 'none' : '1px solid #cbd5e1' }}
                  />
                </button>
              )
            })}
            <div className="pt-2 mt-1 border-t space-y-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                2 · Dibuja sobre la imagen
              </p>
              <p className="text-[10px] text-muted-foreground px-1 leading-snug">
                {regionOf(selectedField)
                  ? 'Región guardada para este campo. Dibuja otra para moverla.'
                  : 'Arrastra un rectángulo sobre la imagen donde esté el dato.'}
              </p>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => removeRegion(selectedField)} disabled={!regionOf(selectedField)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Quitar región de «{getOcrFieldDef(selectedField)?.label}»
              </Button>
            </div>
          </div>

          {/* Imagen + overlay */}
          <div className="flex-1 min-w-0 overflow-auto bg-slate-100 rounded-lg p-3">
            {!imageUrl ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No hay imagen disponible (los PDFs se corrigen con el texto OCR crudo).
              </div>
            ) : (
              <div
                ref={containerRef}
                className="relative inline-block touch-none select-none"
                style={{ cursor: selectedField ? 'crosshair' : 'default' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <img src={imageUrl} alt="Factura" className="block max-w-full" draggable={false} />
                {/* Cajas de palabras del OCR */}
                {overlay?.words.map((w, i) => (
                  <div
                    key={i}
                    className="absolute border border-sky-400/40 bg-sky-400/5 pointer-events-none"
                    style={{
                      left: `${(w.x / overlay.width) * 100}%`,
                      top: `${(w.y / overlay.height) * 100}%`,
                      width: `${(w.w / overlay.width) * 100}%`,
                      height: `${(w.h / overlay.height) * 100}%`,
                    }}
                    title={w.text}
                  />
                ))}
                {/* Regiones guardadas */}
                {fields.map(f => (
                  <div
                    key={f.field}
                    className="absolute border-2 pointer-events-none"
                    style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: colorFor(f.field), background: `${colorFor(f.field)}1a` }}
                  >
                    <span
                      className="absolute -top-5 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded-t text-white whitespace-nowrap"
                      style={{ background: colorFor(f.field) }}
                    >
                      {getOcrFieldDef(f.field)?.label}
                    </span>
                  </div>
                ))}
                {/* Rectángulo en dibujo */}
                {drawing && (
                  <div
                    className="absolute border-2 border-dashed pointer-events-none"
                    style={{
                      left: `${drawing.x * 100}%`,
                      top: `${drawing.y * 100}%`,
                      width: `${drawing.w * 100}%`,
                      height: `${drawing.h * 100}%`,
                      borderColor: colorFor(selectedField),
                      background: `${colorFor(selectedField)}1a`,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Panel de valores extraídos */}
          <div className="w-60 shrink-0 overflow-y-auto border rounded-lg p-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1">
              3 · Valores detectados en las regiones
            </p>
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Aún no hay regiones dibujadas.</p>
            ) : (
              <div className="space-y-1.5">
                {fields.map(f => {
                  const def = getOcrFieldDef(f.field)
                  const value = extractedValues[f.field]
                  return (
                    <div key={f.field} className="rounded-md border p-2">
                      <p className="text-[10px] font-semibold flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: colorFor(f.field) }} />
                        {def?.label}
                      </p>
                      <p className={`text-xs mt-0.5 font-mono ${value ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                        {value || '— no encontrado —'}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            {loadingTemplate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando plantillas…
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t items-center">
          <p className="text-[11px] text-muted-foreground mr-auto">
            {templates.length === 0
              ? 'Sin plantillas guardadas para este proveedor todavía.'
              : isEditing
                ? `Editando «${templateName}» (${templates.length} plantilla${templates.length !== 1 ? 's' : ''} para este proveedor).`
                : `Nueva plantilla — ya hay ${templates.length} guardada${templates.length !== 1 ? 's' : ''} para este proveedor.`}
          </p>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" /> Cerrar
          </Button>
          <Button variant="secondary" onClick={handleApply} disabled={!imageUrl || fields.length === 0}>
            <Wand2 className="h-4 w-4 mr-1.5" /> Aplicar a los datos
          </Button>
          <Button onClick={handleSave} disabled={saving || !supplierName}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {isEditing ? 'Actualizar plantilla' : 'Guardar plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
