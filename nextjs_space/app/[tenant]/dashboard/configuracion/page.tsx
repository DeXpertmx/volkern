
'use client'

import { useSearchParams } from 'next/navigation'
import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Settings } from 'lucide-react'
import { ConfiguracionDashboard } from '@/components/hubs/ConfiguracionDashboard'

export default function ConfiguracionHubPage() {
  const hub = HUBS.find(h => h.id === 'configuracion')!
  const searchParams = useSearchParams()
  const activeSection = searchParams.get('section') || 'empresa'
  
  return (
    <HubCockpit 
      title={hub.name}
      description={hub.description}
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Settings}
      dashboard={<ConfiguracionDashboard activeSection={activeSection} />}
      hideModules={true}
    />
  )
}
