'use client'

import { useState } from 'react'
import {
  Radio, Plus, Trash2, Pencil, Loader2, Save, X,
  Link2, Unlink, AlertTriangle, Copy, CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface GpsDeviceEntry {
  imei: string
  gpsDeviceId: string
}
interface FullMapping {
  mappings: GpsDeviceEntry[]
  count: number
}

// ═══════════════════════════════════════════════════════════════
// Fetcher
// ═══════════════════════════════════════════════════════════════

const fetcher = (url: string): Promise<FullMapping> =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error('Failed to fetch mappings')
    return r.json()
  })

const MAPPING_ENDPOINT = '/api/erp/logistics/gps/device-mapping'

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function GpsDeviceMappingPanel() {
  const { data, isLoading, mutate } = useSWR(MAPPING_ENDPOINT, fetcher, {
    refreshInterval: 0, // manual refresh only
  })

  const mappings: GpsDeviceEntry[] = data?.mappings || []

  // ── Add/Edit dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<GpsDeviceEntry | null>(null)
  const [formImei, setFormImei] = useState('')
  const [formDeviceId, setFormDeviceId] = useState('')
  const [formDeviceIdValid, setFormDeviceIdValid] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Delete confirmation state ──
  const [deleteTarget, setDeleteTarget] = useState<GpsDeviceEntry | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Copy feedback ──
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // ═══════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════

  const openAddDialog = () => {
    setEditingEntry(null)
    setFormImei('')
    setFormDeviceId('')
    setDialogOpen(true)
  }

  const openEditDialog = (entry: GpsDeviceEntry) => {
    setEditingEntry(entry)
    setFormImei(entry.imei)
    setFormDeviceId(entry.gpsDeviceId)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const imei = formImei.trim()
    const gpsDeviceId = formDeviceId.trim()

    if (!imei || !gpsDeviceId) {
      toast.error('Ambos campos son obligatorios')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(MAPPING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imei, gpsDeviceId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')

      const verb = data.mapping?.created ? 'creado' : 'actualizado'
      toast.success(`Mapeo ${verb}`, {
        description: `${imei} → ${gpsDeviceId}`,
        icon: <Link2 className="w-4 h-4 text-emerald-400" />,
      })

      setDialogOpen(false)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar el mapeo')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)
    try {
      const res = await fetch(`${MAPPING_ENDPOINT}?imei=${encodeURIComponent(deleteTarget.imei)}`, {
        method: 'DELETE',
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')

      toast.success('Mapeo eliminado', {
        description: `${deleteTarget.imei} → ${deleteTarget.gpsDeviceId}`,
        icon: <Unlink className="w-4 h-4 text-amber-400" />,
      })

      setDeleteTarget(null)
      mutate()
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar el mapeo')
    } finally {
      setDeleting(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════

  return (
    <>
      <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
        <CardHeader className="pb-4 border-b border-border dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                Mapeo de Dispositivos GPS
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground dark:text-slate-500 mt-1">
                Vincula IMEI de trackers Traccar con los deviceKey de vehículos Volkern
              </CardDescription>
            </div>
            <Button
              onClick={openAddDialog}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2"
            >
              <Plus className="w-4 h-4" />
              Añadir Mapeo
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : mappings.length === 0 ? (
            <div className="text-center p-12 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
              <Link2 className="w-10 h-10 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">
                No hay mapeos de dispositivos GPS
              </p>
              <p className="text-xs text-muted-foreground/60 dark:text-slate-600 mt-1">
                Vincula los IMEI de tus trackers Traccar con los deviceKey de los vehículos
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_100px] gap-3 px-4 py-2 mb-2">
                <span className="text-[10px] font-black uppercase text-muted-foreground dark:text-slate-500 tracking-widest">
                  IMEI (Traccar)
                </span>
                <span className="text-[10px] font-black uppercase text-muted-foreground dark:text-slate-500 tracking-widest">
                  Device Key (Volkern)
                </span>
                <span className="text-[10px] font-black uppercase text-muted-foreground dark:text-slate-500 tracking-widest text-right">
                  Acciones
                </span>
              </div>

              {/* Table rows */}
              <div className="space-y-2">
                <AnimatePresence>
                  {mappings.map((entry, i) => (
                    <motion.div
                      key={entry.imei}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                      className="grid grid-cols-[1fr_1fr_100px] gap-3 items-center p-3 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50 hover:border-cyan-600/20 hover:bg-accent dark:hover:bg-slate-800 transition-all group"
                    >
                      {/* IMEI */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                          <Radio className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                        <code className="text-sm font-mono text-foreground/80 dark:text-slate-300 truncate select-all">
                          {entry.imei}
                        </code>
                      </div>

                      {/* gpsDeviceId */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono py-0.5 px-2 shrink-0">
                          {entry.gpsDeviceId}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(entry.gpsDeviceId)}
                          className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Copiar deviceKey"
                        >
                          {copiedKey === entry.gpsDeviceId ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-muted-foreground dark:text-slate-500" />
                          )}
                        </Button>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(entry)}
                          className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent dark:hover:bg-slate-700"
                          title="Editar mapeo"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground dark:text-slate-400" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(entry)}
                          className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
                          title="Eliminar mapeo"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border dark:border-slate-800">
                <p className="text-[10px] font-bold text-muted-foreground dark:text-slate-500 uppercase">
                  {mappings.length} dispositivo{mappings.length !== 1 ? 's' : ''} mapeado{mappings.length !== 1 ? 's' : ''}
                </p>
                <p className="text-[10px] text-muted-foreground/60 dark:text-slate-600">
                  El bridge Traccar usa este mapeo para reenviar posiciones GPS a Volkern
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Add / Edit Dialog                                    */}
      {/* ══════════════════════════════════════════════════════ */}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] bg-card dark:bg-slate-900 border border-border dark:border-slate-700">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black uppercase tracking-tight text-foreground dark:text-white">
                {editingEntry ? 'Editar Mapeo' : 'Nuevo Mapeo GPS'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground dark:text-slate-400 font-medium">
                {editingEntry
                  ? `Modificando el mapeo para IMEI ${editingEntry.imei}`
                  : 'Vincula un IMEI de tracker Traccar con un deviceKey de Volkern'}
              </DialogDescription>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* IMEI */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-foreground/80 dark:text-slate-300">
                IMEI del Dispositivo
              </Label>
              <Input
                value={formImei}
                onChange={e => setFormImei(e.target.value)}
                placeholder="Ej: 864394041234567"
                disabled={!!editingEntry}
                className="bg-muted dark:bg-slate-800 border-border dark:border-slate-700 text-foreground dark:text-white placeholder:text-muted-foreground/60 dark:placeholder:text-slate-600 rounded-xl h-11 font-mono text-sm
                  disabled:opacity-60 disabled:cursor-not-allowed"
              />
              {editingEntry && (
                <p className="text-[10px] text-muted-foreground dark:text-slate-500">
                  El IMEI no se puede modificar. Elimina y crea uno nuevo si necesitas cambiarlo.
                </p>
              )}
            </div>

            {/* gpsDeviceId */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-foreground/80 dark:text-slate-300">
                Device Key (Volkern)
              </Label>
              <Input
                value={formDeviceId}
                onChange={e => {
                  setFormDeviceId(e.target.value)
                  setFormDeviceIdValid(true)
                }}
                onBlur={e => {
                  const upper = e.target.value.trim().toUpperCase()
                  setFormDeviceId(upper)
                  if (upper && !/^VK-GPS-[A-Z0-9]+-[A-Z0-9]+$/.test(upper)) {
                    setFormDeviceIdValid(false)
                  } else {
                    setFormDeviceIdValid(true)
                  }
                }}
                placeholder="Ej: VK-GPS-1234ABC-X7K2"
                className={`bg-muted dark:bg-slate-800 border text-emerald-400 placeholder:text-muted-foreground/60 dark:placeholder:text-slate-600 rounded-xl h-11 font-mono text-sm ${
                  formDeviceIdValid ? 'border-border dark:border-slate-700' : 'border-red-500/50 focus-visible:ring-red-500/20'
                }`}
              />
              <p className={`text-[10px] ${formDeviceIdValid ? 'text-muted-foreground dark:text-slate-500' : 'text-red-400'}`}>
                {formDeviceIdValid
                  ? 'Formato: VK-GPS-MATRICULA-CÓDIGO. Lo encuentras en la configuración GPS de cada vehículo.'
                  : 'Formato inválido. Debe ser: VK-GPS-XXXXX-XXXX (ej: VK-GPS-1234ABC-X7K2)'}
              </p>
            </div>

            {/* Info */}
            <div className="rounded-lg bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50 p-3 flex items-start gap-2">
              <Radio className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground dark:text-slate-400 leading-relaxed">
                Este mapeo será utilizado por el bridge Traccar para saber a qué vehículo de Volkern
                corresponde cada posición GPS recibida de tus trackers físicos.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="flex-1 border-border text-foreground/80 dark:border-slate-700 dark:text-slate-300 hover:text-foreground dark:hover:text-white hover:bg-accent dark:hover:bg-slate-800 h-11 rounded-xl text-xs font-bold uppercase gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </Button>              <Button
                onClick={handleSave}
                disabled={saving || !formImei.trim() || !formDeviceId.trim() || !formDeviceIdValid}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white h-11 rounded-xl text-xs font-black uppercase gap-1.5
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? 'Guardando...' : editingEntry ? 'Actualizar' : 'Crear Mapeo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                  */}
      {/* ══════════════════════════════════════════════════════ */}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent className="bg-card dark:bg-slate-900 border border-border dark:border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Eliminar Mapeo GPS
            </AlertDialogTitle>
            <AlertDialogDesc className="text-muted-foreground dark:text-slate-400 text-sm">
              ¿Estás seguro de eliminar el mapeo del dispositivo{' '}
              <strong className="text-foreground dark:text-white font-mono">{deleteTarget?.imei}</strong>?
              <br /><br />
              El bridge Traccar dejará de reenviar posiciones de este dispositivo a Volkern
              hasta que se cree un nuevo mapeo.
            </AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted dark:bg-slate-800 text-foreground/80 dark:text-slate-300 border-border dark:border-slate-700 hover:bg-accent dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 mr-1" />
              )}
              {deleting ? 'Eliminando...' : 'Sí, Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
