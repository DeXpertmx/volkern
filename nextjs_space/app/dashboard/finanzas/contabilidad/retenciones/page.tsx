'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Percent } from 'lucide-react'
import { IrpfDashboard } from '@/components/hubs/accounting/IrpfDashboard'

export default function RetencionesPage() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Retenciones IRPF"
      description="Automatización de retenciones fiscales y Modelo 111 basado en tu contabilidad inmutable."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Percent}
      dashboard={<IrpfDashboard />}
    />
  )
}
