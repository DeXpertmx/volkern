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
    let isFromCatalogo = false

    if (servicioId) {
      // 1. Intentar buscar en la tabla Servicio (Legacy)
      const legacyServicio = await prisma.servicio.findFirst({
        where: { id: servicioId, tenantId: tenantId }
      })

      if (legacyServicio) {
        let bookingPlatform: string | null = null
        let bookingLocation: string | null = null
        // Si el Servicio legacy tiene catalogoItemId vinculado, leer metadata de allí
        if (legacyServicio.catalogoItemId) {
          const linkedCat = await prisma.catalogoItem.findUnique({
            where: { id: legacyServicio.catalogoItemId },
            select: { metadata: true }
          })
          const meta = (linkedCat?.metadata as any) || {}
          bookingPlatform = meta.bookingPlatform || null
          bookingLocation = meta.bookingLocation || null
        }
        servicio = {
          ...legacyServicio,
          bookingPlatform,
          bookingLocation,
        }
      }

      if (!servicio) {
        // 2. Intentar buscar en la tabla CatalogoItem (Onboarding 2.0)
        const catalogoItem = await prisma.catalogoItem.findFirst({
          where: { id: servicioId, tenantId: tenantId, tipo: { in: ['servicio', 'cita'] } }
        })

        if (catalogoItem) {
          const bookingMeta = (catalogoItem.metadata as any) || {}
          servicio = {
            id: catalogoItem.id,
            nombre: catalogoItem.nombre,
            duracionMinutos: catalogoItem.duracionMinutos || 60,
            descripcion: catalogoItem.descripcion,
            precio: catalogoItem.precioBase,
            moneda: catalogoItem.moneda,
            modalidad: catalogoItem.modalidad || 'virtual',
            bookingPlatform: bookingMeta.bookingPlatform || null,
            bookingLocation: bookingMeta.bookingLocation || null,
          }
          isFromCatalogo = true
        }
      }

      if (!servicio) {
        return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })
      }
      duracion = (servicio as any).duracionMinutos
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

    // Validar límite diario de citas
    const limiteDiarioConfig = await prisma.configuracion.findFirst({
      where: {
        tenantId: tenantId,
        clave: 'limiteDiarioCitas'
      }
    })

    if (limiteDiarioConfig?.valor) {
      const limiteDiario = parseInt(limiteDiarioConfig.valor, 10)
      if (!isNaN(limiteDiario) && limiteDiario > 0) {
        const startOfDay = new Date(fechaInicio)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(fechaInicio)
        endOfDay.setHours(23, 59, 59, 999)

        const citasDelDia = await prisma.cita.count({
          where: {
            tenantId: tenantId,
            estado: { not: 'cancelada' },
            fechaHora: { gte: startOfDay, lte: endOfDay }
          }
        })

        if (citasDelDia >= limiteDiario) {
          return NextResponse.json(
            { error: `Se alcanzó el límite diario de ${limiteDiario} citas para este día` },
            { status: 409 }
          )
        }
      }
    }

    // Leer config de plataforma/ubicación desde el servicio
    const bookingPlatform = (servicio as any)?.bookingPlatform || null
    const bookingLocation = (servicio as any)?.bookingLocation || null
    const modalidad = (servicio as any)?.modalidad || 'virtual'

    // Crear la cita en la DB del Tenant
    const cita = await prisma.cita.create({
      data: {
        tenantId: tenantId,
        leadId: leadId,
        usuarioAsignadoId: usuarioAsignadoId || null,
        servicioId: isFromCatalogo ? null : (servicioId || null),
        catalogoItemId: isFromCatalogo ? servicioId : null,
        fechaHora: new Date(fechaHora),
        duracion: duracion,
        titulo: titulo || servicio?.nombre || 'Cita',
        tipo: tipo || (modalidad === 'virtual' ? 'llamada' : modalidad === 'presencial' ? 'reunion' : 'servicio'),
        descripcion: notas || null,
        ubicacion: (modalidad === 'presencial' || modalidad === 'hibrido') ? (bookingLocation || null) : null,
        tipoLinkReunion: (modalidad === 'virtual' || modalidad === 'hibrido') ? (bookingPlatform || 'ninguno') : 'ninguno',
        linkReunion: null,
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

            if (calendarEvent?.id) {
              linkReunionGenerado = calendarEvent.hangoutLink || null
              await prisma.cita.update({
                where: { id: cita.id },
                data: { 
                  linkReunion: calendarEvent.hangoutLink,
                  googleCalendarEventId: calendarEvent.id,
                  ubicacion: calendarEvent.hangoutLink ? 'Google Meet (Virtual)' : cita.ubicacion
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
      servicioId: (cita.servicioId || undefined) as any,
      cita: cita
    } as any).catch(e => console.error('Error Automation:', e))

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
