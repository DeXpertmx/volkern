'use client'

import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Truck, Radio, Copy, CheckCircle2, AlertTriangle,
  RefreshCw, Loader2, Clock, Thermometer, Navigation,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

interface VehicleGpsConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicle: {
    id: string
    plate: string
    brand: string
    model: string
    status: string
    gpsDeviceId?: string | null
    currentLat?: number | null
    currentLng?: number | null
    lastGpsUpdate?: string | null
    lastSpeed?: number | null
    currentTemp?: number | null
  }
  onGpsRegenerated?: () => void
}

export function VehicleGpsConfigDialog({ open, onOpenChange, vehicle, onGpsRegenerated }: VehicleGpsConfigDialogProps) {
  if (!vehicle) return null
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Derive deviceKey from props directly (avoids stale state when switching vehicles)
  const deviceKey = vehicle.gpsDeviceId || ''

  const hasGpsSignal = vehicle.currentLat != null && vehicle.currentLng != null
  const hasDeviceKey = !!vehicle.gpsDeviceId

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerate = async () => {
    setShowConfirm(false)
    setRegenerating(true)
    try {
      const res = await fetch(`/api/erp/logistics/fleet/${vehicle.id}/gps`, {
        method: 'PATCH',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al regenerar deviceKey')
      toast.success(`Nuevo deviceKey generado para ${vehicle.plate}`, {
        icon: <Radio className="w-4 h-4 text-emerald-400" />,
        description: 'Reconfigura el dispositivo IoT con el nuevo ID.',
      })
      onGpsRegenerated?.()
    } catch (err: any) {
      toast.error(err.message || 'Error al regenerar deviceKey')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px] bg-slate-900 border border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <Truck className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <DialogTitle className="text-lg font-black uppercase tracking-tight text-white">
              Configuración GPS
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 font-medium">
              {vehicle.plate} — {vehicle.brand} {vehicle.model}
            </DialogDescription>
          </div>
        </div>

        {/* GPS Status */}
        <div className={`rounded-xl p-4 mb-4 border ${
          hasGpsSignal
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : hasDeviceKey
              ? 'bg-amber-500/10 border-amber-500/20'
              : 'bg-slate-800/50 border-slate-700'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="relative">
              {hasGpsSignal ? (
                <>
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
                  <div className="relative w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </>
              ) : (
                <WifiOff className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${
              hasGpsSignal ? 'text-emerald-400' : hasDeviceKey ? 'text-amber-400' : 'text-slate-400'
            }`}>
              {hasGpsSignal ? 'GPS en Vivo' : hasDeviceKey ? 'Esperando Señal' : 'Sin Configurar'}
            </span>
          </div>

          {hasGpsSignal && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-slate-800/80 rounded-lg p-2.5 text-center">
                <Navigation className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-1" />
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Velocidad</p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {vehicle.lastSpeed != null ? `${vehicle.lastSpeed} km/h` : '--'}
                </p>
              </div>
              <div className="bg-slate-800/80 rounded-lg p-2.5 text-center">
                <Thermometer className={`w-3.5 h-3.5 mx-auto mb-1 ${
                  vehicle.currentTemp != null && vehicle.currentTemp > 28 ? 'text-red-400'
                    : vehicle.currentTemp != null && vehicle.currentTemp < 10 ? 'text-blue-400'
                    : 'text-emerald-400'
                }`} />
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Temp.</p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {vehicle.currentTemp != null ? `${vehicle.currentTemp.toFixed(1)}°C` : '--'}
                </p>
              </div>
              <div className="bg-slate-800/80 rounded-lg p-2.5 text-center">
                <Clock className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Última</p>
                <p className="text-xs font-bold text-white tabular-nums">
                  {vehicle.lastGpsUpdate
                    ? new Date(vehicle.lastGpsUpdate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                    : '--:--'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Device Key */}
        <div className="space-y-1.5 mb-4">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
            ID del Dispositivo GPS
          </Label>
          <div className="flex gap-2">
            <code className="flex-1 bg-slate-800 border border-slate-700 text-emerald-400 font-mono text-sm px-3 py-2.5 rounded-xl select-all truncate">
              {deviceKey || '—'}
            </code>
            {deviceKey && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCopy(deviceKey)}
                className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 h-11 px-3 rounded-xl shrink-0"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Regenerate */}
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-white mb-1">Regenerar DeviceKey</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Si el dispositivo IoT se perdió, fue reemplazado o crees que el key fue comprometido,
                puedes generar uno nuevo. El key anterior dejará de funcionar inmediatamente.
              </p>                <Button
                  type="button"
                  variant="outline"
                  disabled={regenerating}
                  onClick={() => setShowConfirm(true)}
                  className="border-amber-500/30 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-9 px-4 rounded-lg text-[10px] font-bold uppercase gap-1.5"
                >
                  {regenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {regenerating ? 'Regenerando...' : 'Regenerar'}
                </Button>
            </div>
          </div>
        </div>

        {/* Curl Example */}
        <div className="space-y-1.5 mb-4">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Ejemplo de configuración (curl)
          </Label>
          <pre className="bg-slate-950 border border-slate-700 text-xs text-slate-300 font-mono p-3 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap">
            {`# Enviar posición GPS desde el dispositivo\ncurl -X POST https://volkern.app/api/erp/logistics/gps/vehicle-poll \\\n  -H "Content-Type: application/json" \\\n  -d '{"deviceKey":"${deviceKey}","latitude":36.7213,"longitude":-4.4214,"speed":60}'`}
          </pre>
        </div>

        {/* Close */}
        <Button
          onClick={() => onOpenChange(false)}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-xs h-11 rounded-xl"
        >
          Cerrar
        </Button>
      </DialogContent>
      </Dialog>

      {/* Confirm regenerate */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-slate-900 border border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Regenerar DeviceKey
            </AlertDialogTitle>
            <AlertDialogDesc className="text-slate-400 text-sm">
              El deviceKey actual <strong className="text-white">{deviceKey}</strong> dejará de funcionar
              inmediatamente. Deberás reconfigurar el dispositivo IoT con el nuevo key.
              <br /><br />
              ¿Estás seguro de continuar?
            </AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerate}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              Sí, Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
