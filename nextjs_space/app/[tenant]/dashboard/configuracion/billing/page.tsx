
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Check, CreditCard, Loader2, AlertCircle, TrendingUp } from 'lucide-react'
import { PLANS, PLAN_FEATURES, PLAN_PRICES } from '@/lib/plans'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function BillingPage() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/subscriptions/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error fetching status:', error)
      toast.error('Error al cargar información de suscripción')
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (planId: string) => {
    if (status?.status === 'trial' && status?.plan === planId) {
      toast.error('Ya estás en este plan')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear suscripción')
      }

      // Redirigir a Stripe Checkout
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al procesar la suscripción')
    } finally {
      setActionLoading(false)
    }
  }

  const handleChangePlan = async (newPlanId: string) => {
    setSelectedPlan(newPlanId)
    setActionLoading(true)

    try {
      const response = await fetch('/api/subscriptions/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlanId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al cambiar plan')
      }

      toast.success(data.message || 'Plan actualizado exitosamente')
      await fetchStatus()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al cambiar el plan')
    } finally {
      setActionLoading(false)
      setSelectedPlan(null)
    }
  }

  const handleCancelSubscription = async () => {
    setActionLoading(true)
    try {
      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al cancelar suscripción')
      }

      toast.success(data.message || 'Suscripción cancelada')
      await fetchStatus()
      setShowCancelDialog(false)
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al cancelar suscripción')
    } finally {
      setActionLoading(false)
    }
  }

  const plans = [
    {
      id: PLANS.STARTER,
      name: '🟢 Starter',
      price: '49€',
      features: PLAN_FEATURES[PLANS.STARTER]
    },
    {
      id: PLANS.GROWTH,
      name: '🔵 Growth',
      price: '99€',
      features: PLAN_FEATURES[PLANS.GROWTH],
      popular: true
    },
    {
      id: PLANS.PRO,
      name: '🟣 Pro',
      price: '199€',
      features: PLAN_FEATURES[PLANS.PRO]
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Suscripción y Facturación</h1>
        <p className="text-gray-500 mt-1">Gestiona tu plan y métodos de pago</p>
      </div>

      {/* Current Plan Status */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Actual</CardTitle>
          <CardDescription>Tu plan y estado de suscripción</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-bold capitalize">{status?.plan || 'Trial'}</h3>
                <Badge variant={status?.status === 'activo' ? 'default' : 'secondary'}>
                  {status?.status === 'trial' ? 'Prueba Gratuita' : status?.status}
                </Badge>
              </div>
              {status?.trial && (
                <p className="text-sm text-gray-600 mt-1">
                  {status.trial.daysRemaining} días restantes de prueba
                </p>
              )}
              {status?.subscription && (
                <p className="text-sm text-gray-600 mt-1">
                  Renovación: {new Date(status.subscription.currentPeriodEnd).toLocaleDateString('es-ES')}
                </p>
              )}
            </div>

            {status?.status === 'activo' && status?.subscription && (
              <Button
                variant="outline"
                onClick={() => setShowCancelDialog(true)}
                disabled={actionLoading}
              >
                Cancelar Suscripción
              </Button>
            )}
          </div>

          {status?.subscription?.cancelAtPeriodEnd && (
            <div className="flex items-start gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900">
                  Tu suscripción está programada para cancelarse
                </p>
                <p className="text-sm text-yellow-800 mt-1">
                  Tendrás acceso hasta el {new Date(status.subscription.currentPeriodEnd).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Stats (si tienes limites) */}
      {status?.limits && (
        <Card>
          <CardHeader>
            <CardTitle>Uso Actual</CardTitle>
            <CardDescription>Límites de tu plan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{status.limits.leads === -1 ? '∞' : status.limits.leads}</p>
                <p className="text-sm text-gray-600">Leads</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{status.limits.users === -1 ? '∞' : status.limits.users}</p>
                <p className="text-sm text-gray-600">Usuarios</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{status.limits.emails_per_month === -1 ? '∞' : status.limits.emails_per_month}</p>
                <p className="text-sm text-gray-600">Emails/mes</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{status.limits.automation_runs === -1 ? '∞' : status.limits.automation_runs}</p>
                <p className="text-sm text-gray-600">Automatizaciones</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Banner */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/20 border-none rounded-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 -m-8 opacity-10 pointer-events-none">
           <TrendingUp className="w-64 h-64" />
        </div>
        <CardContent className="p-8 md:p-12 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 max-w-xl">
             <h2 className="text-3xl md:text-4xl font-black tracking-tight">Lleva tu negocio al siguiente nivel</h2>
             <p className="text-blue-100 text-lg leading-relaxed">
               Haz un upgrade de tu suscripción para acceder a automatizaciones avanzadas, límites extendidos de envíos y atención prioritaria.
             </p>
          </div>
          <Button 
            size="lg" 
            className="bg-white text-blue-600 hover:bg-slate-50 font-bold rounded-full px-8 py-6 h-auto text-lg shadow-2xl transition-transform hover:scale-105 shrink-0"
            onClick={() => window.open('https://dexpert.mx/contacto', '_blank')}
          >
            Hacer Upgrade
          </Button>
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu suscripción se cancelará al final del período de facturación actual.
              Seguirás teniendo acceso hasta entonces.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Confirmar Cancelación'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
