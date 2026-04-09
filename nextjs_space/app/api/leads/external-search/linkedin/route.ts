export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { LinkedInClient, transformLinkedInProfileToLead } from '@/lib/linkedin-api'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Get user and tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true },
    })

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Get LinkedIn integration
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'linkedin',
        conectado: true,
        activo: true,
      },
    })

    if (!integration) {
      return NextResponse.json(
        { 
          error: 'LinkedIn no está configurado. Por favor configura la integración primero.',
          requiresSetup: true,
          setupInstructions: 'LinkedIn requiere OAuth 2.0 y una cuenta de LinkedIn Sales Navigator.'
        },
        { status: 400 }
      )
    }

    // Extract access token from credentials
    const credentials = integration.credenciales as any
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Access Token de LinkedIn no encontrado' },
        { status: 400 }
      )
    }

    // Parse request body
    const body = await req.json()
    const { criterios, saveSearch = false, searchName } = body

    // Initialize LinkedIn client
    const linkedInClient = new LinkedInClient(credentials.accessToken)

    // Build search parameters
    const searchParams: any = {}

    if (criterios.cargo) {
      searchParams.title = criterios.cargo
    }
    if (criterios.ubicacion) {
      searchParams.location = criterios.ubicacion
    }
    if (criterios.empresa) {
      searchParams.company = criterios.empresa
    }
    if (criterios.palabrasClave) {
      searchParams.keywords = criterios.palabrasClave
    }
    if (criterios.escuela) {
      searchParams.school = criterios.escuela
    }

    // Add pagination
    searchParams.start = ((criterios.page || 1) - 1) * (criterios.limit || 25)
    searchParams.count = criterios.limit || 25

    // Execute search
    const results = await linkedInClient.searchPeople(searchParams)

    // Transform profiles to standard lead format
    const transformedLeads = results.elements.map(transformLinkedInProfileToLead)

    // Save search in database
    const searchRecord = await prisma.externalLeadSearch.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        criterios: criterios,
        fuente: 'linkedin',
        totalResultados: results.paging.total,
        resultados: transformedLeads,
        leadsImportados: 0,
      },
    })

    // Optionally save as a saved search
    if (saveSearch && searchName) {
      await prisma.savedSearch.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          nombre: searchName,
          descripcion: `Búsqueda en LinkedIn: ${JSON.stringify(criterios)}`,
          criterios: criterios,
          fuente: 'linkedin',
          totalResultados: results.paging.total,
          nuevosDesdeUltimaActualizacion: 0,
        },
      })
    }

    return NextResponse.json({
      success: true,
      searchId: searchRecord.id,
      leads: transformedLeads,
      pagination: {
        page: Math.floor(results.paging.start / results.paging.count) + 1,
        perPage: results.paging.count,
        total: results.paging.total,
        totalPages: Math.ceil(results.paging.total / results.paging.count),
      },
    })
  } catch (error: any) {
    console.error('Error en búsqueda LinkedIn:', error)
    
    // Handle specific LinkedIn errors
    if (error.message.includes('unauthorized') || error.message.includes('401')) {
      return NextResponse.json(
        { 
          error: 'Token de LinkedIn expirado. Por favor reconecta tu cuenta de LinkedIn.',
          requiresReauth: true 
        },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Error al buscar leads en LinkedIn' },
      { status: 500 }
    )
  }
}

// Test LinkedIn connection
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user || !user.tenantId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'linkedin',
      },
    })

    if (!integration) {
      return NextResponse.json(
        { connected: false, message: 'LinkedIn no configurado' },
        { status: 200 }
      )
    }

    const credentials = integration.credenciales as any
    const linkedInClient = new LinkedInClient(credentials.accessToken)
    const isConnected = await linkedInClient.testConnection()

    if (isConnected) {
      // Update integration status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          conectado: true,
          ultimaSincronizacion: new Date(),
        },
      })
    }

    return NextResponse.json({
      connected: isConnected,
      message: isConnected ? 'Conexión exitosa' : 'Error de conexión',
    })
  } catch (error: any) {
    console.error('Error al probar conexión LinkedIn:', error)
    return NextResponse.json(
      { connected: false, message: error.message },
      { status: 500 }
    )
  }
}
