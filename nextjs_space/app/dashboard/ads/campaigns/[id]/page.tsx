'use client'

import { useParams, useRouter } from 'next/navigation'
import { AdsCampaignDetail } from '@/components/ads/AdsCampaignDetail'

export default function AdsCampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = String(params?.id || '')

  if (!campaignId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Campaña no encontrada
      </div>
    )
  }

  return (
    <div className="p-6 pb-20 max-w-[1600px] mx-auto">
      <AdsCampaignDetail
        campaignId={campaignId}
        onBack={() => router.push('/dashboard/ads')}
      />
    </div>
  )
}
