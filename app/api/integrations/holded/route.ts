import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const integration = await prisma.integration.findUnique({
      where: { 
        tenantId_tipo: { 
          tenantId: auth.tenant!.id, 
          tipo: 'holded' 
        } 
      }
    })
    return NextResponse.json(integration || { conectado: false, activo: false })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener la integración' }, { status: 500 })
  }
})

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    const { apiKey, activo } = body

    const integration = await prisma.integration.upsert({
      where: { 
        tenantId_tipo: { 
          tenantId: auth.tenant!.id, 
          tipo: 'holded' 
        } 
      },
      update: {
        credenciales: { apiKey },
        activo: activo !== undefined ? activo : true,
        conectado: !!apiKey
      },
      create: {
        tenantId: auth.tenant!.id,
        tipo: 'holded',
        nombre: 'Holded',
        credenciales: { apiKey },
        activo: true,
        conectado: !!apiKey
      }
    })

    return NextResponse.json({ success: true, integration })
  } catch (error) {
    return NextResponse.json({ error: 'Error al guardar la integración' }, { status: 500 })
  }
})
