'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { TrendingUp } from 'lucide-react'
import { AdsDashboard } from '@/components/hubs/AdsDashboard'

export default function AdsHubPage() {
  const hub = HUBS.find(h => h.id === 'marketing')!
  const adsItem = hub.items.find(item => item.href === '/dashboard/ads')!

  return (
    <HubCockpit
      title={adsItem.name}
      description={adsItem.description || 'Campañas de anuncios pagados con IA'}
      items={hub.items.map(item => ({
        title: item.name,
        description: item.description || '',
        href: item.href,
        icon: item.icon,
      }))}
      icon={TrendingUp}
      dashboard={<AdsDashboard />}
      hideModules={true}
    />
  )
}
