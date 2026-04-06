import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const integration = await prisma.integration.findUnique({
      where: { 
        tenantId_tipo: { 
          tenantId: auth.tenant!.id, 
          tipo: 'stripe_invoicing' 
        } 
      }
    })
    return NextResponse.json(integration || { activo: false, conectado: false })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener la integración' }, { status: 500 })
  }
})

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    const { activo } = body

    const integration = await prisma.integration.upsert({
      where: { 
        tenantId_tipo: { 
          tenantId: auth.tenant!.id, 
          tipo: 'stripe_invoicing' 
        } 
      },
      update: {
        activo: activo !== undefined ? activo : true,
        conectado: true // Si lo activan, lo consideramos conectado (usa la key global de Stripe)
      },
      create: {
        tenantId: auth.tenant!.id,
        tipo: 'stripe_invoicing',
        nombre: 'Stripe Invoicing',
        credenciales: {},
        activo: true,
        conectado: true
      }
    })

    return NextResponse.json({ success: true, integration })
  } catch (error) {
    return NextResponse.json({ error: 'Error al guardar la integración' }, { status: 500 })
  }
})
