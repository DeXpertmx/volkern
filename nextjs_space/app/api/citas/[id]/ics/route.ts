export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, getTenantDb, dbContext } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

function generateICS(cita: any): string {
  const fechaInicio = new Date(cita.fechaHora)
  const fechaFin = new Date(fechaInicio.getTime() + cita.duracion * 60000)

  const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const uid = `${cita.id}@volkern.app`
  const now = formatDate(new Date())

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Volkern//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
DTSTART:${formatDate(fechaInicio)}
DTEND:${formatDate(fechaFin)}
DTSTAMP:${now}
UID:${uid}
SUMMARY:${cita.titulo || cita.servicio?.nombre || 'Cita'}
DESCRIPTION:${cita.descripcion || ''}\\n\\nCon: ${cita.lead?.nombre || ''}
LOCATION:${cita.ubicacion || cita.linkReunion || ''}
STATUS:${cita.estado === 'confirmada' ? 'CONFIRMED' : cita.estado === 'cancelada' ? 'CANCELLED' : 'TENTATIVE'}
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Recordatorio de cita
END:VALARM
END:VEVENT
END:VCALENDAR}`

  return ics
}

export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id
    const tenantClient = await getTenantDb(tenantId)

    const cita = await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        return tenantClient.cita.findFirst({
          where: { id: params.id, tenantId },
          include: { lead: true, servicio: true },
        })
      }
    )

    if (!cita) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const ics = generateICS(cita)

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar',
        'Content-Disposition': `attachment; filename="cita-${cita.id}.ics"`,
      },
    })
  } catch (error: any) {
    console.error('[GET /api/citas/[id]/ics] Error:', error)
    return NextResponse.json(
      { error: 'Error al generar archivo ICS' },
      { status: 500 }
    )
  }
}, ['citas:read'])
