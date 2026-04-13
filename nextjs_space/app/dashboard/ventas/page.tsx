'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { TrendingUp } from 'lucide-react'
import { VentasDashboard } from '@/components/hubs/VentasDashboard'

export default function VentasHubPage() {
  const hub = HUBS.find(h => h.id === 'ventas')!
  
  return (
    <HubCockpit 
      title={hub.name}
      description={hub.description}
      items={hub.items}
      icon={TrendingUp}
      dashboard={<VentasDashboard />}
      hideModules={true}
    />
  )
}
