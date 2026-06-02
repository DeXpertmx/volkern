'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Landmark } from 'lucide-react'
import { Modelo130Dashboard } from '@/components/hubs/accounting/Modelo130Dashboard'

export default function Modelo130Page() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Pago Fraccionado IRPF"
      description="Automatización del Modelo 130 basada en los ingresos y gastos registrados en tu contabilidad inmutable."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Landmark}
      dashboard={<Modelo130Dashboard />}
    />
  )
}
