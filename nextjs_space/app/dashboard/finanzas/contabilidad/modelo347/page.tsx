'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Building2 } from 'lucide-react'
import { Modelo347Dashboard } from '@/components/hubs/accounting/Modelo347Dashboard'

export default function Modelo347Page() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Operaciones con Terceros"
      description="Declaración anual de operaciones con clientes y proveedores superiores a 3.005,06€ (Modelo 347)."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Building2}
      dashboard={<Modelo347Dashboard />}
    />
  )
}
