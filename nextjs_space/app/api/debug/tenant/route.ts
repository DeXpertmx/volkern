import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

// Endpoint público para testing - NO requiere auth
export const dynamic = 'force-dynamic'

export async function GET() {
  const headersList = await headers()
  const tenantSubdomain = headersList.get('x-tenant-subdomain')
  const hostname = headersList.get('host')
  
  return NextResponse.json({
    hostname,
    tenantSubdomain,
    message: tenantSubdomain 
      ? `Tenant detectado: ${tenantSubdomain}` 
      : 'Sin tenant (landing)'
  })
}