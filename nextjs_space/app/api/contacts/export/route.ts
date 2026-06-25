export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { stringify } from 'csv-stringify/sync'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') // 'person', 'company', or null for all

    const whereClause: any = {
      tenantId: auth.tenant!.id,
    }

    if (tipo) {
      whereClause.tipo = tipo
    }

    const contacts = await prisma.contact.findMany({
      where: whereClause,
      include: {
        company: {
          select: { nombre: true }
        },
        _count: {
          select: { deals: true }
        }
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    })

    // Preparar datos para CSV
    const data = contacts.map((contact) => ({
      ID: contact.id,
      Nombre: contact.nombre,
      Email: contact.email,
      Telefono: contact.telefono || '',
      Tipo: contact.tipo === 'company' ? 'Empresa' : 'Persona',
      Empresa: contact.company?.nombre || '',
      Cargo: contact.cargo || '',
      Ubicacion: contact.ubicacion || '',
      Linkedin: contact.linkedin || '',
      Tags: contact.tags || '',
      Notas: contact.notas || '',
      Deals: contact._count.deals,
      'Fecha Creacion': contact.fechaCreacion.toISOString(),
    }))

    const csvContent = stringify(data, {
      header: true,
      bom: true, // UTF-8 BOM para Excel
    })

    const filename = tipo === 'company' ? 'empresas' : tipo === 'person' ? 'contactos' : 'contactos_todos'

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    console.error('[GET /api/contacts/export] Error:', error)
    return NextResponse.json({ error: 'Error al exportar contactos' }, { status: 500 })
  }
})
