'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { GraduationCap } from 'lucide-react'
import { AcademiaDashboard } from '@/components/hubs/AcademiaDashboard'

export default function AcademiaHubPage() {
  const hub = HUBS.find(h => h.id === 'academia')!
  
  return (
    <HubCockpit 
      title={hub.name}
      description={hub.description}
      items={hub.items}
      icon={GraduationCap}
      dashboard={<AcademiaDashboard />}
      hideModules={true}
    />
  )
}
