'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Megaphone } from 'lucide-react'
import { PublicacionesAdsDashboard } from '@/components/ads/PublicacionesAdsDashboard'

export default function PublicacionesAdsPage() {
  const hub = HUBS.find(h => h.id === 'marketing')!
  const item = hub.items.find(i => i.href === '/dashboard/ads/publicaciones')!

  return (
    <HubCockpit
      title={item.name}
      description={item.description || 'Crea, programa y publica anuncios en Meta y Google'}
      items={hub.items.map(item => ({
        title: item.name,
        description: item.description || '',
        href: item.href,
        icon: item.icon,
      }))}
      icon={Megaphone}
      dashboard={<PublicacionesAdsDashboard />}
      hideModules={true}
    />
  )
}
