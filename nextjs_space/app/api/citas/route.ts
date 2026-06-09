export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendAppointmentConfirmation, generateCitaEmailHash } from '@/lib/email'
import { triggerAutomation } from '@/lib/automation-engine'
import { ScoringEngine } from '@/lib/scoring-engine';
import { createSystemContext } from '@/lib/skills/context';
import { withTenantAuth } from '@/lib/api-key-auth'
import { createCalendarEvent } from '@/lib/google-calendar'
import { notifyAdminsPush } from '@/lib/services/push-notification'
import { validateBody } from '@/lib/validation';
import { CitaCreateSchema } from '@/lib/validation/schemas';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const { searchParams } = new URL(request.url)
    const estado = searchParams.get('estado')
    const tipo = searchParams.get('tipo')
    const fecha = searchParams.get('fecha')
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')

    const whereClause: any = {
      tenantId: auth.tenant!.id  // Filtrar por tenant
    }

    if (estado && estado !== 'all') {
      whereClause.estado = estado
    }

    if (tipo && tipo !== 'all') {
      whereClause.tipo = tipo
    }

    // Filtro por un día específico
    if (fecha) {
      const fechaInicioDay = new Date(fecha)
      const fechaFinDay = new Date(fecha)
      fechaFinDay.setDate(fechaFinDay.getDate() + 1)

      whereClause.fechaHora = {
        gte: fechaInicioDay,
        lt: fechaFinDay
      }
    }

    // Filtro por rango de fechas (para calendario)
    if (fechaInicio && fechaFin) {
      whereClause.fechaHora = {
        gte: new Date(fechaInicio),
        lte: new Date(fechaFin)
      }
    }

    // El proxy de prisma redirige a la DB física del tenant
    const citas = await prisma.cita.findMany({
      where: whereClause,
      include: {
        lead: true,
        servicio: true
      },
      orderBy: {
        fechaHora: 'desc'
      }
    })

    return NextResponse.json(citas)
  } catch (error: any) {
    console.error('CRITICAL ERROR fetching citas:', error?.message || error)
    return NextResponse.json(
      { error: 'Error al obtener citas', details: error?.message },
      { status: 500 }
    )
  }
}, ['citas:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json()
    const data = validateBody(CitaCreateSchema, body);
    if (data instanceof NextResponse) return data;

    const { 
      leadId, 
      contactId,
      servicioId,
      catalogoItemId,
      tipo = 'reunion',
      titulo,
      descripcion,
      ubicacion,
      linkReunion,
      tipoLinkReunion = 'ninguno',
      linkReunionPegado,
      fechaHora,
      duracion: duracionRaw = 60,
      estado = 'pendiente',
      connectedCalendarId
    } = data;

    const tenantId = auth.tenant!.id;
    const duracion = duracionRaw; // ya validado por Zod

    // Obtener lead si se proporciona
    let lead = null
    if (leadId) {
      lead = await prisma.lead.findFirst({ 
        where: { 
          id: leadId,
          tenantId: tenantId
        } 
      })
      
      if (!lead) {
        return NextResponse.json(
          { error: 'Lead no encontrado' },
          { status: 404 }
        )
      }
    }

    // Obtener contact si se proporciona
    let contact = null
    if (contactId) {
      contact = await prisma.contact.findFirst({ 
        where: { 
          id: contactId,
          tenantId: tenantId
        } 
      })
      
      if (!contact) {
        return NextResponse.json(
          { error: 'Contacto no encontrado' },
          { status: 404 }
        )
      }
    }

    let servicio = null
    if (servicioId) {
      servicio = await prisma.servicio.findUnique({ where: { id: servicioId } })
      if (!servicio) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
      }
    }

    let catalogoItem = null
    if (catalogoItemId) {
      catalogoItem = await prisma.catalogoItem.findUnique({ 
        where: { id: catalogoItemId },
        include: { tasaImpuesto: true }
      })
      if (!catalogoItem) {
        return NextResponse.json({ error: 'Item de catálogo no encontrado' }, { status: 404 })
      }
    }

    // Determinar link de reunión según tipoLinkReunion
    let linkFinal = linkReunion || linkReunionPegado || null
    if (tipoLinkReunion === 'pegar' && linkReunionPegado) {
      linkFinal = linkReunionPegado
    }

    const tituloFinal = titulo || catalogoItem?.nombre || servicio?.nombre || 'Evento'
    const descripcionFinal = descripcion || catalogoItem?.descripcion || servicio?.descripcion
    const duracionFinal = duracion || catalogoItem?.duracionMinutos || servicio?.duracionMinutos || 60

    const citaData: any = {
      leadId,
      contactId,
      tipo,
      titulo: tituloFinal,
      descripcion: descripcionFinal,
      ubicacion,
      linkReunion: linkFinal,
      tipoLinkReunion,
      linkReunionPegado: tipoLinkReunion === 'pegar' ? linkReunionPegado : null,
      fechaHora: new Date(fechaHora),
      duracion: duracionFinal,
      estado,
      tenantId: tenantId
    }

    if (servicioId) citaData.servicioId = servicioId
    if (catalogoItemId) citaData.catalogoItemId = catalogoItemId
    if (connectedCalendarId) citaData.connectedCalendarId = connectedCalendarId

    // VALIDACIÓN DE CONFLICTOS (con buffer si se proporciona)
    const bufferMinutos = body.bufferMinutos || 0
    const fechaHoraDate = new Date(fechaHora)
    const duracionConBuffer = (duracion || 60) + bufferMinutos
    const fechaHoraFin = new Date(fechaHoraDate.getTime() + duracionConBuffer * 60000)
    
    // Validar aviso mínimo (no permitir citas antes de X minutos desde ahora)
    const avisoMinimoMin = body.avisoMinimo || 0
    if (avisoMinimoMin > 0) {
      const minBookingTime = new Date(Date.now() + avisoMinimoMin * 60000)
      if (fechaHoraDate < minBookingTime) {
        return NextResponse.json(
          { error: `La cita debe agendarse con al menos ${avisoMinimoMin} minutos de anticipación` },
          { status: 400 }
        )
      }
    }

    // No permitir citas en el pasado
    if (fechaHoraDate < new Date()) {
      return NextResponse.json(
        { error: 'No se pueden agendar citas en el pasado' },
        { status: 400 }
      )
    }
    
    const citasConflictivas = await prisma.cita.findMany({
      where: {
        tenantId: tenantId,
        estado: { not: 'cancelada' },
        OR: [
          {
            AND: [
              { fechaHora: { lte: fechaHoraDate } },
              { fechaHora: { gte: new Date(fechaHoraDate.getTime() - 24 * 60 * 60 * 1000) } }
            ]
          },
          {
            AND: [
              { fechaHora: { lt: fechaHoraFin } },
              { fechaHora: { gte: fechaHoraDate } }
            ]
          }
        ]
      }
    })

    const hayConflicto = citasConflictivas.some(citaExistente => {
      const citaInicio = new Date(citaExistente.fechaHora)
      const citaFin = new Date(citaInicio.getTime() + (citaExistente.duracion + bufferMinutos) * 60000)
      return (
        (fechaHoraDate >= citaInicio && fechaHoraDate < citaFin) ||
        (fechaHoraFin > citaInicio && fechaHoraFin <= citaFin) ||
        (fechaHoraDate <= citaInicio && fechaHoraFin >= citaFin)
      )
    })

    if (hayConflicto) {
      return NextResponse.json({ error: 'Conflicto de horario' }, { status: 409 })
    }

    // Crear la cita en la DB física del tenant
    const cita = await prisma.cita.create({
      data: citaData,
      include: {
        lead: true,
        servicio: true
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: auth.user!.id,
        accion: 'CREATE',
        entidad: 'Cita',
        entidadId: cita.id,
        descripcion: `Cita creada por ${auth.user!.name || auth.user!.email}`,
        cambiosDespues: JSON.stringify({ titulo: cita.titulo, fechaHora: cita.fechaHora })
      }
    })

    // GOOGLE CALENDAR SYNC - Siempre sincronizar si hay integración activa
    let linkReunionGenerado: string | null = null
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findUnique({
        where: { userId: auth.user!.id },
      })

      if (googleIntegration && googleIntegration.activo) {
        // Si se especificó un connectedCalendar, obtener su Google Calendar ID
        let targetCalendarId: string | undefined;
        if (connectedCalendarId) {
          const connectedCal = await prisma.connectedCalendar.findUnique({
            where: { id: connectedCalendarId },
          });
          if (connectedCal) {
            targetCalendarId = connectedCal.calendarId;
          }
        }

        const generarMeet = tipoLinkReunion === 'generar'
        const calendarEvent = await createCalendarEvent(auth.user!.id, {
          id: cita.id,
          titulo: cita.titulo || 'Cita sin título',
          descripcion: cita.descripcion || undefined,
          fechaHora: cita.fechaHora,
          duracion: cita.duracion,
          leadNombre: lead?.nombre || 'Evento sin cliente',
          leadEmail: lead?.email || undefined,
          generarMeet,
          targetCalendarId,
        })

        if (calendarEvent?.hangoutLink) {
          linkReunionGenerado = calendarEvent.hangoutLink
          await prisma.cita.update({
            where: { id: cita.id },
            data: { 
              linkReunion: calendarEvent.hangoutLink,
              ubicacion: 'Google Meet (Virtual)'
            }
          })
          cita.linkReunion = calendarEvent.hangoutLink
          cita.ubicacion = 'Google Meet (Virtual)'
        }
      }
    } catch (gcalError) {
      console.error('Error sincronizando Google Calendar:', gcalError)
    }

    // EMAIL CONFIRMATION - Solo si hay lead y servicio
    if (servicio && lead?.email) {
      const emailHash = generateCitaEmailHash({
        fechaHora: new Date(fechaHora),
        duracion: duracion || servicio.duracionMinutos || 60,
        titulo: cita.titulo,
        servicioNombre: servicio.nombre
      })

      const emailResult = await sendAppointmentConfirmation({
        id: cita.id,
        lead: { nombre: lead?.nombre || 'Cliente', email: lead?.email || '' },
        servicio: {
          nombre: servicio.nombre,
          descripcion: servicio.descripcion,
          precio: servicio.precio,
          moneda: servicio.moneda
        },
        fechaHora: new Date(fechaHora),
        duracion: duracion || servicio.duracionMinutos || 60,
        tenantNombre: auth.tenant!.nombre,
        linkReunion: linkReunionGenerado,
        tenantId: tenantId,
      })

      if (emailResult.success) {
        await prisma.cita.update({
          where: { id: cita.id },
          data: {
            emailConfirmacionEnviado: true,
            fechaEmailConfirmacion: new Date(),
            hashDatosEmail: emailHash
          }
        })
      }
    }

    // AUTOMATIONS & NOTIFICATIONS
    triggerAutomation('cita_agendada', {
      tenantId: tenantId,
      citaId: cita.id,
      leadId: cita.leadId,
      servicioId: cita.servicioId || undefined,
      cita: cita,
    }).catch(e => console.error('Error en AutomationEngine:', e))

    notifyAdminsPush({
      title: '📅 Nueva Cita Agendada',
      body: `${lead?.nombre || 'Evento sin cliente'} - ${cita.titulo}`,
      data: { url: `/dashboard/citas` }
    }, tenantId).catch(e => console.error('Error en PushNotification:', e))

    // Notificación por Telegram al admin
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    notifyByTelegram(
      `📅 *Nueva Cita*\n\n👤 *Cliente:* ${lead?.nombre || 'Sin cliente'}\n📋 *Servicio:* ${cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}${lead?.telefono ? `\n📱 *Teléfono:* ${lead.telefono}` : ''}`,
      createSystemContext(tenantId)
    ).catch(e => console.error('Error enviando notificación Telegram:', e))

    ScoringEngine.calculateScore({
      leadId: cita.leadId,
      evento: 'cita_agendada',
      categoria: 'comportamiento',
      detalles: {
        citaId: cita.id,
        tipo: cita.tipo,
        titulo: cita.titulo,
        servicioNombre: servicio?.nombre,
        fechaHora: fechaHora,
      },
    }).catch(e => console.error('Error en ScoringEngine:', e))

    return NextResponse.json({ success: true, cita })
  } catch (error: any) {
    console.error('[POST /api/citas] Error:', error)
    return NextResponse.json({ error: 'Error al crear cita' }, { status: 500 })
  }
}, ['citas:write'])
