'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { 
  ShieldCheck, 
  ShieldAlert, 
  MapPin, 
  Link as LinkIcon, 
  Cpu, 
  CheckCircle2, 
  AlertTriangle,
  FileDigit,
  Fingerprint,
  Navigation,
  ExternalLink,
  Image as ImageIcon,
  CalendarClock,
  CreditCard
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

// Import map dynamically to avoid SSR issues
const VisionLockMap = dynamic(() => import('./VisionLockMap'), { 
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-slate-100 animate-pulse flex items-center justify-center rounded-xl text-xs font-bold text-slate-400 uppercase tracking-widest">Iniciando VISION-LOCK...</div>
})

interface ExpenseVerificationDetailsProps {
  expense: {
    id: string
    description: string
    amount: number
    currency: string
    dueDate?: string | Date | null
    paymentMethod?: string | null
    fingerprint?: string
    parentFingerprint?: string
    verificationStatus: string
    exifLat?: number
    exifLng?: number
    isAnomaly: boolean
    receiptUrl?: string | null
    // Desglose de impuestos (Veri*factu)
    taxableBase?: number | null
    vatRate?: number | null
    vatAmount?: number | null
    metadata?: {
      irpfRate?: number | null
      irpfAmount?: number | null
      surchargeRate?: number | null
      surchargeAmount?: number | null
      taxRegime?: string | null
      operationType?: string | null
      totalFactura?: number | null
    } | null
  }
  tenantConfig: {
    baseLatitude: number
    baseLongitude: number
  }
}

export default function ExpenseVerificationDetails({ expense, tenantConfig }: ExpenseVerificationDetailsProps) {
  const [isValidating, setIsValidating] = useState(false)

  const formatDate = (value?: string | Date | null) => {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-ES').format(date)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VALIDATED': return 'bg-emerald-100 text-emerald-700'
      case 'READY_FOR_PAYROLL': return 'bg-blue-100 text-blue-700'
      case 'PENDING': return 'bg-amber-100 text-amber-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Full Width: Receipt Image */}
      {expense.receiptUrl && (
        <div className="lg:col-span-12">
          <Card className="border-none shadow-premium overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-500" />
                Comprobante Original
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative rounded-xl overflow-hidden bg-slate-100 max-h-[400px] flex items-center justify-center">
                <img
                  src={`/api/erp/expenses/${expense.id}/receipt`}
                  alt="Comprobante del gasto"
                  className="max-w-full max-h-[400px] object-contain"
                />
              </div>
              <div className="mt-3">
                <a
                  href={`/api/erp/expenses/${expense.id}/receipt`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir comprobante en nueva pestaña
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header: Verification */}
      <div className="lg:col-span-12">
         <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-indigo-600 rounded-xl">
                 <ShieldCheck className="w-5 h-5 text-white" />
             </div>
             <div>
                 <h2 className="text-xl font-black uppercase tracking-tight">Verificación Veri*factu</h2>
                 <p className="text-xs text-muted-foreground font-medium">Gobernanza de integridad criptográfica y Chain-of-Trust.</p>
             </div>
         </div>
      </div>

      {/* Desglose de Impuestos */}
      <div className="lg:col-span-12">
        <Card className="border-none shadow-premium">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <FileDigit className="w-4 h-4 text-indigo-500" />
              Desglose de Impuestos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Base Imponible</p>
                <p className="text-sm font-black tracking-tight">
                  {expense.taxableBase != null ? `${expense.currency || 'EUR'} ${expense.taxableBase.toFixed(2)}` : '—'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">IVA</p>
                <p className="text-sm font-black tracking-tight">
                  {expense.vatAmount != null
                    ? `${expense.currency || 'EUR'} ${expense.vatAmount.toFixed(2)}${expense.vatRate != null ? ` (${expense.vatRate}%)` : ''}`
                    : '—'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">IRPF (Retención)</p>
                <p className="text-sm font-black tracking-tight">
                  {expense.metadata?.irpfAmount != null
                    ? `${expense.currency || 'EUR'} ${expense.metadata.irpfAmount.toFixed(2)}${expense.metadata.irpfRate != null ? ` (${expense.metadata.irpfRate}%)` : ''}`
                    : '—'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Total Factura</p>
                <p className="text-sm font-black tracking-tight">
                  {expense.metadata?.totalFactura != null
                    ? `${expense.currency || 'EUR'} ${expense.metadata.totalFactura.toFixed(2)}`
                    : `${expense.currency || 'EUR'} ${expense.amount.toFixed(2)}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Régimen y operación fiscal */}
      <Card className="lg:col-span-12 border-none shadow-premium">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-black uppercase tracking-widest">Clasificación fiscal</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Régimen</p>
            <p className="text-sm font-black">{expense.metadata?.taxRegime || '—'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Operación</p>
            <p className="text-sm font-black">{expense.metadata?.operationType || '—'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Tipo recargo</p>
            <p className="text-sm font-black">{expense.metadata?.surchargeRate != null ? `${expense.metadata.surchargeRate}%` : '—'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Cuota recargo</p>
            <p className="text-sm font-black">{expense.metadata?.surchargeAmount != null ? `${expense.currency || 'EUR'} ${expense.metadata.surchargeAmount.toFixed(2)}` : '—'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Condiciones de pago capturadas desde la factura */}
      <Card className="lg:col-span-12 border-none shadow-premium">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-500" />
            Condiciones de pago
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Vencimiento</p>
            <p className="text-sm font-black">{formatDate(expense.dueDate)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Moneda</p>
            <p className="text-sm font-black">{expense.currency || 'EUR'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[9px] font-black text-muted-foreground uppercase mb-1 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Forma de pago</p>
            <p className="text-sm font-black">{expense.paymentMethod || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-5 border-none shadow-premium bg-slate-50/50">
        <CardHeader className="pb-3 text-center lg:text-left">
          <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center justify-center lg:justify-start gap-2">
            <Fingerprint className="w-4 h-4 text-indigo-500" />
            Huella Digital (SHA-256)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Gasto Actual</span>
            <div className="p-3 bg-white rounded-xl border border-slate-200 font-mono text-[10px] break-all shadow-sm leading-relaxed">
              {expense.fingerprint || 'GENERANDO HUELLA...'}
            </div>
          </div>

          <div className="flex flex-col items-center py-2 relative">
             <div className="w-px h-8 bg-dashed border-l border-dashed border-slate-300"></div>
             <LinkIcon className="w-4 h-4 text-slate-300 absolute top-1/2 -translate-y-1/2 bg-slate-50 z-10" />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Gasto Anterior (Parent Fingerprint)</span>
            <div className="p-3 bg-white/50 rounded-xl border border-slate-100 font-mono text-[10px] break-all text-slate-400">
              {expense.parentFingerprint || 'RAÍZ DE CADENA'}
            </div>
          </div>

          <div className="pt-4">
             <div className="p-4 rounded-xl bg-indigo-950 text-white flex items-start gap-4 shadow-xl">
                <Cpu className="w-5 h-5 text-indigo-400 shrink-0" />
                <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Resumen Criptográfico</p>
                   <p className="text-xs leading-relaxed font-medium">
                      Este registro está inyectado en la cadena de confianza. Cualquier modificación alterará el hash de los tickets futuros, garantizando <span className="text-indigo-400 font-bold">Inmutabilidad Total</span>.
                   </p>
                </div>
             </div>
          </div>
        </CardContent>
      </Card>

      {/* Right Column: VISION-LOCK & Location Anomaly */}
      <Card className="lg:col-span-7 border-none shadow-premium overflow-hidden">
        <CardHeader className="bg-slate-900 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
               <Navigation className="w-4 h-4 text-primary" />
               <CardTitle className="text-xs font-black uppercase tracking-widest">VISION-LOCK (Aislamiento de Mermas)</CardTitle>
            </div>
            {expense.isAnomaly ? (
               <Badge className="bg-rose-500 text-white border-none font-black text-[9px] px-2 animate-pulse">ANOMALÍA DETECTADA</Badge>
            ) : (
               <Badge className="bg-emerald-500 text-white border-none font-black text-[9px] px-2 uppercase tracking-tighter">UBICACIÓN VÁLIDA</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 relative">
          {expense.exifLat && expense.exifLng ? (
            <VisionLockMap 
              exifLat={expense.exifLat} 
              exifLng={expense.exifLng} 
              baseLat={tenantConfig.baseLatitude} 
              baseLng={tenantConfig.baseLongitude}
              distance={0} // Computed inside map or here
            />
          ) : (
            <div className="h-[300px] flex items-center justify-center bg-slate-50 text-slate-400 italic text-sm">
                Sin coordenadas EXIF disponibles
            </div>
          )}

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Coordenadas EXIF</p>
                  <p className="text-sm font-bold tracking-tight">{expense.exifLat?.toFixed(5) || 'N/A'}, {expense.exifLng?.toFixed(5) || 'N/A'}</p>
               </div>
               <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-inner">
                  <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Radio de Control</p>
                  <p className="text-sm font-bold tracking-tight">500m (Standard)</p>
               </div>
            </div>

            {expense.isAnomaly && (
               <div className="flex items-start gap-4 p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <div className="space-y-1">
                     <p className="text-xs font-black uppercase tracking-tight">Alerta de Proximidad</p>
                     <p className="text-xs font-medium">El ticket fue capturado fuera del perímetro permitido (&gt;500m). Posible duplicidad o uso indebido de recursos del Tenant.</p>
                  </div>
               </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Footer */}
      <div className="lg:col-span-12 pt-4">
          <Card className="border-none shadow-md bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
             <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                   <div className={`p-2 rounded-xl ${getStatusColor(expense.verificationStatus)} bg-white/10 text-white`}>
                      {expense.verificationStatus === 'VALIDATED' ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                   </div>
                   <div>
                      <h4 className="font-bold text-lg leading-tight uppercase">Estado: {expense.verificationStatus}</h4>
                      <p className="text-xs text-slate-300 font-medium whitespace-nowrap">Validación automática completada mediante orquestación Volkern.</p>
                   </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                   <Button variant="outline" className="flex-1 md:flex-none rounded-xl border-white/10 hover:bg-white/10 text-white font-bold h-12 uppercase text-[10px]">
                      Solicitar Auditoría Humana
                   </Button>
                   <Button className="flex-1 md:flex-none rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black h-12 px-8 uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-500/20">
                      Criptográficamente Validado
                   </Button>
                </div>
             </CardContent>
          </Card>
      </div>
    </div>
  )
}
