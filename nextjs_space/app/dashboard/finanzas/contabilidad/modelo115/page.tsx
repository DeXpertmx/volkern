'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Home } from 'lucide-react'
import { Modelo115Dashboard } from '@/components/hubs/accounting/Modelo115Dashboard'

export default function Modelo115Page() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Retenciones por Arrendamientos"
      description="Retención trimestral del IRPF por arrendamiento de inmuebles urbanos (Modelo 115)."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Home}
      dashboard={<Modelo115Dashboard />}
    />
  )
}
