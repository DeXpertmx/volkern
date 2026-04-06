export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Endpoint público para cargar servicios en embeds
// No requiere autenticación, usa tenantId del query parameter
export async function GET(request: NextRequest) {
  // Log detallado para debugging
  console.log('========== PUBLIC SERVICIOS ENDPOINT ==========')
  console.log('Timestamp:', new Date().toISOString())
  console.log('Origin:', request.headers.get('origin'))
  console.log('Referer:', request.headers.get('referer'))
  console.log('User-Agent:', request.headers.get('user-agent'))
  
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')

    console.log('TenantId recibido:', tenantId)

    if (!tenantId) {
      console.error('❌ Error: tenantId no proporcionado')
      return NextResponse.json(
        { error: 'tenantId es requerido' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      )
    }

    // Verificar que el tenant existe
    console.log('🔍 Buscando tenant en la base de datos...')
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, nombre: true }
    })

    console.log('Tenant encontrado:', tenant)

    if (!tenant) {
      console.error('❌ Tenant no encontrado para ID:', tenantId)
      return NextResponse.json(
        { error: 'Tenant no encontrado' },
        { 
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      )
    }

    // Cargar servicios activos del tenant
    console.log('🔍 Buscando servicios activos...')
    const servicios = await prisma.servicio.findMany({
      where: {
        tenantId: tenantId,
        activo: true
      },
      orderBy: {
        fechaCreacion: 'desc'
      }
    })

    console.log(`✅ ${servicios.length} servicios encontrados`)
    console.log('Servicios:', servicios.map(s => ({ id: s.id, nombre: s.nombre })))
    console.log('========== FIN PUBLIC SERVICIOS ==========')

    return NextResponse.json(servicios, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (error) {
    console.error('❌ Error fetching public servicios:', error)
    return NextResponse.json(
      { error: 'Error al obtener servicios' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    )
  }
}

// Manejar OPTIONS para CORS preflight
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
