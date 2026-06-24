export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { sendAppointmentConfirmation, sendAppointmentStatusNotification, generateCitaEmailHash } from '@/lib/email'
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
    const { estado, fechaHora, montoPagado, stripePaymentId, titulo, descripcion, duracion, tipo, catalogoItemId, connectedCalendarId } = body

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

    // 📅 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE CALENDAR (en tiempo real)
    try {
      // Sincronizar con el calendario del usuario asignado
      const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { userId: cita.usuarioAsignadoId || auth.user?.id },
      })

      if (googleIntegration && googleIntegration.activo) {
        console.log('📅 Actualizando cita en Google Calendar...')

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

        await updateCalendarEvent(googleIntegration.userId, params.id, {
          titulo: cita.titulo || 'Cita',
          descripcion: cita.descripcion || undefined,
          fechaHora: cita.fechaHora,
          duracion: cita.duracion,
          leadEmail: cita.lead?.email || undefined,
          googleCalendarEventId: cita.googleCalendarEventId,
          targetCalendarId,
        })

        console.log('✅ Cita actualizada en Google Calendar')
      }
    } catch (gcalError: any) {
      console.error('⚠️ Error al actualizar en Google Calendar (no crítico):', gcalError.message)
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
          tenantNombre: undefined, // Se obtiene del tenant
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
    const { estado, fechaHora, montoPagado, stripePaymentId, titulo, descripcion, duracion, tipo, catalogoItemId, connectedCalendarId } = body

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

    // 📅 SINCRONIZACIÓN AUTOMÁTICA CON GOOGLE CALENDAR (en tiempo real)
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { userId: cita.usuarioAsignadoId || auth.user?.id },
      })

      if (googleIntegration && googleIntegration.activo) {
        console.log('📅 Actualizando cita en Google Calendar...')

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

        await updateCalendarEvent(googleIntegration.userId, params.id, {
          titulo: cita.titulo || 'Cita',
          descripcion: cita.descripcion || undefined,
          fechaHora: cita.fechaHora,
          duracion: cita.duracion,
          leadEmail: cita.lead?.email || undefined,
          googleCalendarEventId: cita.googleCalendarEventId,
          targetCalendarId,
        })

        console.log('✅ Cita actualizada en Google Calendar')
      }
    } catch (gcalError: any) {
      console.error('⚠️ Error al actualizar en Google Calendar (no crítico):', gcalError.message)
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
