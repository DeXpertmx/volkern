'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Calculator } from 'lucide-react'
import { TaxDashboard } from '@/components/hubs/accounting/TaxDashboard'

export default function ImpuestosPage() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Impuestos e IVA"
      description="Automatización de reportes fiscales y Modelo 303 basado en tu contabilidad inmutable."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Calculator}
      dashboard={<TaxDashboard />}
    />
  )
}
