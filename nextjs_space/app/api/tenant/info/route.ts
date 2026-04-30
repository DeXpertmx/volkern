import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const subdomain = searchParams.get('subdomain')

  if (!subdomain) {
    return NextResponse.json({ error: 'Falta subdominio' }, { status: 400 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { subdomain },
    select: { 
      id: true, 
      nombre: true, 
      subdomain: true,
      plan: true,
      logo: true
    }
  })

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  }

  return NextResponse.json(tenant)
}
