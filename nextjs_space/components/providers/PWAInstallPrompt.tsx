'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Download } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    setIsInstalled(isStandalone)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      const dismissedBefore = localStorage.getItem('pwa_install_dismissed')
      if (!dismissedBefore) {
        setShowPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowPrompt(false)
      localStorage.removeItem('pwa_install_dismissed')
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setDismissed(true)
    localStorage.setItem('pwa_install_dismissed', 'true')
  }

  if (isInstalled || !showPrompt || dismissed) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80 bg-white dark:bg-gray-900 border rounded-lg shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Instalar Volkern</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Instala la app en tu dispositivo para acceso rápido
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" onClick={handleInstall} className="h-8 text-xs gap-1">
          <Download className="h-3.5 w-3.5" />
          Instalar
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
