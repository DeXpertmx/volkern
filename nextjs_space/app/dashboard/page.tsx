'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
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
  const { data: session, status } = useSession()
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const tenantSubdomain = (session.user as any).tenantSubdomain
      const host = window.location.hostname

      // Determinamos el subdominio actual
      let currentSubdomain: string | null = null
      if (host.includes('.volkern.app')) {
        currentSubdomain = host.split('.')[0]
      } else if (host.endsWith('localhost') && host !== 'localhost') {
        currentSubdomain = host.split('.')[0]
      }

      // Si el usuario tiene un subdominio asignado y no estamos en él, redirigimos
      if (tenantSubdomain && currentSubdomain !== tenantSubdomain) {
        setIsRedirecting(true)
        const protocol = window.location.protocol
        const port = window.location.port ? `:${window.location.port}` : ''
        
        let newHost = `${tenantSubdomain}.volkern.app`
        if (host.includes('localhost')) {
          newHost = `${tenantSubdomain}.localhost`
        }

        window.location.href = `${protocol}//${newHost}${port}/dashboard`
      }
    }
  }, [session, status])

  if (status === 'loading' || isRedirecting) {
    return <DashboardSkeleton />
  }

  return <DashboardContent />
}

