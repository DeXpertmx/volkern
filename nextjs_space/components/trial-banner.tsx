
'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CreditCard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function TrialBanner() {
  const [status, setStatus] = useState<any>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/subscriptions/status')
        if (response.ok) {
          const data = await response.json()
          setStatus(data)
        }
      } catch (error) {
        console.error('Error fetching subscription status:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  if (loading || dismissed || !status) return null

  // Solo mostrar si está en trial
  if (status.status !== 'trial' || !status.trial) return null

  const daysRemaining = status.trial.daysRemaining
  const isUrgent = daysRemaining <= 3

  return (
    <div className={`relative ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'} border-b px-4 py-3`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <AlertCircle className={`w-5 h-5 ${isUrgent ? 'text-red-600' : 'text-blue-600'} flex-shrink-0`} />
          <div className="flex-1">
            <p className={`text-sm font-medium ${isUrgent ? 'text-red-900' : 'text-blue-900'}`}>
              {isUrgent ? (
                <>
                  <strong>¡Tu trial termina en {daysRemaining} día{daysRemaining !== 1 ? 's' : ''}!</strong>
                  {' '}Actualiza ahora para no perder acceso.
                </>
              ) : (
                <>
                  Estás usando la prueba gratuita.
                  {' '}<strong>{daysRemaining} días restantes</strong> hasta que termine.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/configuracion/billing">
            <Button size="sm" className={isUrgent ? 'bg-red-600 hover:bg-red-700' : ''}>
              <CreditCard className="w-4 h-4 mr-2" />
              Ver Planes
            </Button>
          </Link>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setDismissed(true)}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
