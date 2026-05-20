/**
 * Booking Skills
 * API funcional para el flujo de reservas/citas
 * 
 * Este es un skill compuesto que internamente llama a otros skills:
 * booking_created:
 *   → create_lead (si no existe)
 *   → create_conversation
 *   → create_task
 *   → emit booking_created
 */

import { prisma } from '@/lib/db';
import { eventBus, EVENTS } from './event-bus';
import { createLead, findLeadByEmail } from './contact-skills';
import { createTask } from './task-skills';
import { createConversation } from './conversation-skills';
import type { BookingCreatedEvent, BookingConfirmedEvent } from '@/lib/types/events';
import { checkAvailability } from '@/lib/services/appointments';
import { sendEmail } from '@/lib/ses-email';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

// ============== TIPOS ==============

export interface CreateBookingInput {
  tenantId: string;
  // Datos del cliente
  nombre: string;
  email: string;
  telefono?: string;
  // Datos de la cita
  titulo: string;
  descripcion?: string;
  fechaHora: Date;
  duracion?: number; // en minutos
  servicioId?: string;
  catalogoItemId?: string;
  // Opciones
  crearLead?: boolean;
  crearConversacion?: boolean;
  crearTareaConfirmacion?: boolean;
  // Metadata
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface ConfirmBookingInput {
  bookingId: string;
  tenantId: string;
  googleCalendarEventId?: string;
  linkReunion?: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface CancelBookingInput {
  bookingId: string;
  tenantId: string;
  motivo?: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

export interface AutoScheduleInput {
  tenantId: string;
  leadId: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTime?: string; // HH:mm
  titulo: string;
  userId?: string;
  source?: 'api' | 'app' | 'automation' | 'mcp' | 'webhook';
}

// ============== SKILLS ==============

/**
 * Crear una nueva reserva/cita
 * Orquesta: lead + conversación + tarea + cita
 */
export async function createBooking(input: CreateBookingInput) {
  const {
    tenantId,
    nombre,
    email,
    telefono,
    titulo,
    descripcion,
    fechaHora,
    duracion = 30,
    servicioId,
    catalogoItemId,
    crearLead = true,
    crearConversacion = false,
    crearTareaConfirmacion = true,
    userId,
    source = 'app',
  } = input;

  // 1. Validación
  if (!tenantId) throw new Error('tenantId es requerido');
  if (!nombre) throw new Error('nombre es requerido');
  if (!email) throw new Error('email es requerido');
  if (!titulo) throw new Error('titulo es requerido');
  if (!fechaHora) throw new Error('fechaHora es requerida');

  // 2. Buscar o crear lead (siempre requerido para citas)
  let lead = await findLeadByEmail(email, tenantId);
  
  if (!lead) {
    if (crearLead) {
      lead = await createLead({
        tenantId,
        nombre,
        email,
        telefono,
        fuente: 'booking',
        userId,
        source,
      });
    } else {
      throw new Error('No se encontró un lead con ese email y crearLead está desactivado');
    }
  }

  // 3. Crear la cita en la base de datos
  const cita = await prisma.cita.create({
    data: {
      tenantId,
      titulo,
      descripcion,
      fechaHora,
      duracion,
      estado: 'pendiente',
      leadId: lead.id,
      servicioId,
      catalogoItemId,
    },
  });

  // 4. Crear conversación si se solicita
  let conversation = null;
  if (crearConversacion) {
    conversation = await createConversation({
      tenantId,
      contactoNombre: nombre,
      contactoEmail: email,
      contactoTelefono: telefono,
      canal: 'web',
      leadId: lead.id,
      userId,
      source,
    });
  }

  // 5. Crear tarea de confirmación si se solicita
  let task = null;
  if (crearTareaConfirmacion) {
    // Tarea para 24h antes de la cita
    const fechaTarea = new Date(fechaHora);
    fechaTarea.setHours(fechaTarea.getHours() - 24);

    task = await createTask({
      tenantId,
      leadId: lead.id,
      titulo: `Confirmar cita: ${titulo}`,
      tipo: 'llamada',
      descripcion: `Confirmar cita de ${nombre} programada para ${fechaHora.toLocaleString()}`,
      fechaVencimiento: fechaTarea,
      asignadoA: userId,
      userId,
      source,
    });
  }

  // 6. Emitir evento booking_created
  const eventPayload: BookingCreatedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    bookingId: cita.id,
    leadId: lead.id,
    servicioId,
    fechaHora,
    titulo,
  };
  eventBus.emitEvent(EVENTS.BOOKING_CREATED, eventPayload);

  // 7. Retornar resultado
  return {
    success: true,
    cita,
    lead,
    conversation,
    task,
    evento: EVENTS.BOOKING_CREATED,
  };
}

/**
 * Confirmar una cita
 */
export async function confirmBooking(input: ConfirmBookingInput) {
  const { bookingId, tenantId, googleCalendarEventId, linkReunion, userId, source = 'app' } = input;

  // 1. Validación
  if (!bookingId) throw new Error('bookingId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');

  // Verificar que la cita existe
  const cita = await prisma.cita.findFirst({
    where: { id: bookingId, tenantId },
  });
  if (!cita) {
    throw new Error('Cita no encontrada');
  }

  // 2. Actualizar cita
  const citaConfirmada = await prisma.cita.update({
    where: { id: bookingId },
    data: {
      estado: 'confirmada',
      googleCalendarEventId,
      linkReunion,
    },
  });

  // 3. Emitir evento
  const eventPayload: BookingConfirmedEvent = {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    bookingId,
    leadId: cita.leadId,
    googleEventId: googleCalendarEventId,
  };
  eventBus.emitEvent(EVENTS.BOOKING_CONFIRMED, eventPayload);

  return citaConfirmada;
}

/**
 * Cancelar una cita
 */
export async function cancelBooking(input: CancelBookingInput) {
  const { bookingId, tenantId, motivo, userId, source = 'app' } = input;

  // 1. Validación
  if (!bookingId) throw new Error('bookingId es requerido');
  if (!tenantId) throw new Error('tenantId es requerido');

  // Verificar que la cita existe
  const cita = await prisma.cita.findFirst({
    where: { id: bookingId, tenantId },
  });
  if (!cita) {
    throw new Error('Cita no encontrada');
  }

  // 2. Actualizar cita
  const citaCancelada = await prisma.cita.update({
    where: { id: bookingId },
    data: {
      estado: 'cancelada',
      descripcion: motivo ? `${cita.descripcion || ''}\n\nCancelada: ${motivo}`.trim() : cita.descripcion,
    },
  });

  // 3. Emitir evento
  eventBus.emit(EVENTS.BOOKING_CANCELLED, {
    tenantId,
    userId,
    timestamp: new Date(),
    source,
    bookingId,
    leadId: cita.leadId,
  });

  return citaCancelada;
}

/**
 * Obtener citas de un lead
 */
export async function getBookingsByLead(leadId: string, tenantId: string) {
  const citas = await prisma.cita.findMany({
    where: { leadId, tenantId },
    orderBy: { fechaHora: 'desc' },
    include: {
      servicio: true,
    },
  });
  return citas;
}

/**
 * Obtener próximas citas
 * Usa la timezone configurada en el perfil del usuario
 * Incluye citas de Volkern y de Google Calendar
 */
export async function getUpcomingBookings(tenantId: string, limit = 10, userId?: string, dateStr?: string, timezoneParam?: string) {
  // Obtener timezone del usuario o parámetro
  let timezone = timezoneParam || 'America/Mexico_City';
  
  if (userId && !timezoneParam) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { timezone: true }
    });
    if (user?.timezone) {
      timezone = user.timezone;
    }
  }

  // Función para convertir UTC a timezone local
  const toLocalTime = (date: Date) => {
    return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  };

  // Calcular rango de fechas
  let dateFilter: any = { gte: new Date() };

  if (dateStr) {
    try {
      const startLocalStr = `${dateStr}T00:00:00`;
      const endLocalStr = `${dateStr}T23:59:59.999`;
      
      const startUTC = fromZonedTime(startLocalStr, timezone);
      const endUTC = fromZonedTime(endLocalStr, timezone);
      
      dateFilter = { gte: startUTC, lte: endUTC };
    } catch (e) {
      console.warn('Error parseando dateStr:', dateStr, e);
      dateFilter = { gte: new Date() }; // Fallback a hoy si es inválido
    }
  }

  // Obtener citas de Volkern
  const citasVolkern = await prisma.cita.findMany({
    where: {
      tenantId,
      fechaHora: dateFilter,
      estado: { in: ['pendiente', 'confirmada', 'Pendiente', 'Confirmada'] },
    },
    orderBy: { fechaHora: 'asc' },
    take: limit,
    include: {
      lead: { select: { nombre: true, email: true, telefono: true } },
      servicio: true,
    },
  });

  // Intentar obtener citas de Google Calendar
  let citasGoogleCalendar: any[] = [];
  if (userId) {
    try {
      const gcalIntegration = await prisma.googleCalendarIntegration.findFirst({
        where: { userId, activo: true }
      });
      
      if (gcalIntegration) {
        // Obtener eventos próximos de Google Calendar usando getAuthenticatedClient para auto-refresh
        const { getAuthenticatedClient } = await import('@/lib/google-calendar');
        const oauth2Client = await getAuthenticatedClient(userId);
        
        const { google } = await import('googleapis');
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        let timeMinStr = new Date().toISOString();
        let timeMaxStr = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 días
        
        if (dateStr && dateFilter.gte && dateFilter.lte) {
          timeMinStr = dateFilter.gte.toISOString();
          timeMaxStr = dateFilter.lte.toISOString();
        }

        const response = await calendar.events.list({
          calendarId: gcalIntegration.calendarId || 'primary',
          timeMin: timeMinStr,
          timeMax: timeMaxStr,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: limit,
        });
        
        if (response.data.items) {
          citasGoogleCalendar = response.data.items.map(event => ({
            id: `gcal_${event.id}`,
            titulo: event.summary || 'Evento de Google Calendar',
            descripcion: event.description || null,
            fechaHora: event.start?.dateTime || event.start?.date,
            duracion: 60,
            tipo: 'reunion',
            estado: 'confirmada',
            linkReunion: event.hangoutLink || null,
            ubicacion: event.location || null,
            lead: null,
            servicio: null,
            fuente: 'google_calendar',
            googleEventId: event.id,
            timezone,
            fechaHoraLocal: toLocalTime(new Date(event.start?.dateTime || event.start?.date || now)),
          }));
        }
      }
    } catch (error) {
      console.error('[getUpcomingBookings] Error obteniendo eventos de Google Calendar:', error);
    }
  }

  // Combinar y ordenar por fecha
  const todasLasCitasRaw = [
    ...citasVolkern.map(c => ({ ...c, fuente: 'volkern', fechaHoraLocal: toLocalTime(c.fechaHora) })),
    ...citasGoogleCalendar
  ];

  // Deduplicar usando el ID de Google Calendar si existe en ambos
  const mapCitas = new Map();
  todasLasCitasRaw.forEach(cita => {
    const googleId = cita.googleCalendarEventId || cita.googleEventId;
    if (googleId) {
      if (!mapCitas.has(googleId)) {
        mapCitas.set(googleId, cita);
      }
    } else {
      mapCitas.set(cita.id, cita);
    }
  });

  const todasLasCitas = Array.from(mapCitas.values());

  // Ordenar por fecha local
  todasLasCitas.sort((a, b) => new Date(a.fechaHoraLocal).getTime() - new Date(b.fechaHoraLocal).getTime());

  return {
    citas: todasLasCitas.slice(0, limit),
    timezone,
    totalVolkern: citasVolkern.length,
    totalGoogleCalendar: citasGoogleCalendar.length
  };
}

/**
 * Agendamiento Zero-Touch
 * Orquesta: Verificación de disponibilidad + Creación de Cita + Notificación Email
 */
export async function autoScheduleAppointment(input: AutoScheduleInput) {
  const { tenantId, leadId, preferredDate, preferredTime, titulo, userId, source = 'app' } = input;

  // 1. Obtener datos del lead
  const lead = await prisma.lead.findFirst({ 
    where: { id: leadId, tenantId } 
  });
  
  if (!lead) throw new Error('Lead no encontrado o no pertenece al tenant');

  // 2. Verificar disponibilidad
  const availability = await checkAvailability({
    tenantId,
    fecha: preferredDate,
    duracion: 30, // Default 30 min
    avisoMinimo: 60 // 1 hora de margen
  });

  if (!availability.disponible || availability.slots.length === 0) {
    return { 
      success: false, 
      error: 'No hay disponibilidad para esa fecha.',
      recomendacion: 'Solicita otra fecha al cliente o revisa los horarios del tenant.'
    };
  }

  // 3. Seleccionar Slot (si hay preferredTime, buscarlo, si no el primero)
  let selectedSlot = availability.slots[0];
  if (preferredTime) {
    // Buscar el slot que más se acerque a HH:mm
    const target = `${preferredDate}T${preferredTime}`.substring(0, 16);
    const match = availability.slots.find(s => s.includes(target));
    if (match) selectedSlot = match;
  }

  // 4. Crear cita usando el skill existente
  const bookingResult = await createBooking({
    tenantId,
    leadId,
    nombre: lead.nombre,
    email: lead.email,
    telefono: lead.telefono || undefined,
    titulo,
    fechaHora: new Date(selectedSlot),
    userId,
    source
  });

  // 5. Enviar email vía Resend (Notificación Zero-Touch)
  if (lead.email) {
    try {
      await sendEmail({
        to: lead.email,
        subject: `📅 Cita confirmada: ${titulo}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Hola ${lead.nombre},</h2>
            <p>Tu cita ha sido agendada con éxito por nuestro asistente de IA.</p>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <strong>Evento:</strong> ${titulo}<br>
              <strong>Fecha y Hora:</strong> ${new Date(selectedSlot).toLocaleString('es-ES')}<br>
            </div>
            <p>Si necesitas realizar algún cambio, por favor responde a este correo.</p>
            <p>Saludos,<br>El equipo de Volkern</p>
          </div>
        `
      });
    } catch (emailError) {
      console.warn('[AutoSchedule] Error enviando email confirmation:', emailError);
    }
  }

  return {
    success: true,
    bookingId: bookingResult.cita.id,
    fechaAgendada: selectedSlot,
    summary: `Agenda completada para el ${new Date(selectedSlot).toLocaleString()} y correo de confirmación enviado.`
  };
}
