'use client'

import { useState } from 'react'
import { AlertTriangle, Lock, X, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useTrial } from '@/hooks/use-trial'

interface UpgradePromptProps {
  feature: string
  featureLabel: string
  currentUsage: number
  limit: number
  onDismiss?: () => void
}

export function UpgradePrompt({ feature, featureLabel, currentUsage, limit, onDismiss }: UpgradePromptProps) {
  const { trialInfo, shouldShowUpgrade } = useTrial()
  const [dismissed, setDismissed] = useState(false)

  const result = shouldShowUpgrade(feature, currentUsage, limit)
  
  if (!result.show || dismissed) return null

  const percentage = limit > 0 ? Math.round((currentUsage / limit) * 100) : 0
  const isHardBlock = result.blocking === 'hard'
  const isTrial = trialInfo?.isTrial

  return (
    <div className={`relative rounded-lg border p-4 ${isHardBlock ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <button
        onClick={() => {
          setDismissed(true)
          onDismiss?.()
        }}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${isHardBlock ? 'text-red-600' : 'text-amber-600'}`}>
          {isHardBlock ? <Lock className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>

        <div className="flex-1">
          <h4 className={`font-semibold ${isHardBlock ? 'text-red-900' : 'text-amber-900'}`}>
            {isHardBlock ? 'Límite alcanzado' : 'Acercándose al límite'}
          </h4>
          
          <p className={`text-sm mt-1 ${isHardBlock ? 'text-red-700' : 'text-amber-700'}`}>
            {result.message}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${isHardBlock ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {currentUsage} / {limit} ({percentage}%)
            </span>
          </div>

          {isTrial && trialInfo && trialInfo.daysRemaining > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Tu trial termina en {trialInfo.daysRemaining} día{trialInfo.daysRemaining !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href="/checkout" className="flex-1">
          <Button size="sm" className="w-full">
            <Sparkles className="w-4 h-4 mr-1" />
            Actualizar a Pro
          </Button>
        </Link>
        {!isHardBlock && (
          <Button size="sm" variant="outline" onClick={() => setDismissed(true)}>
            Después
          </Button>
        )}
      </div>
    </div>
  )
}

interface TrialStatusBannerProps {
  compact?: boolean
}

export function TrialStatusBanner({ compact = false }: TrialStatusBannerProps) {
  const { trialInfo, loading } = useTrial()
  const [dismissed, setDismissed] = useState(false)

  if (loading || !trialInfo || trialInfo.status !== 'active' || dismissed) {
    return null
  }

  const { daysRemaining, status, wasActivated } = trialInfo
  const isUrgent = daysRemaining <= 3
  const showActivationPrompt = !wasActivated && daysRemaining > 7

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        isUrgent ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
      }`}>
        <Sparkles className="w-4 h-4" />
        <span>
          {isUrgent 
            ? `Trial: ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''} restante`
            : `${daysRemaining} días de trial remaining`
          }
        </span>
        <Link href="/checkout" className="ml-auto underline">Actualizar</Link>
      </div>
    )
  }

  return (
    <div className={`relative ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200'} border rounded-xl p-4`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg ${isUrgent ? 'bg-red-100' : 'bg-violet-100'}`}>
          {isUrgent ? (
            <AlertTriangle className="w-5 h-5 text-red-600" />
          ) : (
            <Sparkles className="w-5 h-5 text-violet-600" />
          )}
        </div>

        <div className="flex-1">
          {showActivationPrompt ? (
            <>
              <h3 className="font-semibold text-violet-900">
                ¡Explora todas las funcionalidades de Volkern!
              </h3>
              <p className="text-sm text-violet-700 mt-1">
                Tienes {daysRemaining} días restantes. Descubre todo lo que puedes hacer con tu prueba gratuita.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/onboarding">
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700">
                    Comenzar Tour <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3 className={`font-semibold ${isUrgent ? 'text-red-900' : 'text-violet-900'}`}>
                {isUrgent 
                  ? `¡Tu trial termina en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}!`
                  : `Prueba gratuita activa - ${daysRemaining} días restantes`
                }
              </h3>
              <p className={`text-sm ${isUrgent ? 'text-red-700' : 'text-violet-700'} mt-1`}>
                {isUrgent 
                  ? 'Actualiza ahora para no perder acceso a todas las funcionalidades.'
                  : 'Tienes acceso completo a todas las funcionalidades premium.'
                }
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/checkout">
                  <Button size="sm" className={isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'}>
                    Ver Planes <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface FeatureLimitWarningProps {
  feature: string
  usage: number
  limit: number
  onAction?: () => void
  actionLabel?: string
}

export function FeatureLimitWarning({ feature, usage, limit, onAction, actionLabel = 'Actualizar' }: FeatureLimitWarningProps) {
  const { shouldShowUpgrade } = useTrial()
  const [dismissed, setDismissed] = useState(false)

  const result = shouldShowUpgrade(feature, usage, limit)

  if (!result.show || dismissed) return null

  return (
    <UpgradePrompt
      feature={feature}
      featureLabel={feature}
      currentUsage={usage}
      limit={limit}
      onDismiss={() => {
        setDismissed(true)
        onAction?.()
      }}
    />
  )
}