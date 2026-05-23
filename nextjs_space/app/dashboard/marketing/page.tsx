'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Send } from 'lucide-react'
import { MarketingDashboard } from '@/components/hubs/MarketingDashboard'

export default function MarketingHubPage() {
  const hub = HUBS.find(h => h.id === 'marketing')!
  
  return (
    <HubCockpit 
      title={hub.name}
      description={hub.description}
      items={hub.items.map(item => ({ title: item.name, description: item.description || '', href: item.href, icon: item.icon }))}
      icon={Send}
      dashboard={<MarketingDashboard />}
      hideModules={true}
    />
  )
}
