'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { FileText } from 'lucide-react'
import { Modelo180Dashboard } from '@/components/hubs/accounting/Modelo180Dashboard'

export default function Modelo180Page() {
  const hub = HUBS.find(h => h.id === 'finanzas')!
  
  return (
    <HubCockpit 
      title="Resumen Anual de Arrendamientos"
      description="Resumen anual de retenciones e ingresos a cuenta sobre arrendamientos de inmuebles urbanos (Modelo 180)."
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={FileText}
      dashboard={<Modelo180Dashboard />}
    />
  )
}
