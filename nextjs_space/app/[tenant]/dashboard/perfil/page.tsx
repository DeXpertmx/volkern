'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { UserCog } from 'lucide-react'
import { PerfilDashboard } from '@/components/hubs/PerfilDashboard'

export default function PerfilHubPage() {
  const hub = HUBS.find(h => h.id === 'perfil')!
  const searchParams = useSearchParams()
  const activeSection = searchParams.get('section') || 'datos'
  
  return (
    <HubCockpit 
      title={hub.name}
      description={hub.description}
      items={hub.items}
      icon={UserCog}
      dashboard={<PerfilDashboard activeSection={activeSection} />}
      hideModules={true}
    />
  )
}
