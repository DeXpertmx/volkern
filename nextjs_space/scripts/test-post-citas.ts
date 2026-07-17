import { prisma } from '../lib/db'
import { sendAppointmentConfirmation, generateCitaEmailHash } from '../lib/email'
import { triggerAutomation } from '../lib/automation-engine'
import { ScoringEngine } from '../lib/scoring-engine';
import { createSystemContext } from '../lib/skills/context';
import { createCalendarEvent } from '../lib/google-calendar'
import { notifyAdminsPush } from '../lib/services/push-notification'
import { validateBody } from '../lib/validation';
import { CitaCreateSchema } from '../lib/validation/schemas';

async function run() {
  try {
    const user = await prisma.user.findFirst({
      include: { tenant: true }
    });

    if (!user) {
      console.log('No user found');
      return;
    }

    const tenantId = user.tenantId!;
    const auth = {
      tenant: user.tenant,
      user: user
    };

    // Let's create a lead
    let lead = await prisma.lead.findFirst({
      where: { tenantId }
    });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          nombre: 'Test Cita Lead',
          email: 'testlead@example.com',
          tenantId
        }
      });
    }

    // Let's get or create a service
    let servicio = await prisma.servicio.findFirst({
      where: { tenantId }
    });
    if (!servicio) {
      servicio = await prisma.servicio.create({
        data: {
          nombre: 'Test Service',
          duracionMinutos: 60,
          precio: 100,
          tenantId
        }
      });
    }

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    const body = {
      leadId: lead.id,
      tipo: 'reunion',
      titulo: 'Test Cita Title',
      descripcion: 'Test Description',
      fechaHora: futureDate.toISOString(),
      duracion: 60,
      estado: 'pendiente',
      servicioId: servicio.id
    };

    console.log('SIMULATING POST HANDLER STAGE 1: Validation');
    const data = validateBody(CitaCreateSchema, body);
    if (data instanceof Response) {
      console.log('Validation returned response:', data);
      return;
    }

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

    const duracion = duracionRaw;

    console.log('SIMULATING POST HANDLER STAGE 2: Lead/Contact Fetch');
    // Obtener lead si se proporciona
    let leadObj = null
    if (leadId) {
      leadObj = await prisma.lead.findFirst({ 
        where: { 
          id: leadId,
          tenantId: tenantId
        } 
      })
      if (!leadObj) {
        console.log('Lead no encontrado');
        return;
      }
    }

    let serviceObj = null
    if (servicioId) {
      serviceObj = await prisma.servicio.findUnique({ where: { id: servicioId } })
      if (!serviceObj) {
        console.log('Servicio no encontrado');
        return;
      }
    }

    const tituloFinal = titulo || serviceObj?.nombre || 'Evento'
    const descripcionFinal = descripcion || serviceObj?.descripcion
    const duracionFinal = duracion || serviceObj?.duracionMinutos || 60

    const citaData: any = {
      leadId,
      contactId,
      tipo,
      titulo: tituloFinal,
      descripcion: descripcionFinal,
      ubicacion,
      linkReunion: null,
      tipoLinkReunion,
      linkReunionPegado: null,
      fechaHora: new Date(fechaHora),
      duracion: duracionFinal,
      estado,
      tenantId: tenantId
    }
    if (servicioId) citaData.servicioId = servicioId

    console.log('SIMULATING POST HANDLER STAGE 3: DB Create');
    const cita = await prisma.cita.create({
      data: citaData,
      include: {
        lead: true,
        servicio: true
      }
    });
    console.log('Cita created in DB:', cita.id);

    console.log('SIMULATING POST HANDLER STAGE 4: Audit Log');
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId,
        userId: auth.user!.id,
        accion: 'CREATE',
        entidad: 'Cita',
        entidadId: cita.id,
        descripcion: `Cita creada por ${auth.user!.name || auth.user!.email}`,
        cambiosDespues: JSON.stringify({ titulo: cita.titulo, fechaHora: cita.fechaHora })
      } as any
    })
    console.log('Audit Log created');

    console.log('SIMULATING POST HANDLER STAGE 5: Google Calendar Sync');
    try {
      const googleIntegration = await prisma.googleCalendarIntegration.findUnique({
        where: { userId: auth.user!.id },
      })
      console.log('Google integration found:', googleIntegration ? 'yes' : 'no');
    } catch (gcalError) {
      console.error('Error synchronizing Google Calendar:', gcalError);
    }

    console.log('SIMULATING POST HANDLER STAGE 6: Email Confirmation');
    if (serviceObj && leadObj?.email) {
      const emailHash = generateCitaEmailHash({
        fechaHora: new Date(fechaHora),
        duracion: duracion || serviceObj.duracionMinutos || 60,
        titulo: cita.titulo,
        servicioNombre: serviceObj.nombre
      })

      const emailResult = await sendAppointmentConfirmation({
        id: cita.id,
        lead: { nombre: leadObj?.nombre || 'Cliente', email: leadObj?.email || '' },
        servicio: {
          nombre: serviceObj.nombre,
          descripcion: serviceObj.descripcion,
          precio: serviceObj.precio,
          moneda: serviceObj.moneda
        },
        fechaHora: new Date(fechaHora),
        duracion: duracion || serviceObj.duracionMinutos || 60,
        tenantNombre: auth.tenant!.nombre,
        linkReunion: null,
        tenantId: tenantId,
      })
      console.log('Email confirmation result:', emailResult);

      if (emailResult.success) {
        await prisma.cita.update({
          where: { id: cita.id },
          data: {
            emailConfirmacionEnviado: true,
            fechaEmailConfirmacion: new Date(),
            hashDatosEmail: emailHash
          }
        })
        console.log('Cita email status updated in DB');
      }
    }

    console.log('SIMULATING POST HANDLER STAGE 7: Automations and Notifications');
    const automationPromise = (triggerAutomation as any)('cita_agendada', {
      tenantId: tenantId,
      citaId: cita.id,
      leadId: cita.leadId,
      servicioId: (cita.servicioId || undefined) as any,
      cita: cita,
    }).catch((e: any) => {
      console.error('Error en AutomationEngine:', e);
      throw e;
    });

    const pushPromise = notifyAdminsPush({
      title: '📅 Nueva Cita Agendada',
      body: `${leadObj?.nombre || 'Evento sin cliente'} - ${cita.titulo}`,
      data: { url: `/dashboard/citas` }
    }, tenantId).catch((e: any) => {
      console.error('Error en PushNotification:', e);
      throw e;
    });

    const { notifyByTelegram } = await import('../lib/skills/notification-layer');
    const telegramPromise = (notifyByTelegram as any)(
      `📅 *Nueva Cita*\n\n👤 *Cliente:* ${leadObj?.nombre || 'Sin cliente'}\n📋 *Servicio:* ${cita.titulo}\n🕐 *Fecha:* ${new Date(cita.fechaHora).toLocaleString('es-MX')}${leadObj?.telefono ? `\n📱 *Teléfono:* ${leadObj.telefono}` : ''}`,
      createSystemContext(tenantId)
    ).catch((e: any) => {
      console.error('Error enviando notificación Telegram:', e);
      throw e;
    });

    const scoringPromise = (ScoringEngine.calculateScore as any)({
      leadId: cita.leadId,
      evento: 'cita_agendada',
      categoria: 'comportamiento',
      detalles: {
        citaId: cita.id,
        tipo: cita.tipo as string,
        titulo: cita.titulo,
        servicioNombre: serviceObj?.nombre,
        fechaHora: fechaHora,
      },
    }).catch((e: any) => {
      console.error('Error en ScoringEngine:', e);
      throw e;
    });

    console.log('Awaiting all notification promises...');
    await Promise.all([automationPromise, pushPromise, telegramPromise, scoringPromise]);
    console.log('All notification promises succeeded!');

  } catch (error: any) {
    console.error('POST HANDLER DIED WITH ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
