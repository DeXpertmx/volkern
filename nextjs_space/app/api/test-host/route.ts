import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const headersList = await headers()
  const host = headersList.get('host')
  
  return NextResponse.json({
    host,
    debug: 'Test endpoint',
    subdomain: host ? host.split('.')[0] : null
  })
}