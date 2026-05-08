export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma, getTenantDb, dbContext } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { sendAppointmentConfirmation, generateCitaEmailHash } from '@/lib/email'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { triggerAutomation } from '@/lib/automation-engine'
import { notifyAdminsPush } from '@/lib/services/push-notification'

/**
 * POST /api/citas/[id]/reagendar
 * Reagenda una cita existente a una nueva fecha/hora
 * Mantiene el mismo lead, servicio y datos, solo cambia fechaHora
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id
    const body = await request.json()
    const { nuevaFechaHora, motivo } = body

    if (!nuevaFechaHora) {
      return NextResponse.json(
        { error: 'nuevaFechaHora es requerido' },
        { status: 400 }
      )
    }

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
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      )
    }

    if (cita.estado === 'cancelada') {
      return NextResponse.json(
        { error: 'No se puede reagendar una cita cancelada' },
        { status: 400 }
      )
    }

    if (cita.estado === 'completada') {
      return NextResponse.json(
        { error: 'No se puede reagendar una cita completada' },
        { status: 400 }
      )
    }

    const nuevaFecha = new Date(nuevaFechaHora)
    if (nuevaFecha <= new Date()) {
      return NextResponse.json(
        { error: 'La nueva fecha debe ser en el futuro' },
        { status: 400 }
      )
    }

    // Verificar conflictos con la nueva fecha
    const nuevaFechaFin = new Date(nuevaFecha.getTime() + cita.duracion * 60000)
    const conflictos = await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        return tenantClient.cita.findMany({
          where: {
            tenantId,
            estado: { not: 'cancelada' },
            id: { not: params.id },
            OR: [
              {
                AND: [
                  { fechaHora: { lte: nuevaFecha } },
                  { fechaHora: { gte: new Date(nuevaFecha.getTime() - 24 * 60 * 60 * 1000) } },
                ],
              },
              {
                AND: [
                  { fechaHora: { lt: nuevaFechaFin } },
                  { fechaHora: { gte: nuevaFecha } },
                ],
              },
            ],
          },
        })
      }
    )

    const hayConflicto = conflictos.some((c: any) => {
      const inicio = new Date(c.fechaHora)
      const fin = new Date(inicio.getTime() + c.duracion * 60000)
      return (
        (nuevaFecha >= inicio && nuevaFecha < fin) ||
        (nuevaFechaFin > inicio && nuevaFechaFin <= fin) ||
        (nuevaFecha <= inicio && nuevaFechaFin >= fin)
      )
    })

    if (hayConflicto) {
      return NextResponse.json(
        { error: 'Conflicto de horario en la nueva fecha' },
        { status: 409 }
      )
    }

    // Guardar fecha anterior para el log
    const fechaAnterior = cita.fechaHora

    // Actualizar cita
    const citaActualizada = await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        return tenantClient.cita.update({
          where: { id: params.id },
          data: {
            fechaHora: nuevaFecha,
            estado: 'pendiente',
            emailConfirmacionEnviado: false,
            recordatorio24hEnviado: false,
            recordatorio1hEnviado: false,
          },
          include: { lead: true, servicio: true },
        })
      }
    )

    // Audit log
    await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        await tenantClient.auditLog.create({
          data: {
            tenantId,
            userId: auth.user!.id,
            accion: 'reagendar',
            entidad: 'Cita',
            entidadId: params.id,
            descripcion: `Cita reagendada: ${fechaAnterior.toISOString()} → ${nuevaFecha.toISOString()}${motivo ? ` (${motivo})` : ''}`,
            cambiosAntes: { fechaHora: fechaAnterior },
            cambiosDespues: { fechaHora: nuevaFecha, motivo },
          },
        })
      }
    )

    // Actualizar Google Calendar
    try {
      if (cita.googleCalendarEventId) {
        const googleIntegration = await dbContext.run(
          { tenantId, client: tenantClient },
          async () => {
            return tenantClient.googleCalendarIntegration.findUnique({
              where: { userId: auth.user!.id },
            })
          }
        )

        if (googleIntegration && googleIntegration.activo) {
          const necesitaMeet = cita.servicio && (cita.servicio.modalidad === 'virtual' || cita.servicio.modalidad === 'hibrido')
          await updateCalendarEvent(auth.user!.id, citaActualizada.id, {
            titulo: citaActualizada.titulo || 'Cita sin título',
            descripcion: citaActualizada.descripcion || undefined,
            fechaHora: citaActualizada.fechaHora,
            duracion: citaActualizada.duracion,
            leadEmail: citaActualizada.lead.email || undefined,
            googleCalendarEventId: cita.googleCalendarEventId,
          })
        }
      }
    } catch (gcalError) {
      console.error('Error actualizando Google Calendar:', gcalError)
    }

    // Reenviar email de confirmación
    if (citaActualizada.lead.email && citaActualizada.servicio) {
      const emailHash = generateCitaEmailHash({
        fechaHora: nuevaFecha,
        duracion: citaActualizada.duracion,
        titulo: citaActualizada.titulo,
        servicioNombre: citaActualizada.servicio.nombre,
      })

      const emailResult = await sendAppointmentConfirmation({
        id: citaActualizada.id,
        lead: { nombre: citaActualizada.lead.nombre, email: citaActualizada.lead.email },
        servicio: {
          nombre: citaActualizada.servicio.nombre,
          descripcion: citaActualizada.servicio.descripcion,
          precio: citaActualizada.servicio.precio,
          moneda: citaActualizada.servicio.moneda,
        },
        fechaHora: nuevaFecha,
        duracion: citaActualizada.duracion,
        tenantNombre: auth.tenant!.nombre,
        linkReunion: citaActualizada.linkReunion,
        tenantId,
      })

      if (emailResult.success) {
        await dbContext.run(
          { tenantId, client: tenantClient },
          async () => {
            await tenantClient.cita.update({
              where: { id: params.id },
              data: {
                emailConfirmacionEnviado: true,
                fechaEmailConfirmacion: new Date(),
                hashDatosEmail: emailHash,
              },
            })
          }
        )
      }
    }

    // Trigger automation
    triggerAutomation('cita_reagendada', {
      tenantId,
      citaId: citaActualizada.id,
      leadId: citaActualizada.leadId,
      fechaAnterior,
      nuevaFecha,
      motivo,
    }).catch(e => console.error('Error trigger automation:', e))

    // Push notification
    notifyAdminsPush({
      title: '📅 Cita Reagendada',
      body: `${citaActualizada.lead.nombre} reagendó: ${citaActualizada.titulo}`,
      data: { url: `/dashboard/citas/${params.id}` },
    }, tenantId).catch(e => console.error('Error push notification:', e))

    return NextResponse.json({
      success: true,
      cita: citaActualizada,
      fechaAnterior,
      nuevaFecha,
    })
  } catch (error: any) {
    console.error('[POST /api/citas/[id]/reagendar] Error:', error)
    return NextResponse.json(
      { error: 'Error al reagendar la cita' },
      { status: 500 }
    )
  }
}, ['citas:write'])
