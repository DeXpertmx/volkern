'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Truck, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

const VEHICLE_TYPES = [
  { value: 'camion', label: 'Camión' },
  { value: 'furgoneta', label: 'Furgoneta' },
  { value: 'remolque', label: 'Remolque' },
  { value: 'turismo', label: 'Turismo' },
  { value: 'moto', label: 'Moto' },
]

const FUEL_TYPES = [
  { value: 'diesel', label: 'Diésel' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'gas', label: 'Gas (GLP/CNG)' },
]

interface AddVehicleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AddVehicleDialog({ open, onOpenChange, onSuccess }: AddVehicleDialogProps) {
  const [loading, setLoading] = useState(false)
  const [createdVehicle, setCreatedVehicle] = useState<{
    plate: string
    gpsDeviceId: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    type: 'furgoneta',
    capacity: 1000,
    capacityUnit: 'kg',
    fuelType: 'diesel',
  })

  const resetForm = () => {
    setForm({
      plate: '',
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      type: 'furgoneta',
      capacity: 1000,
      capacityUnit: 'kg',
      fuelType: 'diesel',
    })
  }

  const closeDialog = () => {
    setCreatedVehicle(null)
    onOpenChange(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.plate || !form.brand || !form.model) {
      toast.error('Completa los campos obligatorios: matrícula, marca y modelo')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/erp/logistics/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear vehículo')

      const vehicle = data.vehicle
      setCreatedVehicle({
        plate: vehicle.plate,
        gpsDeviceId: vehicle.gpsDeviceId,
      })
      resetForm()
      onSuccess?.()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear vehículo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) closeDialog(); }}>
      <DialogContent className="sm:max-w-[520px] bg-slate-900 border border-slate-700 text-white">
        {createdVehicle ? (
          /* ── GPS Connection Panel ── */
          <div className="py-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Truck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-white">
                  Vehículo Creado
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {createdVehicle.plate} — Configura el dispositivo GPS
                </p>
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
                  <div className="relative w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  GPS Conectado ✓
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                El vehículo tiene un ID de dispositivo GPS único. Configúralo en tu dispositivo IoT
                para empezar a recibir posiciones en tiempo real.
              </p>
            </div>

            {/* Device ID */}
            <div className="space-y-1.5 mb-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                ID del Dispositivo GPS
              </Label>
              <div className="flex gap-2">
                <code className="flex-1 bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-sm px-3 py-2.5 rounded-xl select-all">
                  {createdVehicle.gpsDeviceId}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdVehicle.gpsDeviceId)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 h-11 px-4 rounded-xl"
                >
                  {copied ? '✓' : 'Copiar'}
                </Button>
              </div>
            </div>

            {/* CURL Example */}
            <div className="space-y-1.5 mb-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Ejemplo de configuración (curl)
              </Label>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-700 text-xs text-slate-300 font-mono p-3 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap">
                  {`# Enviar posición GPS desde el dispositivo\ncurl -X POST https://volkern.app/api/erp/logistics/gps/vehicle-poll \\\n  -H "Content-Type: application/json" \\\n  -d '{"deviceKey":"${createdVehicle.gpsDeviceId}","latitude":36.7213,"longitude":-4.4214,"speed":60}'`}
                </pre>
              </div>
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                <strong className="text-amber-400">📡 Consejo:</strong> Configura el dispositivo GPS
                para enviar la posición cada 30-60 segundos usando el ID de dispositivo de arriba.
                El sistema actualizará automáticamente la posición del vehículo en el mapa.
              </p>
            </div>

            <Button
              onClick={closeDialog}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs h-11 rounded-xl"
            >
              Entendido
            </Button>
          </div>
        ) : (
          /* ── Creation Form ── */
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black uppercase tracking-tight text-white">
                    Añadir Vehículo
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-400 font-medium">
                    Registra un nuevo vehículo en la flota
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Matrícula */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Matrícula <span className="text-red-400">*</span>
                </Label>
                <Input
                  placeholder="Ej: 1234ABC"
                  value={form.plate}
                  onChange={(e) => setForm(f => ({ ...f, plate: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 h-11 rounded-xl"
                  required
                />
              </div>

              {/* Marca y Modelo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Marca <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    placeholder="Ej: Mercedes-Benz"
                    value={form.brand}
                    onChange={(e) => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 h-11 rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Modelo <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    placeholder="Ej: Sprinter"
                    value={form.model}
                    onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 h-11 rounded-xl"
                    required
                  />
                </div>
              </div>

              {/* Año y Tipo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">Año</Label>
                  <Input
                    type="number"
                    min={2000}
                    max={new Date().getFullYear() + 1}
                    value={form.year}
                    onChange={(e) => setForm(f => ({ ...f, year: parseInt(e.target.value) || new Date().getFullYear() }))}
                    className="bg-slate-800 border-slate-700 text-white h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      {VEHICLE_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Capacidad y Combustible */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">Capacidad</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={form.capacity}
                      onChange={(e) => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 0 }))}
                      className="bg-slate-800 border-slate-700 text-white h-11 rounded-xl flex-1"
                    />
                    <Select value={form.capacityUnit} onValueChange={(v) => setForm(f => ({ ...f, capacityUnit: v }))}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-11 rounded-xl w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="m³">m³</SelectItem>
                        <SelectItem value="palets">palés</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">Combustible</Label>
                  <Select value={form.fuelType} onValueChange={(v) => setForm(f => ({ ...f, fuelType: v }))}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      {FUEL_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeDialog}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 h-11 px-6 rounded-xl text-xs font-bold uppercase"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white font-black uppercase text-xs h-11 px-6 rounded-xl gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {loading ? 'Creando...' : 'Crear Vehículo'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
