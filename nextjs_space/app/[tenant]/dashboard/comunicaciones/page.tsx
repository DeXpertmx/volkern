'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { MessageCircle } from 'lucide-react'
import { ComunicacionesDashboard } from '@/components/hubs/ComunicacionesDashboard'

export default function ComunicacionesHubPage() {
  const hub = HUBS.find(h => h.id === 'comunicaciones')!
  
  return (
    <HubCockpit 
      title={hub.name}
      description={hub.description}
      items={hub.items}
      icon={MessageCircle}
      dashboard={<ComunicacionesDashboard />}
    />
  )
}
