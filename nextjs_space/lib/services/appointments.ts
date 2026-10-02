import { prisma } from '@/lib/db';
import { sendAppointmentConfirmation, generateCitaEmailHash } from '@/lib/email';
import { triggerAutomation } from '@/lib/automation-engine';
import { ScoringEngine } from '@/lib/scoring-engine';
import { createSystemContext } from '@/lib/skills/context';
import { createCalendarEvent } from '@/lib/google-calendar';
import { notifyAdminsPush } from '@/lib/services/push-notification';

/** Error de dominio con estado HTTP asociado (404/400/409). */
export class CitaError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface CreateCitaParams {
  tenantId: string;
  /** Usuario autenticado que agenda (sesión o API key): propietario de la sincronización de calendario y del audit log. */
  actor: { id: string; name?: string | null; email?: string | null };
  tenantNombre: string;
  /** Datos ya validados (Zod en la ruta) o crudos desde el skill MCP. */
  data: Record<string, any> & { fechaHora: string };
}

/**
 * Crear una cita con TODOS los efectos de POST /api/citas: validación de
 * entidades, conflicto de horario, audit log, Google Calendar, email de
 * confirmación, automatizaciones, push, Telegram y scoring.
 * Única fuente de verdad para la ruta REST y el skill MCP create_cita.
 */
export async function createCitaConEfectos({ tenantId, actor, tenantNombre, data }: CreateCitaParams) {
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
    linkReunionPegado,
    tipoLinkReunion = 'ninguno',
    fechaHora,
    duracion: duracionRaw = 60,
    estado = 'pendiente',
    connectedCalendarId,
  } = data;

  const duracion = duracionRaw; // ya validado por Zod en la ruta

  // Obtener lead si se proporciona
  let lead = null;
  if (leadId) {
    lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) {
      throw new CitaError('Lead no encontrado', 404);
    }
  }

  // Obtener contact si se proporciona
  let contact = null;
  if (contactId) {
    contact = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });
    if (!contact) {
      throw new CitaError('Contacto no encontrado', 404);
    }
  }

  let servicio = null;
  if (servicioId) {
    servicio = await prisma.servicio.findUnique({ where: { id: servicioId } });
    if (!servicio) {
      throw new CitaError('Servicio no encontrado', 404);
    }
  }

  let catalogoItem = null;
  if (catalogoItemId) {
    catalogoItem = await prisma.catalogoItem.findUnique({
      where: { id: catalogoItemId },
      include: { tasaImpuesto: true },
    });
    if (!catalogoItem) {
      throw new CitaError('Item de catálogo no encontrado', 404);
    }
  }

  // Determinar link de reunión según tipoLinkReunion
  let linkFinal = linkReunion || linkReunionPegado || null;
  if (tipoLinkReunion === 'pegar' && linkReunionPegado) {
    linkFinal = linkReunionPegado;
  }

  const tituloFinal = titulo || catalogoItem?.nombre || servicio?.nombre || 'Evento';
  const descripcionFinal = descripcion || catalogoItem?.descripcion || servicio?.descripcion;
  const duracionFinal = duracion || catalogoItem?.duracionMinutos || servicio?.duracionMinutos || 60;

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
    tenantId,
  };

  if (servicioId) citaData.servicioId = servicioId;
  if (catalogoItemId) citaData.catalogoItemId = catalogoItemId;
  if (connectedCalendarId) citaData.connectedCalendarId = connectedCalendarId;

  // VALIDACIÓN DE CONFLICTOS (con buffer si se proporciona)
  const bufferMinutos = data.bufferMinutos || 0;
  const fechaHoraDate = new Date(fechaHora);
  const duracionConBuffer = (duracion || 60) + bufferMinutos;
  const fechaHoraFin = new Date(fechaHoraDate.getTime() + duracionConBuffer * 60000);

  // Validar aviso mínimo (no permitir citas antes de X minutos desde ahora)
  const avisoMinimoMin = data.avisoMinimo || 0;
  if (avisoMinimoMin > 0) {
    const minBookingTime = new Date(Date.now() + avisoMinimoMin * 60000);
    if (fechaHoraDate < minBookingTime) {
      throw new CitaError(`La cita debe agendarse con al menos ${avisoMinimoMin} minutos de anticipación`, 400);
    }
  }

  // No permitir citas en el pasado (margen de 5 minutos para diferencias de zona horaria del cliente)
  const ahora = new Date(Date.now() - 5 * 60 * 1000);
  if (fechaHoraDate < ahora) {
    throw new CitaError('No se pueden agendar citas en el pasado', 400);
  }

  const citasConflictivas = await prisma.cita.findMany({
    where: {
      tenantId,
      estado: { not: 'cancelada' },
      OR: [
        {
          AND: [
            { fechaHora: { lte: fechaHoraDate } },
            { fechaHora: { gte: new Date(fechaHoraDate.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        },
        {
          AND: [
            { fechaHora: { lt: fechaHoraFin } },
            { fechaHora: { gte: fechaHoraDate } },
          ],
        },
      ],
    },
  });

  const hayConflicto = citasConflictivas.some(citaExistente => {
    const citaInicio = new Date(citaExistente.fechaHora);
    const citaFin = new Date(citaInicio.getTime() + (citaExistente.duracion + bufferMinutos) * 60000);
    return (
      (fechaHoraDate >= citaInicio && fechaHoraDate < citaFin) ||
      (fechaHoraFin > citaInicio && fechaHoraFin <= citaFin) ||
      (fechaHoraDate <= citaInicio && fechaHoraFin >= citaFin)
    );
  });

  if (hayConflicto) {
    throw new CitaError('Conflicto de horario', 409);
  }

  // Crear la cita en la DB física del tenant
  const cita = await prisma.cita.create({
    data: citaData,
    include: {
      lead: true,
      servicio: true,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: actor.id,
      accion: 'CREATE',
      entidad: 'Cita',
      entidadId: cita.id,
      descripcion: `Cita creada por ${actor.name || actor.email || 'agente'}`,
      cambiosDespues: JSON.stringify({ titulo: cita.titulo, fechaHora: cita.fechaHora }),
    } as any,
  });

  // GOOGLE CALENDAR SYNC - Siempre sincronizar si hay integración activa
  let linkReunionGenerado: string | null = null;
  try {
    const googleIntegration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId: actor.id },
    });

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

      const generarMeet = tipoLinkReunion === 'generar';
      const calendarEvent = await createCalendarEvent(actor.id, {
        id: cita.id,
        titulo: cita.titulo || 'Cita sin título',
        descripcion: cita.descripcion || undefined,
        fechaHora: cita.fechaHora,
        duracion: cita.duracion,
        leadNombre: lead?.nombre || 'Evento sin cliente',
        leadEmail: lead?.email || undefined,
        generarMeet,
        targetCalendarId,
      });

      if (calendarEvent?.hangoutLink) {
        linkReunionGenerado = calendarEvent.hangoutLink;
        await prisma.cita.update({
          where: { id: cita.id },
          data: {
            linkReunion: calendarEvent.hangoutLink,
            ubicacion: 'Google Meet (Virtual)',
          },
        });
        cita.linkReunion = calendarEvent.hangoutLink;
        cita.ubicacion = 'Google Meet (Virtual)';
      }
    }
  } catch (gcalError) {
    console.error('Error sincronizando Google Calendar:', gcalError);
  }

  // EMAIL CONFIRMATION - Solo si hay lead y servicio
  if (servicio && lead?.email) {
    const emailHash = generateCitaEmailHash({
      fechaHora: new Date(fechaHora),
      duracion: duracion || servicio.duracionMinutos || 60,
      titulo: cita.titulo,
      servicioNombre: servicio.nombre,
    });

    const emailResult = await sendAppointmentConfirmation({
      id: cita.id,
      lead: { nombre: lead?.nombre || 'Cliente', email: lead?.email || '' },
      servicio: {
        nombre: servicio.nombre,
        descripcion: servicio.descripcion,
        precio: servicio.precio,
        moneda: servicio.moneda,
      },
      fechaHora: new Date(fechaHora),
      duracion: duracion || servicio.duracionMinutos || 60,
      tenantNombre,
      linkReunion: linkReunionGenerado,
      tenantId,
    });

    if (emailResult.success) {
      await prisma.cita.update({
        where: { id: cita.id },
        data: {
          emailConfirmacionEnviado: true,
          fechaEmailConfirmacion: new Date(),
          hashDatosEmail: emailHash,
        },
      });
    }
  }

  // AUTOMATIONS & NOTIFICATIONS
  (triggerAutomation as any)('cita_agendada', {
    tenantId,
    citaId: cita.id,
    leadId: cita.leadId,
    servicioId: (cita.servicioId || undefined) as any,
    cita,
  }).catch((e: any) => console.error('Error en AutomationEngine:', e));

  notifyAdminsPush({
    title: '📅 Nueva Cita Agendada',
    body: `${lead?.nombre || 'Evento sin cliente'} - ${cita.titulo}`,
    data: { url: `/dashboard/citas` },
  }, tenantId).catch((e: any) => console.error('Error en PushNotification:', e));

  // Notificación por Telegram al admin
  try {
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    (notifyByTelegram as any)(
      `📅 *Nueva Cita*\n\n👤 *Cliente:* ${lead?.nombre || 'Sin cliente'}\n📋 *Servicio:* ${cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}${lead?.telefono ? `\n📱 *Teléfono:* ${lead.telefono}` : ''}`,
      createSystemContext(tenantId),
    ).catch((e: any) => console.error('Error enviando notificación Telegram:', e));
  } catch (telegramImportError: any) {
    console.error('[createCitaConEfectos] Error importando notification-layer:', telegramImportError);
  }

  (ScoringEngine.calculateScore as any)({
    leadId: cita.leadId,
    evento: 'cita_agendada',
    categoria: 'comportamiento',
    detalles: {
      citaId: cita.id,
      tipo: cita.tipo as string,
      titulo: cita.titulo,
      servicioNombre: servicio?.nombre,
      fechaHora,
    },
  }).catch((e: any) => console.error('Error en ScoringEngine:', e));

  return { cita };
}

export interface RangoHorario {
  inicio: string; // "09:00"
  fin: string;    // "17:00"
}

export interface DiaHorario {
  activo: boolean;
  rangos: RangoHorario[];
}

export interface HorariosConfig {
  lunes: DiaHorario;
  martes: DiaHorario;
  miercoles: DiaHorario;
  jueves: DiaHorario;
  viernes: DiaHorario;
  sabado: DiaHorario;
  domingo: DiaHorario;
}

const diasMap: Record<number, keyof HorariosConfig> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado'
};

const defaultHorarios: HorariosConfig = {
  lunes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  martes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  miercoles: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  jueves: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  viernes: { activo: true, rangos: [{ inicio: '09:00', fin: '17:00' }] },
  sabado: { activo: false, rangos: [] },
  domingo: { activo: false, rangos: [] },
};

export async function checkAvailability(params: {
  tenantId: string;
  fecha: string; // YYYY-MM-DD
  duracion?: number;
  buffer?: number;
  avisoMinimo?: number;
}) {
  const { tenantId, fecha, duracion = 60, buffer = 0, avisoMinimo = 0 } = params;
  const fechaDate = new Date(fecha);

  // 1. Obtener configuración
  const configHorarios = await prisma.configuracion.findFirst({
    where: { tenantId, clave: 'horariosAtencion' }
  });

  let horariosConfig: HorariosConfig = defaultHorarios;
  if (configHorarios?.valor) {
    try {
      horariosConfig = JSON.parse(configHorarios.valor);
    } catch (e) {
      console.error('Error parseando horarios:', e);
    }
  }

  // 2. Verificar día activo
  const diaSemana = fechaDate.getDay();
  const nombreDia = diasMap[diaSemana];
  const horarioDia = horariosConfig[nombreDia];

  if (!horarioDia || !horarioDia.activo || !horarioDia.rangos || horarioDia.rangos.length === 0) {
    return { 
      disponible: false, 
      slots: [], 
      motivo: 'Día no laboral',
      dia: nombreDia,
      totalSlots: 0
    };
  }

  // 3. Obtener citas existentes
  const startOfDay = new Date(fecha);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(fecha);
  endOfDay.setHours(23, 59, 59, 999);

  const citas = await prisma.cita.findMany({
    where: {
      tenantId,
      fechaHora: { gte: startOfDay, lte: endOfDay },
      estado: { notIn: ['cancelada', 'Cancelada', 'CANCELADA'] as any }
    }
  });

  // 4. Generar slots
  const intervaloMinutos = 30;
  const disponibles: string[] = [];
  const ahora = new Date();

  for (const rango of horarioDia.rangos) {
    const [hInicio, mInicio] = rango.inicio.split(':').map(Number);
    const [hFin, mFin] = rango.fin.split(':').map(Number);
    const inicioMinutos = hInicio * 60 + mInicio;
    const finMinutos = hFin * 60 + mFin;

    for (let current = inicioMinutos; current < finMinutos; current += intervaloMinutos) {
      const slot = new Date(fecha);
      slot.setHours(Math.floor(current / 60), current % 60, 0, 0);

      if (avisoMinimo > 0 && slot < new Date(ahora.getTime() + avisoMinimo * 60000)) continue;
      if (slot <= ahora) continue;

      const slotFin = new Date(slot.getTime() + (duracion + buffer) * 60000);
      const isOccupied = citas.some((cita: any) => {
        const cInicio = new Date(cita.fechaHora);
        const cFin = new Date(cInicio.getTime() + (cita.duracion + buffer) * 60000);
        return (slot >= cInicio && slot < cFin) || (slotFin > cInicio && slotFin <= cFin);
      });

      if (!isOccupied) {
        disponibles.push(slot.toISOString());
      }
    }
  }

  return {
    disponible: disponibles.length > 0,
    slots: disponibles,
    dia: nombreDia,
    totalSlots: disponibles.length
  };
}
