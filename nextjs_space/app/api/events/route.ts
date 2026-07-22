export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveTenantFromRequest } from '@/lib/tenant-resolver'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenant = await resolveTenantFromRequest(request)
    if (!tenant.valid || !tenant.tenantId) {
      return NextResponse.json({ error: 'No se pudo resolver el tenant' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const type = searchParams.get('type')

    const whereClause: any = { tenantId: tenant.tenantId }

    if (dateFrom || dateTo) {
      whereClause.fechaHora = {}
      if (dateFrom) whereClause.fechaHora.gte = new Date(dateFrom)
      if (dateTo) whereClause.fechaHora.lte = new Date(dateTo)
    }

    if (type && type !== 'all') {
      const typeMap: Record<string, string> = {
        meeting: 'reunion',
        call: 'llamada',
        task: 'tarea',
        reminder: 'recordatorio',
      }
      whereClause.tipo = typeMap[type] || type
    }

    const citas = await prisma.cita.findMany({
      where: whereClause,
      include: {
        lead: { select: { id: true, nombre: true, email: true } },
        servicio: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaHora: 'asc' },
    })

    const events = citas.map((cita: any) => {
      const d = new Date(cita.fechaHora)
      const dateStr = d.toISOString().slice(0, 10)
      const startTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      const end = new Date(d.getTime() + (cita.duracion || 60) * 60000)
      const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`

      const typeMapRev: Record<string, string> = {
        reunion: 'meeting',
        llamada: 'call',
        videollamada: 'meeting',
        tarea: 'task',
        recordatorio: 'reminder',
        cita: 'meeting',
        demo: 'meeting',
        seguimiento: 'call',
      }

      return {
        id: cita.id,
        title: cita.titulo || cita.servicio?.nombre || 'Evento',
        description: cita.descripcion || '',
        type: typeMapRev[cita.tipo] || 'other',
        date: dateStr,
        startTime,
        endTime,
        allDay: false,
        location: cita.ubicacion || cita.linkReunion || null,
        participants: cita.lead ? [{ id: cita.lead.id, name: cita.lead.nombre || cita.lead.email || '' }] : [],
        leadId: cita.leadId || undefined,
        leadName: cita.lead?.nombre || undefined,
        createdAt: cita.createdAt?.toISOString?.() || cita.createdAt,
        updatedAt: cita.updatedAt?.toISOString?.() || cita.updatedAt,
      }
    })

    return NextResponse.json(events)
  } catch (error: any) {
    console.error('[API Events] Error:', error?.message || error)
    return NextResponse.json({ error: 'Error al obtener eventos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenant = await resolveTenantFromRequest(request)
    if (!tenant.valid || !tenant.tenantId) {
      return NextResponse.json({ error: 'No se pudo resolver el tenant' }, { status: 403 })
    }

    const body = await request.json()
    const { title, description, type, date, startTime, endTime, allDay, location, leadId } = body

    if (!title || !date) {
      return NextResponse.json({ error: 'title y date son requeridos' }, { status: 400 })
    }

    const typeMap: Record<string, string> = {
      meeting: 'reunion',
      call: 'llamada',
      task: 'tarea',
      reminder: 'recordatorio',
      other: 'otro',
    }

    const fechaHora = startTime
      ? new Date(`${date}T${startTime}:00`)
      : new Date(`${date}T09:00:00`)

    const duration = startTime && endTime
      ? (() => {
          const [sh, sm] = startTime.split(':').map(Number)
          const [eh, em] = endTime.split(':').map(Number)
          return (eh * 60 + em) - (sh * 60 + sm)
        })()
      : 60

    const cita = await prisma.cita.create({
      data: {
        titulo: title,
        descripcion: description || '',
        tipo: typeMap[type] || 'reunion',
        fechaHora,
        duracion: Math.max(duration, 15),
        ubicacion: location || null,
        leadId: leadId || null,
        tenantId: tenant.tenantId,
        estado: 'pendiente',
      },
      include: {
        lead: { select: { id: true, nombre: true } },
      },
    })

    const d = new Date(cita.fechaHora)
    const dateStr = d.toISOString().slice(0, 10)
    const st = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const end = new Date(d.getTime() + (cita.duracion || 60) * 60000)
    const et = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`

    const typeMapRev: Record<string, string> = {
      reunion: 'meeting', llamada: 'call', videollamada: 'meeting',
      tarea: 'task', recordatorio: 'reminder', cita: 'meeting',
      demo: 'meeting', seguimiento: 'call',
    }

    return NextResponse.json({
      success: true,
      event: {
        id: cita.id,
        title: cita.titulo,
        description: cita.descripcion || '',
        type: typeMapRev[cita.tipo] || 'other',
        date: dateStr,
        startTime: st,
        endTime: et,
        allDay: false,
        location: cita.ubicacion,
        participants: cita.lead ? [{ id: cita.lead.id, name: cita.lead.nombre || '' }] : [],
        leadId: cita.leadId || undefined,
        leadName: cita.lead?.nombre || undefined,
      },
    })
  } catch (error: any) {
    console.error('[API Events POST] Error:', error?.message || error)
    return NextResponse.json({ error: 'Error al crear evento' }, { status: 500 })
  }
}
