import { useEffect, useState } from 'react'

export function useTenant() {
  const [tenantSubdomain, setTenantSubdomain] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Leer del hostname del navegador
    const hostname = window.location.hostname
    let subdomain: string | null = null
    
    if (hostname.includes('localhost')) {
      // Desarrollo local: demo.localhost:3000
      const parts = hostname.split('.')
      if (parts.length > 1 && parts[0] !== 'localhost') {
        subdomain = parts[0]
      }
    } else if (hostname.includes('.volkern.app')) {
      // Producción: demo.volkern.app
      subdomain = hostname.split('.')[0]
    }
    
    setTenantSubdomain(subdomain)
    setLoading(false)
    
    // Opcional: fetch nombre del tenant desde API
    if (subdomain) {
      fetch(`/api/tenant/info?subdomain=${subdomain}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.name) {
            setTenantName(data.name)
          }
        })
        .catch(() => {
          // Silently fail - el nombre es opcional
        })
    }
  }, [])
  
  return { 
    tenantSubdomain, 
    tenantName, 
    loading,
    isTenant: !!tenantSubdomain 
  }
}
