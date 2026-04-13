'use client'

import { useState } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Camera, MapPin, Loader2, ShieldCheck, MapIcon } from 'lucide-react'
import { toast } from 'sonner'

interface PunchClockModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  type: 'IN' | 'OUT'
  employeeId: string
  onSuccess: () => void
}

export function PunchClockModal({ isOpen, onOpenChange, type, employeeId, onSuccess }: PunchClockModalProps) {
  const [loading, setLoading] = useState(false)

  const handlePunch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. OBTENER GPS
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: true, 
          timeout: 5000 
        })
      })

      // 2. SIMULACION DE SELFIE (Vision-Lock)
      const mockSelfie = `https://cdn.volkern.app/attendance/selfie_${employeeId}_${Date.now()}.jpg`

      // 3. ENVIAR A API
      const res = await fetch('/api/erp/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          type,
          method: 'WEB',
          locationLat: position.coords.latitude,
          locationLng: position.coords.longitude,
          evidenceUrl: mockSelfie
        })
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      toast.success(result.message)
      onSuccess()
      onOpenChange(false)

    } catch (error: any) {
      toast.error(error.message || 'Error al registrar asistencia')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl overflow-hidden border-none p-0">
        <div className={cn(
          "p-6 text-white transition-colors duration-500",
          type === 'IN' ? "bg-emerald-600" : "bg-rose-600"
        )}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-white/20 text-white border-none text-[9px] font-black uppercase px-2 py-0.5 tracking-widest">
                Vision-Lock Attendance
              </Badge>
            </div>
            <DialogTitle className="text-3xl font-black uppercase italic tracking-tighter leading-none">
              {type === 'IN' ? 'Entrada al Turno' : 'Salida de Turno'}
            </DialogTitle>
            <DialogDescription className="text-white/80 text-[10px] font-medium uppercase tracking-wide">
              {type === 'IN' ? 'Inicia tu registro de horas efectivas.' : 'Finaliza tu jornada o sesión actual.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handlePunch} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Validación de Identidad (Selfie)</label>
              <div className="relative group cursor-pointer">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="camera"
                  className="absolute inset-0 opacity-0 z-20 cursor-pointer"
                  required
                />
                <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center gap-3 group-hover:border-primary/50 transition-all bg-slate-50 group-hover:bg-white">
                  <Camera className={cn(
                    "w-12 h-12 transition-colors",
                    type === 'IN' ? "text-emerald-400 group-hover:text-emerald-500" : "text-rose-400 group-hover:text-rose-500"
                  )} />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tómate una selfie</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-bold uppercase text-slate-600">Geofencing Activo</span>
                </div>
                <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500 font-black">Auditando...</Badge>
              </div>
              <p className="text-[9px] text-slate-400 leading-tight">
                Se validará tu ubicación actual contra el radio autorizado de planta o teletrabajo.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="submit" 
              className={cn(
                "w-full rounded-2xl h-16 font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-[1.02]",
                type === 'IN' 
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" 
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
              )}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <ShieldCheck className="w-6 h-6 mr-2" />}
              {loading ? 'Sincronizando...' : `Confirmar ${type === 'IN' ? 'Entrada' : 'Salida'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
