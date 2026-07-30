export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { sendAppointmentConfirmation, generateCitaEmailHash } from '@/lib/email'
import { notifyUser } from '@/lib/skills/notification-layer'
import { createSystemContext } from '@/lib/skills/context'
import { authenticateRequest } from '@/lib/api-key-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['citas:read', 'appointments:read'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 })
    }

    const cita = await prisma.cita.findUnique({
      where: { id: params.id },
      include: {
        lead: true,
        servicio: true
      }
    })

    if (!cita) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    // Formatear los nombres de los campos para coincidir con el tipo esperado
    return NextResponse.json({
      id: cita.id,
      fecha_hora: cita.fechaHora.toISOString(),
      estado: cita.estado,
      monto_pagado: cita.montoPagado,
      titulo: cita.titulo,
      duracion: cita.duracion,
      descripcion: cita.descripcion,
      servicio: cita.servicio ? {
        id: cita.servicio.id,
        nombre: cita.servicio.nombre,
        descripcion: cita.servicio.descripcion,
        duracion_minutos: cita.servicio.duracionMinutos,
        precio: cita.servicio.precio,
        moneda: cita.servicio.moneda,
      } : null,
      lead: {
        id: cita.lead!.id,
        nombre: cita.lead!.nombre,
        email: cita.lead!.email,
        telefono: cita.lead!.telefono || '',
        notas: cita.lead!.notas || '',
      }
    })

  } catch (error) {
    console.error('Error fetching cita:', error)
    return NextResponse.json(
      { error: 'Error al obtener cita' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['citas:write', 'appointments:write'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 })
    }

    const tenantId = auth.tenant.id

    const body = await request.json()
    let { estado, fechaHora, montoPagado, stripePaymentId, titulo, descripcion, duracion, tipo, catalogoItemId, connectedCalendarId } = body
    if (estado) estado = (estado as string).toLowerCase()

    // Obtener la cita antes de actualizar para comparar cambios
    const citaAnterior = await prisma.cita.findUnique({
      where: { id: params.id },
      include: { lead: true, servicio: true }
    })

    if (!citaAnterior) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const cita = await prisma.cita.update({
      where: { id: params.id },
      data: {
        ...(estado && { estado }),
        ...(fechaHora && { fechaHora: new Date(fechaHora) }),
        ...(montoPagado !== undefined && { montoPagado: parseFloat(montoPagado) }),
        ...(stripePaymentId && { stripePaymentId }),
        ...(titulo && { titulo }),
        ...(descripcion !== undefined && { descripcion }),
        ...(duracion && { duracion }),
        ...(tipo && { tipo }),
        ...(catalogoItemId && { catalogoItemId }),
        ...(connectedCalendarId !== undefined && { connectedCalendarId }),
      },
      include: {
        lead: true,
        servicio: true
      }
    })

    // Determinar qué tipo de cambio se realizó para decidir si toca Google Calendar o enviar correo
    const estadoAnteriorLower = citaAnterior.estado?.toLowerCase() || ''
    const estadoNuevoLower = cita.estado?.toLowerCase() || ''
    const huboCancelacion = estadoNuevoLower === 'cancelada' && estadoAnteriorLower !== 'cancelada'
    const huboCambiosDeCalendario = (
      (fechaHora && new Date(fechaHora).getTime() !== citaAnterior.fechaHora.getTime()) ||
      (duracion && duracion !== citaAnterior.duracion) ||
      (titulo && titulo !== citaAnterior.titulo) ||
      (descripcion !== undefined && descripcion !== citaAnterior.descripcion)
    )

    // 📅 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE CALENDAR (en tiempo real)
    // Solo tocamos GCal si: se canceló la cita (eliminar evento) o cambió algo del calendario.
    // Un simple cambio de estado (confirmar/pagar) NO debe disparar updateCalendarEvent.
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { userId: cita.usuarioAsignadoId || auth.user?.id },
      })

      if (googleIntegration && googleIntegration.activo) {
        // Obtener el Google Calendar ID específico si la cita tiene connectedCalendarId
        let targetCalendarId: string | undefined;
        if (cita.connectedCalendarId) {
          const connectedCal = await prisma.connectedCalendar.findUnique({
            where: { id: cita.connectedCalendarId },
          });
          if (connectedCal) {
            targetCalendarId = connectedCal.calendarId;
          }
        }

        if (huboCancelacion && cita.googleCalendarEventId) {
          console.log('📅 Eliminando cita cancelada de Google Calendar...')
          await deleteCalendarEvent(googleIntegration.userId, params.id, cita.googleCalendarEventId, targetCalendarId)
          console.log('✅ Cita eliminada de Google Calendar')
        } else if (huboCambiosDeCalendario) {
          console.log('📅 Actualizando cita en Google Calendar...')
          await updateCalendarEvent(googleIntegration.userId, params.id, {
            titulo: cita.titulo || 'Cita',
            descripcion: cita.descripcion || undefined,
            fechaHora: cita.fechaHora,
            duracion: cita.duracion,
            googleCalendarEventId: cita.googleCalendarEventId,
            targetCalendarId,
          })
          console.log('✅ Cita actualizada en Google Calendar')
        }
      }
    } catch (gcalError: any) {
      console.error('️ Error al actualizar en Google Calendar (no crítico):', gcalError.message)
    }

    // 🔔 Notificación in-app cuando la cita se cancela
    if (huboCancelacion) {
      const targetUserId = cita.usuarioAsignadoId || auth.user?.id
      if (targetUserId) {
        notifyUser(
          targetUserId,
          'Cita cancelada',
          `La cita con ${cita.lead?.nombre || 'cliente'} para ${cita.servicio?.nombre || cita.titulo} ha sido cancelada.`,
          createSystemContext(tenantId)
        ).catch(err => console.error('Error creando notificación in-app de cancelación:', err))
      }
    }

    // 📧 Enviar correo de confirmación al lead cuando el admin confirma la cita
    if (estadoNuevoLower === 'confirmada' && estadoAnteriorLower !== 'confirmada' && cita.lead?.email && cita.servicio) {
      console.log(`📧 Enviando correo de confirmación al lead: ${cita.lead.email}`)
      const emailResult = await sendAppointmentConfirmation({
        id: cita.id,
        lead: { nombre: cita.lead.nombre, email: cita.lead.email },
        servicio: {
          nombre: cita.servicio.nombre,
          descripcion: cita.servicio.descripcion,
          precio: cita.servicio.precio,
          moneda: cita.servicio.moneda,
        },
        fechaHora: cita.fechaHora,
        duracion: cita.duracion,
        tenantNombre: auth.tenant?.nombre,
        linkReunion: cita.linkReunion,
        tenantId: tenantId,
      }).catch(err => ({ success: false, error: String(err) })) as { success: boolean; error?: string }

      if (!emailResult.success) {
        console.error('❌ Error enviando correo de confirmación al lead:', emailResult.error)
      }

      // 🔔 Notificación in-app para el usuario asignado/admin
      const targetUserId = cita.usuarioAsignadoId || auth.user?.id
      if (targetUserId) {
        const fechaFormateada = new Intl.DateTimeFormat('es-MX', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'America/Mexico_City'
        }).format(cita.fechaHora)

        notifyUser(
          targetUserId,
          'Cita confirmada',
          `La cita con ${cita.lead?.nombre || 'cliente'} para ${cita.servicio?.nombre || cita.titulo} el ${fechaFormateada} ha sido confirmada.`,
          createSystemContext(tenantId)
        ).catch(err => console.error('Error creando notificación in-app:', err))
      }
    }

    // 📧 CONTROL DE REENVÍO DE CORREO AL LEAD
    // Solo reenviar si hubo cambios significativos en fecha/hora o duración
    const hubosCambiosFecha = fechaHora && new Date(fechaHora).getTime() !== citaAnterior.fechaHora.getTime()
    const huboCambiosDuracion = duracion && duracion !== citaAnterior.duracion

    if ((hubosCambiosFecha || huboCambiosDuracion) && cita.lead?.email && cita.servicio) {
      // Generar nuevo hash para verificar si realmente cambió algo relevante
      const nuevoHash = generateCitaEmailHash({
        fechaHora: cita.fechaHora,
        duracion: cita.duracion,
        titulo: cita.titulo,
        servicioNombre: cita.servicio.nombre
      })

      // Solo reenviar si el hash cambió (datos relevantes modificados)
      if (nuevoHash !== citaAnterior.hashDatosEmail) {
        console.log('📧 Detectados cambios significativos, reenviando correo de confirmación...')
        
        const emailResult = await sendAppointmentConfirmation({
          id: cita.id,
          lead: { nombre: cita.lead.nombre, email: cita.lead.email },
          servicio: {
            nombre: cita.servicio.nombre,
            descripcion: cita.servicio.descripcion,
            precio: cita.servicio.precio,
            moneda: cita.servicio.moneda
          },
          fechaHora: cita.fechaHora,
          duracion: cita.duracion,
          tenantNombre: auth.tenant?.nombre,
          linkReunion: cita.linkReunion,
          tenantId: tenantId
        })

        if (emailResult.success) {
          await prisma.cita.update({
            where: { id: cita.id },
            data: {
              fechaEmailConfirmacion: new Date(),
              hashDatosEmail: nuevoHash
            }
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      cita
    })

  } catch (error) {
    console.error('Error updating cita:', error)
    return NextResponse.json(
      { error: 'Error al actualizar cita' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['citas:write', 'appointments:write'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 })
    }

    const tenantId = auth.tenant.id

    const body = await request.json()
    let { estado, fechaHora, montoPagado, stripePaymentId, titulo, descripcion, duracion, tipo, catalogoItemId, connectedCalendarId } = body
    if (estado) estado = (estado as string).toLowerCase()

    const citaAnterior = await prisma.cita.findUnique({
      where: { id: params.id },
      include: { lead: true, servicio: true }
    })

    if (!citaAnterior) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const cita = await prisma.cita.update({
      where: { id: params.id },
      data: {
        ...(estado && { estado }),
        ...(fechaHora && { fechaHora: new Date(fechaHora) }),
        ...(montoPagado && { montoPagado: parseFloat(montoPagado) }),
        ...(stripePaymentId && { stripePaymentId }),
        ...(titulo && { titulo }),
        ...(descripcion !== undefined && { descripcion }),
        ...(duracion && { duracion }),
        ...(tipo && { tipo }),
        ...(catalogoItemId && { catalogoItemId }),
        ...(connectedCalendarId !== undefined && { connectedCalendarId }),
      },
      include: {
        lead: true,
        servicio: true
      }
    })

    // Determinar qué tipo de cambio se realizó
    const estadoAnteriorLower = citaAnterior.estado?.toLowerCase() || ''
    const estadoNuevoLower = cita.estado?.toLowerCase() || ''
    const huboCancelacion = estadoNuevoLower === 'cancelada' && estadoAnteriorLower !== 'cancelada'
    const huboCambiosDeCalendario = (
      (fechaHora && new Date(fechaHora).getTime() !== citaAnterior.fechaHora.getTime()) ||
      (duracion && duracion !== citaAnterior.duracion) ||
      (titulo && titulo !== citaAnterior.titulo) ||
      (descripcion !== undefined && descripcion !== citaAnterior.descripcion)
    )

    // 📅 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE CALENDAR (en tiempo real)
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { userId: cita.usuarioAsignadoId || auth.user?.id },
      })

      if (googleIntegration && googleIntegration.activo) {
        // Obtener el Google Calendar ID específico si la cita tiene connectedCalendarId
        let targetCalendarId: string | undefined;
        if (cita.connectedCalendarId) {
          const connectedCal = await prisma.connectedCalendar.findUnique({
            where: { id: cita.connectedCalendarId },
          });
          if (connectedCal) {
            targetCalendarId = connectedCal.calendarId;
          }
        }

        if (huboCancelacion && cita.googleCalendarEventId) {
          console.log('📅 Eliminando cita cancelada de Google Calendar...')
          await deleteCalendarEvent(googleIntegration.userId, params.id, cita.googleCalendarEventId, targetCalendarId)
          console.log('✅ Cita eliminada de Google Calendar')
        } else if (huboCambiosDeCalendario) {
          console.log('📅 Actualizando cita en Google Calendar...')
          await updateCalendarEvent(googleIntegration.userId, params.id, {
            titulo: cita.titulo || 'Cita',
            descripcion: cita.descripcion || undefined,
            fechaHora: cita.fechaHora,
            duracion: cita.duracion,
            googleCalendarEventId: cita.googleCalendarEventId,
            targetCalendarId,
          })
          console.log('✅ Cita actualizada en Google Calendar')
        }
      }
    } catch (gcalError: any) {
      console.error('⚠️ Error al actualizar en Google Calendar (no crítico):', gcalError.message)
    }

    // 📧 Enviar correo de confirmación al lead cuando el admin confirma la cita
    if (estadoNuevoLower === 'confirmada' && estadoAnteriorLower !== 'confirmada' && cita.lead?.email && cita.servicio) {
      console.log(`📧 Enviando correo de confirmación al lead: ${cita.lead.email}`)
      const emailResult = await sendAppointmentConfirmation({
        id: cita.id,
        lead: { nombre: cita.lead.nombre, email: cita.lead.email },
        servicio: {
          nombre: cita.servicio.nombre,
          descripcion: cita.servicio.descripcion,
          precio: cita.servicio.precio,
          moneda: cita.servicio.moneda,
        },
        fechaHora: cita.fechaHora,
        duracion: cita.duracion,
        tenantNombre: auth.tenant?.nombre,
        linkReunion: cita.linkReunion,
        tenantId: tenantId,
      }).catch(err => ({ success: false, error: String(err) })) as { success: boolean; error?: string }

      if (!emailResult.success) {
        console.error('❌ Error enviando correo de confirmación al lead:', emailResult.error)
      }

      // 🔔 Notificación in-app para el usuario asignado/admin
      const targetUserId = cita.usuarioAsignadoId || auth.user?.id
      if (targetUserId) {
        const fechaFormateada = new Intl.DateTimeFormat('es-MX', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'America/Mexico_City'
        }).format(cita.fechaHora)

        notifyUser(
          targetUserId,
          'Cita confirmada',
          `La cita con ${cita.lead?.nombre || 'cliente'} para ${cita.servicio?.nombre || cita.titulo} el ${fechaFormateada} ha sido confirmada.`,
          createSystemContext(tenantId)
        ).catch(err => console.error('Error creando notificación in-app:', err))
      }
    }

    return NextResponse.json({
      success: true,
      cita
    })

  } catch (error) {
    console.error('Error updating cita:', error)
    return NextResponse.json(
      { error: 'Error al actualizar cita' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Autenticación dual: sesión o API key
    const auth = await authenticateRequest(request, ['citas:delete', 'appointments:delete'])
    
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 })
    }

    const tenantId = auth.tenant.id

    // Obtener la cita primero para tener el googleCalendarEventId
    const citaExistente = await prisma.cita.findUnique({
      where: { id: params.id },
      select: { googleCalendarEventId: true, usuarioAsignadoId: true, connectedCalendarId: true }
    })

    // 📅 ELIMINAR DE GOOGLE CALENDAR PRIMERO (en tiempo real)
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { userId: citaExistente?.usuarioAsignadoId || auth.user?.id },
      })

      if (googleIntegration && googleIntegration.activo) {
        console.log('📅 Eliminando cita de Google Calendar...')

        // Obtener el Google Calendar ID específico si la cita tenía connectedCalendarId
        let targetCalendarId: string | null = null;
        if (citaExistente?.connectedCalendarId) {
          const connectedCal = await prisma.connectedCalendar.findUnique({
            where: { id: (citaExistente as any).connectedCalendarId },
          });
          if (connectedCal) {
            targetCalendarId = connectedCal.calendarId;
          }
        }

        await deleteCalendarEvent(googleIntegration.userId, params.id, citaExistente?.googleCalendarEventId, targetCalendarId)

        console.log('✅ Cita eliminada de Google Calendar')
      }
    } catch (gcalError: any) {
      console.error('⚠️ Error al eliminar de Google Calendar (no crítico):', gcalError.message)
    }

    // Eliminar cita de la base de datos
    await prisma.cita.delete({
      where: { id: params.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Cita eliminada correctamente'
    })

  } catch (error) {
    console.error('Error deleting cita:', error)
    return NextResponse.json(
      { error: 'Error al eliminar cita' },
      { status: 500 }
    )
  }
}
