'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { CalendarDays } from 'lucide-react'
import { FiscalCalendarDashboard } from '@/components/hubs/accounting/FiscalCalendarDashboard'

export default function CalendarioFiscalPage() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Calendario Fiscal"
      description="Vencimientos de modelos fiscales AEAT con alertas automáticas."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={CalendarDays}
      dashboard={<FiscalCalendarDashboard />}
    />
  )
}
