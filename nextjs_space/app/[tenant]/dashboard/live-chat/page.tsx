'use client'

import { HubCockpit } from '@/components/hubs/HubCockpit'
import { HUBS } from '@/lib/navigation-config'
import { Headset } from 'lucide-react'
import { LiveChatManager } from '@/components/live-chat/LiveChatManager'

export default function LiveChatPage() {
  const hub = HUBS.find(h => h.id === 'comunicaciones')!
  const liveChatItem = hub.items.find(i => i.href === '/dashboard/live-chat')!
  
  return (
    <HubCockpit 
      title={liveChatItem.name}
      description={liveChatItem.description}
      items={[]} // No sub-items for now
      icon={Headset}
      dashboard={<LiveChatManager />}
      hideModules={true}
    />
  )
}
