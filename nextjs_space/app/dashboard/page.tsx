'use client'

import dynamic from 'next/dynamic'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'

const DashboardContent = dynamic(
  () => import('@/components/dashboard-content').then(mod => mod.DashboardContent),
  { 
    ssr: false,
    loading: () => <DashboardSkeleton />
  }
)

export default function DashboardPage() {
  return <DashboardContent />
}

