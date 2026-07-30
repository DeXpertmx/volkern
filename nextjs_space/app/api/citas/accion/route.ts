export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { sendAppointmentStatusNotification } from '@/lib/email';
import { deleteCalendarEvent } from '@/lib/google-calendar';
import { createSystemContext } from '@/lib/skills/context';


interface CitaActionPayload {
  citaId: string;
  action: 'confirmar' | 'cancelar' | 'reagendar';
  exp: number;
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token no proporcionado' },
        { status: 400 }
      );
    }

    // Verificar y decodificar token
    let payload: CitaActionPayload;
    try {
      payload = jwt.verify(
        token,
        process.env.NEXTAUTH_SECRET || 'fallback-secret'
      ) as CitaActionPayload;
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        return NextResponse.json(
          { error: 'El enlace ha expirado. Por favor contacta para gestionar tu cita.' },
          { status: 410 }
        );
      }
      return NextResponse.json(
        { error: 'Token inválido' },
        { status: 400 }
      );
    }

    const { citaId, action } = payload;

    // Buscar la cita con información del tenant y propietario
    const cita = await prisma.cita.findUnique({
      where: { id: citaId },
      include: {
        servicio: true,
        lead: true,
        tenant: {
          include: {
            users: {
              where: {
                estado: 'activo',
              },
              orderBy: {
                createdAt: 'asc' // El primer usuario creado suele ser el propietario
              },
              take: 1,
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        },
      },
    });

    if (!cita) {
      return NextResponse.json(
        { error: 'Cita no encontrada' },
        { status: 404 }
      );
    }

    // Verificar si la cita ya fue procesada (evita notificaciones duplicadas)
    // Comparación case-insensitive para manejar inconsistencias en los datos
    const estadoActual = cita.estado.toLowerCase();
    
    if (action === 'confirmar' && estadoActual === 'confirmada') {
      return NextResponse.json({
        success: true,
        action,
        message: 'Esta cita ya estaba confirmada.',
        cita: {
          servicio: cita.servicio?.nombre || cita.titulo,
          fecha: formatearFecha(cita.fechaHora),
        },
      });
    }

    if (action === 'cancelar' && estadoActual === 'cancelada') {
      return NextResponse.json({
        success: true,
        action,
        message: 'Esta cita ya estaba cancelada.',
        cita: {
          servicio: cita.servicio?.nombre || cita.titulo,
          fecha: formatearFecha(cita.fechaHora),
        },
      });
    }

    if (action === 'reagendar') {
      // Para reagendar, generamos un token temporal y redirigimos a la página de booking
      const rescheduleToken = jwt.sign(
        { citaId, action: 'reagendar', exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
        process.env.NEXTAUTH_SECRET || 'fallback-secret'
      )
      return NextResponse.json({
        success: true,
        action: 'reagendar',
        message: 'Redirigiendo para reagendar...',
        rescheduleUrl: `/booking/${cita.tenant?.slug || 'volkern-default'}?reschedule=${citaId}&token=${rescheduleToken}`,
        cita: {
          servicio: cita.servicio?.nombre || cita.titulo,
          fecha: formatearFecha(cita.fechaHora),
        },
      });
    }

    // Verificar que la cita no haya pasado
    if (new Date(cita.fechaHora) < new Date() && action === 'confirmar') {
      return NextResponse.json(
        { error: 'No se puede confirmar una cita que ya pasó.' },
        { status: 400 }
      );
    }

    // Actualizar el estado de la cita (normalizado a minúsculas para consistencia con el resto de la app)
    const nuevoEstado = action === 'confirmar' ? 'confirmada' : 'cancelada';
    
    // Registrar en descripción de la cita
    const notaAccion = action === 'confirmar' 
      ? `[${new Date().toLocaleString('es-MX')}] ✅ Confirmada por el cliente vía email`
      : `[${new Date().toLocaleString('es-MX')}] ❌ Cancelada por el cliente vía email`;
    
    await prisma.cita.update({
      where: { id: citaId },
      data: { 
        estado: nuevoEstado,
        descripcion: cita.descripcion 
          ? `${cita.descripcion}\n${notaAccion}`
          : notaAccion
      },
    });

    // Si se cancela, eliminar el evento de Google Calendar
    if (action === 'cancelar' && cita.tenantId && cita.googleCalendarEventId) {
      try {
        const googleIntegration = await prisma.googleCalendarIntegration.findFirst({
          where: { tenantId: cita.tenantId },
        });

        if (googleIntegration && googleIntegration.activo) {
          console.log('📅 Eliminando cita cancelada de Google Calendar...');
          await deleteCalendarEvent(googleIntegration.userId, citaId, cita.googleCalendarEventId);
          console.log('✅ Cita eliminada de Google Calendar');
        }
      } catch (gcalError: any) {
        console.error('⚠️ Error al eliminar de Google Calendar (no crítico):', gcalError.message);
      }
    }

    // 📧 ENVIAR NOTIFICACIÓN AL PROPIETARIO DEL TENANT
    const owner = cita.tenant?.users?.[0];
    if (owner && owner.email && cita.lead) {
      console.log(`📧 Enviando notificación de cita ${nuevoEstado} al propietario: ${owner.email}`);
      
      const statusResult = await sendAppointmentStatusNotification({
        ownerEmail: owner.email,
        ownerName: owner.name || undefined,
        lead: {
          nombre: cita.lead.nombre,
          email: cita.lead.email || 'No especificado',
        },
        cita: {
          titulo: cita.titulo,
          servicio: cita.servicio?.nombre || null,
          fechaHora: cita.fechaHora,
        },
        accion: nuevoEstado === 'confirmada' ? 'confirmada' : (nuevoEstado === 'cancelada' ? 'cancelada' : 'modificada'),
        tenantNombre: cita.tenant?.nombre,
        tenantId: cita.tenantId || '',
      });

      if (!statusResult.success) {
        console.error('❌ Error enviando notificación de cita al propietario:', statusResult.error);
      }
    }

    // 🔔 Notificación in-app para el propietario
    if (owner?.id && cita.tenantId) {
      const accionInApp = action === 'confirmar' ? 'confirmada' : 'cancelada';
      await prisma.inAppNotification.create({
        data: {
          tenantId: cita.tenantId,
          userId: owner.id,
          title: `Cita ${accionInApp} por el cliente`,
          body: `El cliente ${cita.lead?.nombre || 'N/A'} ha ${accionInApp} la cita de ${cita.servicio?.nombre || cita.titulo}.`,
          type: 'info',
          read: false,
        }
      }).catch(err => console.error('Error creando notificación in-app:', err));
    }

    // Notificación por Telegram al admin
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    const accionTexto = action === 'confirmar' ? 'confirmada' : action === 'cancelar' ? 'cancelada' : 'modificada';
    notifyByTelegram(
      `📅 *Cita ${accionTexto}*\n\n👤 *Cliente:* ${cita.lead?.nombre || 'N/A'}\n📋 *Servicio:* ${cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}`,
      createSystemContext(cita.tenantId || '')
    ).catch(err => console.error('Error en Notificación Telegram:', err))

    // Registrar en audit log usando el propietario del tenant como userId
    const ownerId = cita.tenant?.users?.[0]?.id;
    if (cita.tenantId && ownerId) {
      await prisma.auditLog.create({
        data: {
          tenantId: cita.tenantId,
          userId: ownerId, // Usar el propietario del tenant
          accion: action === 'confirmar' ? 'CONFIRMAR_CITA' : 'CANCELAR_CITA',
          entidad: 'Cita',
          entidadId: citaId,
          descripcion: `Cita ${nuevoEstado} por el cliente ${cita.lead?.nombre} vía email`,
          cambiosDespues: JSON.stringify({
            estadoAnterior: cita.estado,
            estadoNuevo: nuevoEstado,
            clienteNombre: cita.lead?.nombre,
            clienteEmail: cita.lead?.email,
          }),
        },
      });
    }

    const mensaje = action === 'confirmar'
      ? '¡Gracias! Tu cita ha sido confirmada exitosamente.'
      : 'Tu cita ha sido cancelada. Esperamos verte pronto.';
    console.log(`[citas/accion] Cita ${citaId} ${action === 'confirmar' ? 'confirmada' : 'cancelada'}. Estado guardado: ${nuevoEstado}`);

    return NextResponse.json({
      success: true,
      action,
      message: mensaje,
      cita: {
        servicio: cita.servicio?.nombre || cita.titulo,
        fecha: formatearFecha(cita.fechaHora),
      },
    });

  } catch (error) {
    console.error('Error procesando acción de cita:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}

function formatearFecha(fecha: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
  }).format(new Date(fecha));
}
