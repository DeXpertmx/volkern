export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ApolloIOClient, transformApolloContactToLead } from '@/lib/apollo-io'

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

    // Get Apollo.io integration
    const integration = await prisma.integration.findFirst({
      where: {
        tenantId: user.tenantId,
        tipo: 'apollo',
        conectado: true,
        activo: true,
      },
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Apollo.io no está configurado. Por favor configura la integración primero.' },
        { status: 400 }
      )
    }

    // Extract API key from credentials
    const credentials = integration.credenciales as any
    if (!credentials?.apiKey) {
      return NextResponse.json(
        { error: 'API Key de Apollo.io no encontrada' },
        { status: 400 }
      )
    }

    // Parse request body
    const body = await req.json()
    const { criterios, saveSearch = false, searchName } = body

    // Initialize Apollo client
    const apolloClient = new ApolloIOClient(credentials.apiKey)

    // Build search parameters
    const searchParams: any = {}

    if (criterios.cargo) {
      searchParams.person_titles = [criterios.cargo]
    }
    if (criterios.ubicacion) {
      searchParams.person_locations = [criterios.ubicacion]
    }
    if (criterios.industria) {
      searchParams.organization_industries = [criterios.industria]
    }
    if (criterios.empresa) {
      searchParams.q_keywords = criterios.empresa
    }
    if (criterios.senioridad) {
      searchParams.person_seniorities = [criterios.senioridad]
    }
    if (criterios.tamanoEmpresa) {
      searchParams.organization_num_employees_ranges = [criterios.tamanoEmpresa]
    }

    // Add pagination
    searchParams.page = criterios.page || 1
    searchParams.per_page = criterios.limit || 25

    // Execute search
    const results = await apolloClient.searchContacts(searchParams)

    // Transform contacts to standard lead format
    const transformedLeads = results.contacts.map(transformApolloContactToLead)

    // Save search in database
    const searchRecord = await prisma.externalLeadSearch.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        criterios: criterios,
        fuente: 'apollo',
        totalResultados: results.pagination.total_entries,
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
          descripcion: `Búsqueda en Apollo.io: ${JSON.stringify(criterios)}`,
          criterios: criterios,
          fuente: 'apollo',
          totalResultados: results.pagination.total_entries,
          nuevosDesdeUltimaActualizacion: 0,
        },
      })
    }

    return NextResponse.json({
      success: true,
      searchId: searchRecord.id,
      leads: transformedLeads,
      pagination: {
        page: results.pagination.page,
        perPage: results.pagination.per_page,
        total: results.pagination.total_entries,
        totalPages: results.pagination.total_pages,
      },
    })
  } catch (error: any) {
    console.error('Error en búsqueda Apollo.io:', error)
    return NextResponse.json(
      { error: error.message || 'Error al buscar leads en Apollo.io' },
      { status: 500 }
    )
  }
}

// Test Apollo.io connection
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
        tipo: 'apollo',
      },
    })

    if (!integration) {
      return NextResponse.json(
        { connected: false, message: 'Apollo.io no configurado' },
        { status: 200 }
      )
    }

    const credentials = integration.credenciales as any
    const apolloClient = new ApolloIOClient(credentials.apiKey)
    const isConnected = await apolloClient.testConnection()

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
    console.error('Error al probar conexión Apollo.io:', error)
    return NextResponse.json(
      { connected: false, message: error.message },
      { status: 500 }
    )
  }
}
