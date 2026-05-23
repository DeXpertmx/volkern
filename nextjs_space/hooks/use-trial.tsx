'use client'

import { useEffect, useState, createContext, useContext, ReactNode } from 'react'

export type TrialStatus = 'active' | 'expired' | 'converted' | 'cancelled' | 'none'

export interface TrialInfo {
  status: TrialStatus
  daysRemaining: number
  expiredAt: string | null
  startedAt: string | null
  wasActivated: boolean
  convertedAt: string | null
  isTrial: boolean
  activationStatus: boolean
  firstActionAt: string | null
  suggestedActions: string[]
}

interface UpgradeResult {
  show: boolean
  blocking: 'soft' | 'hard' | null
  message: string
}

interface TrialContextType {
  trialInfo: TrialInfo | null
  loading: boolean
  refreshTrial: () => Promise<void>
  markActivation: () => Promise<void>
  isTrialActive: () => boolean
  shouldShowUpgrade: (feature: string, usage: number, limit: number) => UpgradeResult
}

const TrialContext = createContext<TrialContextType | undefined>(undefined)

export function TrialProvider({ children }: { children: ReactNode }) {
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTrialInfo = async () => {
    try {
      const response = await fetch('/api/trials/status')
      if (response.ok) {
        const data = await response.json()
        setTrialInfo(data)
      }
    } catch (error) {
      console.error('[TrialProvider] Error fetching trial info:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrialInfo()
  }, [])

  const refreshTrial = async () => {
    setLoading(true)
    await fetchTrialInfo()
  }

  const markActivation = async () => {
    try {
      await fetch('/api/trials/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markActivation' }),
      })
      await fetchTrialInfo()
    } catch (error) {
      console.error('[TrialProvider] Error marking activation:', error)
    }
  }

  const isTrialActive = () => {
    return trialInfo?.status === 'active'
  }

  const shouldShowUpgrade = (feature: string, usage: number, limit: number): UpgradeResult => {
    if (!trialInfo || trialInfo.status !== 'active') {
      return { show: false, blocking: null, message: '' }
    }

    if (limit <= 0 || limit === -1) {
      return { show: false, blocking: null, message: '' }
    }

    const percentage = (usage / limit) * 100
    const featureThresholds: Record<string, { soft: number; hard: number }> = {
      leads: { soft: 70, hard: 90 },
      users: { soft: 80, hard: 100 },
      emails_per_month: { soft: 70, hard: 90 },
      storage_gb: { soft: 70, hard: 90 },
      pages: { soft: 66, hard: 90 },
      whatsapp_messages: { soft: 70, hard: 90 },
      contacts: { soft: 70, hard: 90 },
      automations_count: { soft: 70, hard: 90 },
    }

    const thresholds = featureThresholds[feature]
    if (!thresholds) {
      return { show: false, blocking: null, message: '' }
    }

    if (percentage >= thresholds.hard) {
      return { show: true, blocking: 'hard', message: `Has alcanzado el límite de ${feature}. Actualiza tu plan para continuar.` }
    }

    if (percentage >= thresholds.soft) {
      return { show: true, blocking: 'soft', message: `Has usado el ${percentage.toFixed(0)}% de tu límite de ${feature}. Considera actualizar.` }
    }

    return { show: false, blocking: null, message: '' }
  }

  return (
    <TrialContext.Provider value={{ trialInfo, loading, refreshTrial, markActivation, isTrialActive, shouldShowUpgrade }}>
      {children}
    </TrialContext.Provider>
  )
}

export function useTrial() {
  const context = useContext(TrialContext)
  if (context === undefined) {
    throw new Error('useTrial must be used within a TrialProvider')
  }
  return context
}

export function useTrialStatus() {
  const { trialInfo, loading } = useTrial()
  return { trialInfo, loading }
}