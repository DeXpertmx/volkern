'use client'

import { Activity } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function FloatingConnectTrigger() {
  const pathname = usePathname()
  
  // No mostrar si ya estamos en el hub de connect o en mensajería
  if (pathname?.includes('/dashboard/connect') || pathname?.includes('/dashboard/mensajes')) {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-[60] group">
      {/* Tooltip */}
      <div className="absolute bottom-full right-0 mb-4 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
        Volkern Connect <span className="text-primary ml-1">En Vivo</span>
      </div>

      <Link 
        href="/dashboard/connect"
        className={cn(
          "flex items-center justify-center w-14 h-14 rounded-2xl shadow-2xl transition-all duration-500",
          "bg-primary text-white hover:scale-110 hover:-rotate-3 active:scale-95",
          "border-4 border-white/20 backdrop-blur-md"
        )}
      >
        <div className="relative">
          <Activity className="w-6 h-6 animate-pulse" />
          <span className="absolute -top-2 -right-2 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        </div>
      </Link>
    </div>
  )
}
