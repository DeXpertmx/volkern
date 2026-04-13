'use client'

import { Sidebar } from '@/components/sidebar'
import { TrialBanner } from '@/components/trial-banner'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { DashboardHeader } from '@/components/dashboard-header'
import { PushPrompt } from '@/components/notifications/PushPrompt'
import { IncomingCallPopup } from '@/components/dashboard/IncomingCallPopup'
import { usePathname } from 'next/navigation'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Sincronizar con el estado del sidebar
    const checkCollapsed = () => {
      const saved = localStorage.getItem('sidebar-collapsed')
      setIsCollapsed(saved === 'true')
    }
    
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

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      {!isMessaging && <Sidebar />}
      <main className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300 relative bg-slate-50/50",
        isMessaging ? "ml-0" : (isCollapsed ? "md:ml-20" : "md:ml-64")
      )}>
        {!isMessaging && <DashboardHeader />}
        <div className="flex-1 overflow-y-auto relative scroll-smooth overflow-x-hidden">
          <TrialBanner />
          <div className={cn(
            "animate-in fade-in duration-700 h-full",
            (isPipeline || isMessaging) ? "w-full min-h-full" : "container mx-auto p-6 max-w-7xl"
          )}>
            {children}
          </div>
        </div>
        <PushPrompt />
        <IncomingCallPopup />
      </main>
    </div>
  )
}
