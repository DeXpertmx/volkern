import { NextResponse } from 'next/server'
export const dynamic = "force-dynamic";
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { stringify } from 'csv-stringify/sync'

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const leads = await prisma.lead.findMany({
      where: {
        tenantId: auth.tenant!.id,
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    })

    // Preparar datos para CSV
    const data = leads.map((lead) => ({
      ID: lead.id,
      Nombre: lead.nombre,
      Email: lead.email,
      Telefono: lead.telefono || '',
      Empresa: lead.empresa || '',
      Cargo: lead.cargo || '',
      Estado: lead.estado,
      Fuente: lead.fuente || '',
      Ubicacion: lead.ubicacion || '',
      Linkedin: lead.linkedin || '',
      Notas: lead.notas || '',
      'Fecha Creacion': lead.fechaCreacion.toISOString(),
      'Ultima Actividad': lead.fechaUltimaActividad.toISOString(),
    }))

    const csvContent = stringify(data, {
      header: true,
      bom: true, // UTF-8 BOM para Excel
    })

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    console.error('[GET /api/leads/export] Error:', error)
    return NextResponse.json({ error: 'Error al exportar leads' }, { status: 500 })
  }
}, ['leads:read'])
