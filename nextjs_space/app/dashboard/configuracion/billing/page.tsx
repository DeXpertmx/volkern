'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Check, CreditCard, Loader2, AlertCircle, TrendingUp, ArrowRight, Shield, Sparkles } from 'lucide-react'
import { PLANS, ALL_MODULES } from '@/lib/plans'
import { VERTICAL_PLANS } from '@/lib/vertical-plans'
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
import { ComplianceProUpgrade } from '@/components/compliance/ComplianceProUpgrade'

const NEW_PLANS = [PLANS.SCALE, PLANS.COMPLIANCE]

// Etiqueta legible de cada módulo, para no listar ids crudos en las tarjetas.
const MODULE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.id, m.label]),
)

function isNewPlan(plan: string | undefined): boolean {
  return plan ? (NEW_PLANS as string[]).includes(plan) : false
}

function getPlanDisplayName(plan: string | undefined): string {
  switch (plan) {
    case 'scale': return 'Scale'
    case 'compliance': return 'Compliance Pro'
    case 'esencial': return 'Esencial'
    case 'profesional': return 'Profesional'
    case 'infinity': return 'Infinity'
    case 'trial': return 'Prueba gratuita'
    default: return plan || '—'
  }
}

function getPlanEmoji(plan: string | undefined): string {
  switch (plan) {
    case 'scale': return '🚀'
    case 'compliance': return '🔒'
    case 'esencial': return '🟢'
    case 'profesional': return '🔵'
    case 'infinity': return '🟣'
    default: return '📋'
  }
}

export default function BillingPage() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [successPolling, setSuccessPolling] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  // Polling post-checkout: refresh status after Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setSuccessPolling(true)
      let attempts = 0
      const maxAttempts = 15
      const interval = setInterval(async () => {
        attempts++
        const data = await fetchStatus()
        if (data && (data.status === 'activo' || attempts >= maxAttempts)) {
          setSuccessPolling(false)
          clearInterval(interval)
          window.history.replaceState({}, '', '/dashboard/configuracion/billing')
          if (data.status === 'activo') {
            toast.success('¡Pago confirmado! Tu suscripción está activa.')
          }
        }
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/subscriptions/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
        return data
      }
    } catch (error) {
      console.error('Error fetching status:', error)
      toast.error('Error al cargar información de suscripción')
    } finally {
      setLoading(false)
    }
    return null
  }

  const handleSubscribe = async (planId: string) => {
    if (status?.status === 'trial' && status?.plan === planId) {
      toast.error('Ya estás en este plan')
      return
    }

    setActionLoading(true)
    setSelectedPlan(planId)
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

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al procesar la suscripción')
    } finally {
      setActionLoading(false)
      setSelectedPlan(null)
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

  const currentPlan = status?.plan
  const isNew = isNewPlan(currentPlan)

  // Lo que la plataforma ofrece y cobra son las 8 verticales, con el precio que
  // publica lib/vertical-plans.ts (la misma fuente que usan la portada, /precios
  // y los términos legales). Esencial/Profesional/Infinity salieron de aquí
  // porque su checkout dependía de Stripe Price IDs que no existen en producción
  // y pulsarlos devolvía un 500.
  const verticals = VERTICAL_PLANS

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
          {successPolling && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-green-600" />
              <p className="text-sm text-green-800">Confirmando tu pago... esto puede tomar unos segundos.</p>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getPlanEmoji(currentPlan)}</span>
                <h3 className="text-2xl font-bold">{getPlanDisplayName(currentPlan)}</h3>
                <Badge variant={status?.status === 'activo' ? 'default' : 'secondary'}>
                  {status?.status === 'trial' ? 'Prueba Gratuita' : status?.status}
                </Badge>
                {isNew && (
                  <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                    Nuevo modelo
                  </Badge>
                )}
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
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {isNew ? (
                    <>
                      {currentPlan === PLANS.SCALE && (
                        <Button variant="outline" asChild className="font-medium border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                          <Link href="/precios" className="flex items-center gap-1">
                            <Shield className="w-4 h-4" />
                            Upgrade a Compliance Pro
                          </Link>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/precios" className="flex items-center gap-1">
                          Reconfigurar plan <ArrowRight className="w-3 h-3" />
                        </Link>
                      </Button>
                    </>
                  ) : verticals
                    .filter(v => v.id !== status.plan)
                    .map(v => (
                      <Button
                        key={v.id}
                        variant="outline"
                        onClick={() => handleChangePlan(v.id)}
                        disabled={actionLoading}
                        className="font-medium"
                      >
                        {actionLoading && selectedPlan === v.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Cambiar a {v.name}
                      </Button>
                    ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={actionLoading}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  Cancelar Suscripción
                </Button>
              </div>
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

      {/* Plan Selection for Trial Users */}
      {status?.status === 'trial' && (
        <Card className={`border-2 ${isNew ? 'border-purple-200 bg-purple-50/30' : 'border-indigo-200 bg-indigo-50/30'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Elige tu plan
            </CardTitle>
            <CardDescription>
              {isNew
                ? 'Configura tu plan según las necesidades de tu operación.'
                : `Tu prueba gratuita termina en ${status.trial?.daysRemaining || '?'} días. Selecciona un plan para continuar sin interrupción.`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {verticals.map((v) => {
                const destacados = v.modules
                  .map((id) => MODULE_LABEL[id])
                  .filter(Boolean)
                  .slice(0, 4)

                return (
                  <div
                    key={v.id}
                    className="bg-white rounded-xl p-5 border-2 border-gray-200 flex flex-col"
                  >
                    <h3 className="text-lg font-bold">{v.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{v.subtitle}</p>
                    <p className="text-2xl font-black mt-3">
                      {v.price}€<span className="text-sm font-normal text-gray-400">/mes</span>
                    </p>
                    <ul className="mt-4 space-y-2 mb-6 flex-1">
                      {destacados.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                          <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => handleSubscribe(v.id)}
                      disabled={actionLoading}
                      className="w-full font-bold"
                      variant="outline"
                    >
                      {actionLoading && selectedPlan === v.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Elegir {v.name}
                    </Button>
                  </div>
                )
              })}
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Precios sin impuestos. El detalle de cada vertical está en{' '}
              <Link href="/precios" className="text-purple-600 font-medium hover:underline">
                la página de precios
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {/* Compliance PRO Upgrade (only for non-Compliance active users) */}
      {status?.status === 'activo' && !isNew && (
        <Card className="border-indigo-200 overflow-hidden">
          <CardContent className="p-0">
            <div className="p-6">
              <ComplianceProUpgrade compact />
            </div>
          </CardContent>
        </Card>
      )}

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
