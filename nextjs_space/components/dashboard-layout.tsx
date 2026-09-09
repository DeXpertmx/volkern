'use client'

import { Sidebar } from '@/components/sidebar'
import { TrialBanner } from '@/components/trial-banner'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { DashboardHeader } from '@/components/dashboard-header'
import { PushPrompt } from '@/components/notifications/PushPrompt'
import { IncomingCallPopup } from '@/components/dashboard/IncomingCallPopup'
import { MorningBriefingModal } from '@/components/dashboard/MorningBriefingModal'
import { usePathname } from 'next/navigation'
import { VolkernGuide } from '@/components/guide/VolkernGuide'
import ImpersonationBanner from '@/components/admin/ImpersonationBanner'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Sincronizar con el estado del sidebar
    const checkCollapsed = () => {
      const saved = localStorage.getItem('sidebar-collapsed')
      setIsCollapsed(saved === 'true')
    }
    
    setMounted(true)
    checkCollapsed()
    
    // Escuchar cambios en el localStorage
    window.addEventListener('storage', checkCollapsed)
    
    // También escuchar eventos personalizados desde el mismo tab
    const handleSidebarToggle = (e: CustomEvent) => {
      setIsCollapsed(e.detail.isCollapsed)
    }
    window.addEventListener('sidebar-toggle' as any, handleSidebarToggle as any)
    
    return () => {
      window.removeEventListener('storage', checkCollapsed)
      window.removeEventListener('sidebar-toggle' as any, handleSidebarToggle as any)
    }
  }, [])

  const isPipeline = pathname === '/dashboard/pipeline'
  const isMessaging = pathname?.startsWith('/dashboard/mensajes')
  const isConnect = pathname === '/dashboard/connect'
  const isLeads = pathname === '/dashboard/leads'
  const isFullscreenRoute = pathname?.includes('/fullscreen')

  if (!mounted) return null

  // Fullscreen route: render only the content, no sidebar/header/chrome
  if (isFullscreenRoute) {
    return (
      <div className="flex h-screen bg-white dark:bg-slate-900 overflow-hidden font-sans">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto relative scroll-smooth overflow-x-hidden">
            <div className="w-full min-h-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      {!isMessaging && <Sidebar />}
      <main className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300 relative bg-slate-50/50 dark:bg-slate-950",
        isMessaging ? "ml-0" : (isCollapsed ? "md:ml-24" : "md:ml-72")
      )}>
        {!isMessaging && <DashboardHeader />}
        <ImpersonationBanner />
        <div className="flex-1 overflow-y-auto relative scroll-smooth overflow-x-hidden">
          <MorningBriefingModal />
          <TrialBanner />
          <div className={cn(
            "animate-in fade-in duration-700 h-full",
            (isPipeline || isMessaging || isConnect) ? "w-full min-h-full" : isLeads ? "w-full min-h-full p-6" : "container mx-auto p-6 max-w-7xl"
          )}>
            {children}
          </div>
        </div>
        <PushPrompt />
        <IncomingCallPopup />
        <VolkernGuide />
      </main>
    </div>
  )
}
