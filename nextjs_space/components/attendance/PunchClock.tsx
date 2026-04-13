'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Clock, Play, Power, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { PunchClockModal } from '@/components/modals/PunchClockModal'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function PunchClock({ isCollapsed }: { isCollapsed: boolean }) {
  const { data, mutate, isLoading } = useSWR('/api/erp/attendance/punch', fetcher)
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (isLoading || !data) return null
  if (!data.employeeId) return null // Solo para empleados vinculados

  const status = data.status || 'OUT'
  const nextAction = status === 'IN' ? 'OUT' : 'IN'

  return (
    <div className={cn("w-full transition-all duration-500", isCollapsed ? "px-0" : "px-2")}>
      <Button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          "w-full h-12 rounded-2xl flex items-center transition-all duration-300 shadow-lg border-2",
          status === 'IN' 
            ? "bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white shadow-rose-500/10" 
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white shadow-emerald-500/10",
          isCollapsed ? "justify-center p-0" : "px-4 justify-start"
        )}
      >
        <div className={cn(
          "p-2 rounded-xl transition-colors",
          status === 'IN' ? "bg-rose-500/20 text-rose-500" : "bg-emerald-500/20 text-emerald-500"
        )}>
          {status === 'IN' ? <Power className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </div>
        {!isCollapsed && (
          <div className="ml-3 flex flex-col items-start leading-none">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
              {status === 'IN' ? 'Trabajando' : 'Fuera de Turno'}
            </span>
            <span className="text-xs font-bold uppercase transition-transform group-hover:translate-x-1">
              {status === 'IN' ? 'Marcar Salida' : 'Marcar Entrada'}
            </span>
          </div>
        )}
      </Button>

      <PunchClockModal 
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        type={nextAction}
        employeeId={data.employeeId}
        onSuccess={() => mutate()}
      />
    </div>
  )
}
