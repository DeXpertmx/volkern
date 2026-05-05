'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditCard, AlertCircle, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ResolvePaymentPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [subscription, setSubscription] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSubscription()
  }, [params.id])

  const fetchSubscription = async () => {
    try {
      const res = await fetch(`/api/public/subscriptions/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setSubscription(data)
      } else {
        setError('Suscripción no encontrada o enlace expirado.')
      }
    } catch (err) {
      setError('Error al conectar con el servidor de pagos.')
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async () => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/public/subscriptions/${params.id}/resolve`, {
        method: 'POST'
      })
      
      if (res.ok) {
        toast.success('Pago procesado correctamente. Suscripción reactivada.')
        setSubscription({ ...subscription, estado: 'activa' })
      } else {
        toast.error('No se ha podido procesar el pago. Intente con otro método.')
      }
    } catch (err) {
      toast.error('Error de red.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )

  if (error || !subscription) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-red-100 shadow-xl">
        <CardContent className="pt-8 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold">Error de Acceso</h2>
          <p className="text-slate-500 text-sm">{error}</p>
          <Button variant="outline" className="w-full" onClick={() => router.push('/')}>Volver al Inicio</Button>
        </CardContent>
      </Card>
    </div>
  )

  const isResolved = subscription.estado === 'activa'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-8">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="bg-primary/10 w-fit p-3 rounded-2xl mx-auto mb-4">
            <CreditCard className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">CENTRO DE PAGOS</h1>
          <p className="text-sm text-slate-500 font-medium">Nexus Financial Recovery System</p>
        </div>

        <Card className="border-none shadow-2xl shadow-slate-200 ring-1 ring-slate-100 overflow-hidden">
          <CardHeader className="bg-slate-900 text-white p-8">
            <div className="flex justify-between items-center mb-2">
              <CardTitle className="text-xl font-bold">Resumen de Deuda</CardTitle>
              <Badge className={isResolved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 animate-pulse'}>
                {isResolved ? 'CUENTA AL DÍA' : 'PAGO PENDIENTE'}
              </Badge>
            </div>
            <CardDescription className="text-slate-400 font-mono text-xs uppercase tracking-widest">
              ID: {subscription.id.substring(0, 8)}... | Contrato: {subscription.metadata?.contractNumber || 'VKL-CONT'}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-8 space-y-8">
            <div className="flex justify-between items-end pb-8 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Monto a Regularizar</p>
                <p className="text-5xl font-black text-slate-900 tracking-tighter">
                  {subscription.monto} <span className="text-xl font-medium text-slate-400">{subscription.moneda}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-500">{subscription.planNombre}</p>
                <p className="text-[10px] text-slate-400">Servicio recurrente</p>
              </div>
            </div>

            {isResolved ? (
              <div className="bg-emerald-50 p-8 rounded-2xl border border-emerald-100 flex flex-col items-center gap-4 text-center animate-in fade-in zoom-in duration-500">
                <div className="bg-emerald-500 p-3 rounded-full shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-emerald-900 text-lg">¡Pago Confirmado!</h3>
                  <p className="text-sm text-emerald-700 leading-relaxed">
                    Su suscripción ha sido reactivada automáticamente. Los servicios han sido restaurados con éxito.
                  </p>
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2" onClick={() => router.push('/')}>
                  Finalizar y Salir
                </Button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-4">
                  <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-amber-900">Atención Requerida</p>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Se han agotado los intentos de cobro automático. Para evitar la cancelación permanente de su contrato, regularice su saldo ahora.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Button 
                    className="w-full h-16 text-xl font-black premium-gradient-primary border-none shadow-xl shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={handleResolve}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="h-6 w-6 animate-spin mr-3" />
                    ) : (
                      <CreditCard className="h-6 w-6 mr-3" />
                    )}
                    PAGAR DEUDA PENDIENTE
                  </Button>
                  <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Pago seguro procesado por Volkern Financial Gate
                  </p>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="bg-slate-50/50 p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-widest">
                <ShieldCheck className="h-4 w-4 text-primary" /> ENCRIPTACIÓN SSL 256-BIT
              </div>
              <div className="flex gap-3 grayscale opacity-50">
                <div className="h-5 w-8 bg-slate-300 rounded-sm" />
                <div className="h-5 w-8 bg-slate-300 rounded-sm" />
                <div className="h-5 w-8 bg-slate-300 rounded-sm" />
              </div>
            </div>
          </CardFooter>
        </Card>

        <div className="flex justify-center gap-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          <span className="hover:text-primary transition-colors cursor-pointer">Soporte Técnico</span>
          <span className="hover:text-primary transition-colors cursor-pointer">Política de Reembolso</span>
          <span className="hover:text-primary transition-colors cursor-pointer">Seguridad Nexus</span>
        </div>
      </div>
    </div>
  )
}
