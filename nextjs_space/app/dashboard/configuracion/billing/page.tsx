
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
      id: PLANS.ESENCIAL,
      name: '🟢 Esencial',
      price: '69€',
      features: PLAN_FEATURES[PLANS.ESENCIAL]
    },
    {
      id: PLANS.PROFESIONAL,
      name: '🔵 Profesional',
      price: '149€',
      features: PLAN_FEATURES[PLANS.PROFESIONAL],
      popular: true
    },
    {
      id: PLANS.INFINITY,
      name: '🟣 Infinity',
      price: '299€',
      features: PLAN_FEATURES[PLANS.INFINITY]
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

      {/* Quick link a Uso y Límites */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">¿Quieres ver el detalle de tu consumo?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Indicadores de uso y límites por feature</p>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href="/dashboard/configuracion/usage">
                Ver Uso y Límites
              </Link>
            </Button>
          </div>
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
