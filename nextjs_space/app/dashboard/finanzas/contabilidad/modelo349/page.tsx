'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Globe } from 'lucide-react'
import { Modelo349Dashboard } from '@/components/hubs/accounting/Modelo349Dashboard'

export default function Modelo349Page() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="IVA Intracomunitario"
      description="Declaración de operaciones con otros países de la Unión Europea (Modelo 349)."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Globe}
      dashboard={<Modelo349Dashboard />}
    />
  )
}
