export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, globalPrisma } from '@/lib/db'
import { triggerAutomation } from '@/lib/automation-engine'
import { ScoringEngine } from '@/lib/scoring-engine'
import { sendAppointmentConfirmation, generateCitaEmailHash } from '@/lib/email'
import { createCalendarEvent } from '@/lib/google-calendar'
import { withPublicTenant } from '@/lib/api-key-auth'

/**
 * Endpoint público para crear citas desde embeds (booking)
 * Aislamiento físico de base de datos garantizado por withPublicTenant e Intelligent Proxy
 */
export const POST = withPublicTenant(async (request, tenantId) => {
  try {
    const body = await request.json()
    const {
      leadId: providedLeadId,
      servicioId,
      fechaHora,
      titulo,
      tipo,
      notas,
      usuarioAsignadoId,
      leadData
    } = body

    if (!fechaHora || (!providedLeadId && !leadData?.email)) {
      return NextResponse.json(
        { error: 'fechaHora y (leadId o leadData.email) son requeridos' },
        { status: 400 }
      )
    }

    // El proxy de prisma ya redirige inteligentemente:
    // 'tenant' es global, 'lead' es local del tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Obtener o crear el lead
    let leadId = providedLeadId
    let lead = null

    if (leadId) {
      lead = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: tenantId }
      })
    } else if (leadData && leadData.email) {
      lead = await prisma.lead.findFirst({
        where: { email: leadData.email, tenantId: tenantId }
      })

      if (!lead) {
        lead = await prisma.lead.create({
          data: {
            nombre: leadData.nombre || 'Interesado agendamiento',
            email: leadData.email,
            telefono: leadData.telefono,
            empresa: leadData.empresa,
            tenantId: tenantId,
            estado: 'nuevo',
            fuente: 'agendamiento_publico'
          }
        })
      }
      leadId = lead.id
    }

    if (!lead) {
      return NextResponse.json({ error: 'No se pudo identificar o crear el lead' }, { status: 404 })
    }

    let duracion = 60
    let servicio = null

    if (servicioId) {
      servicio = await prisma.servicio.findFirst({
        where: { id: servicioId, tenantId: tenantId }
      })
      if (!servicio) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
      }
      duracion = servicio.duracionMinutos
    }

    // Validar conflictos de horario
    const fechaInicio = new Date(fechaHora)
    const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000)

    const citasExistentes = await prisma.cita.findMany({
      where: {
        tenantId: tenantId,
        estado: { not: 'cancelada' },
        fechaHora: {
          gte: new Date(fechaInicio.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(fechaInicio.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      include: { servicio: true }
    })

    for (const citaExistente of citasExistentes) {
      const existenteInicio = new Date(citaExistente.fechaHora)
      const existenteDuracion = citaExistente.duracion || citaExistente.servicio?.duracionMinutos || 60
      const existenteFin = new Date(existenteInicio.getTime() + existenteDuracion * 60000)

      const hayConflicto =
        (fechaInicio >= existenteInicio && fechaInicio < existenteFin) ||
        (fechaFin > existenteInicio && fechaFin <= existenteFin) ||
        (fechaInicio <= existenteInicio && fechaFin >= existenteFin)

      if (hayConflicto) {
        return NextResponse.json({ error: 'Conflicto de horario' }, { status: 409 })
      }
    }

    // Crear la cita en la DB del Tenant
    const cita = await prisma.cita.create({
      data: {
        tenantId: tenantId,
        leadId: leadId,
        usuarioAsignadoId: usuarioAsignadoId || null,
        servicioId: servicioId || null,
        fechaHora: new Date(fechaHora),
        duracion: duracion,
        titulo: titulo || servicio?.nombre || 'Cita',
        tipo: tipo || 'virtual',
        descripcion: notas || null,
        estado: 'pendiente'
      },
      include: {
        lead: true,
        servicio: true
      }
    })

    // GOOGLE CALENDAR SYNC (Usa intelligent routing para el modelo User)
    let linkReunionGenerado: string | null = null
    if (usuarioAsignadoId) {
      try {
        const googleIntegration = await prisma.googleCalendarIntegration.findUnique({
          where: { userId: usuarioAsignadoId },
        })

        if (googleIntegration && googleIntegration.activo) {
          const necesitaMeet = servicio && (servicio.modalidad === 'virtual' || servicio.modalidad === 'hibrido')
          const calendarEvent = await createCalendarEvent(usuarioAsignadoId, {
            id: cita.id,
            titulo: cita.titulo || 'Cita agendada',
            descripcion: cita.descripcion || `Cita agendada desde booking público\nCliente: ${lead.nombre}\nEmail: ${lead.email}`,
            fechaHora: cita.fechaHora,
            duracion: cita.duracion,
            leadNombre: lead.nombre,
            leadEmail: lead.email || undefined,
            generarMeet: necesitaMeet || undefined,
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
          }
        }
      } catch (gcalError) {
        console.error('Error Google Calendar:', gcalError)
      }
    }

    // EMAIL CONFIRMATION
    if (servicio && lead.email) {
      try {
        const emailHash = generateCitaEmailHash({
          fechaHora: cita.fechaHora,
          duracion: cita.duracion,
          titulo: cita.titulo,
          servicioNombre: servicio.nombre
        })

        const emailResult = await sendAppointmentConfirmation({
          id: cita.id,
          lead: { nombre: lead.nombre, email: lead.email },
          servicio: {
            nombre: servicio.nombre,
            descripcion: servicio.descripcion,
            precio: servicio.precio,
            moneda: servicio.moneda
          },
          fechaHora: cita.fechaHora,
          duracion: cita.duracion,
          tenantNombre: tenant.nombre,
          linkReunion: linkReunionGenerado,
          tenantId: tenantId
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
      } catch (emailError) {
        console.error('Error correo confirmación:', emailError)
      }
    }

    // TRIGGER AUTOMATIONS & SCORING (Heredan contexto)
    triggerAutomation('cita_agendada', {
      tenantId: tenantId,
      citaId: cita.id,
      leadId: cita.leadId,
      servicioId: cita.servicioId || undefined,
      cita: cita
    }).catch(e => console.error('Error Automation:', e))

    ScoringEngine.recalculateLeadScore(leadId).catch(e => console.error('Error Scoring:', e))

    return NextResponse.json({
      success: true,
      cita: { id: cita.id, fechaHora: cita.fechaHora, titulo: cita.titulo }
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })

  } catch (error) {
    console.error('❌ Error creating public appointment:', error)
    return NextResponse.json({ error: 'Error al crear cita' }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
})

// Manejar OPTIONS para CORS preflight
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
