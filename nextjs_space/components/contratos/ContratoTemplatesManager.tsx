'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Plus, Pencil, Trash2, FileText, ScrollText } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

export interface ContratoTemplate {
  id: string
  nombre: string
  tipo: string
  descripcion: string | null
  clausulas: string | null
  condicionesPago: string | null
  esPorDefecto: boolean
}

const TIPO_LABELS: Record<string, string> = {
  servicio: 'Servicios',
  confidencialidad: 'Confidencialidad (NDA)',
  producto: 'Producto',
  mixto: 'Mixto',
  suscripcion: 'Suscripción',
  otro: 'Otro',
}

const EMPTY_FORM = { nombre: '', tipo: 'servicio', descripcion: '', clausulas: '', condicionesPago: '' }

export function ContratoTemplatesManager({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Al elegir una plantilla (para prellenar el formulario de creación) */
  onSelect?: (t: ContratoTemplate) => void
}) {
  const [templates, setTemplates] = useState<ContratoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/contratos/plantillas')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.plantillas || [])
      }
    } catch {
      toast.error('Error al cargar plantillas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) fetchTemplates()
  }, [open])

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
  }

  const startEdit = (t: ContratoTemplate) => {
    setEditingId(t.id)
    setForm({
      nombre: t.nombre,
      tipo: t.tipo,
      descripcion: t.descripcion || '',
      clausulas: t.clausulas || '',
      condicionesPago: t.condicionesPago || '',
    })
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre de la plantilla es requerido')
      return
    }
    setSaving(true)
    try {
      const url = editingId ? `/api/contratos/plantillas/${editingId}` : '/api/contratos/plantillas'
      const res = await apiFetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar la plantilla')
        return
      }
      toast.success(editingId ? 'Plantilla actualizada' : 'Plantilla creada')
      resetForm()
      fetchTemplates()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: ContratoTemplate) => {
    if (!confirm(`¿Eliminar la plantilla "${t.nombre}"?`)) return
    try {
      const res = await apiFetch(`/api/contratos/plantillas/${t.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Error al eliminar')
        return
      }
      toast.success('Plantilla eliminada')
      if (editingId === t.id) resetForm()
      fetchTemplates()
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handlePick = (t: ContratoTemplate) => {
    onSelect?.(t)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-700" /> Plantillas de contrato
          </DialogTitle>
          <DialogDescription>
            Crea plantillas reutilizables por tipo (servicios, confidencialidad, etc.) con su clausulado y condiciones de pago.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Listado */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aún no hay plantillas. Crea la primera abajo.
                </p>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border p-3 flex items-start justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-4 w-4 text-blue-700 shrink-0" />
                      <span className="font-medium text-sm">{t.nombre}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {TIPO_LABELS[t.tipo] || t.tipo}
                      </span>
                      {t.esPorDefecto && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                          Sistema
                        </span>
                      )}
                    </div>
                    {t.descripcion && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.descripcion}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t.clausulas ? `${t.clausulas.length} caracteres de cláusulas` : 'Sin cláusulas'}
                      {t.condicionesPago ? ' · con condiciones de pago' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onSelect && (
                      <Button size="sm" variant="outline" onClick={() => handlePick(t)}>
                        Usar
                      </Button>
                    )}
                    {!t.esPorDefecto && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => startEdit(t)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(t)} title="Eliminar" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulario */}
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <p className="text-sm font-medium">{editingId ? 'Editar plantilla' : 'Nueva plantilla'}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  placeholder="Ej: Contrato de servicios anual"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción del servicio / objeto</Label>
              <Textarea
                rows={2}
                placeholder="Descripción breve que se copiará al contrato..."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cláusulas (clausulado legal)</Label>
              <Textarea
                rows={6}
                placeholder={'PRIMERA. Objeto...\nSEGUNDA. Duración...\nTERCERA. Confidencialidad...'}
                value={form.clausulas}
                onChange={(e) => setForm({ ...form, clausulas: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Condiciones de pago</Label>
              <Textarea
                rows={2}
                placeholder="Ej: Pago a 30 días desde la emisión de la factura."
                value={form.condicionesPago}
                onChange={(e) => setForm({ ...form, condicionesPago: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : editingId ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {editingId ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm}>
                  Cancelar edición
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
