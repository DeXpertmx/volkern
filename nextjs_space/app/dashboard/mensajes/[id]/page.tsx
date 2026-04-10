'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ConversacionRedirectPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  useEffect(() => {
    if (id) {
      router.replace(`/dashboard/mensajes?id=${id}`)
    }
  }, [id, router])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-pulse text-slate-400">Cargando dashboard unificado...</div>
    </div>
  )
}
