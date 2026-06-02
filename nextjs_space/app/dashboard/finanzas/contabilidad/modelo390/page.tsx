'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { PieChart } from 'lucide-react'
import { Modelo390Dashboard } from '@/components/hubs/accounting/Modelo390Dashboard'

export default function Modelo390Page() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="IVA Anual"
      description="Resumen anual del IVA que consolida los 4 trimestres del Modelo 303 (Modelo 390)."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={PieChart}
      dashboard={<Modelo390Dashboard />}
    />
  )
}
