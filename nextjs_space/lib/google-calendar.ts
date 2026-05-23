import { google } from 'googleapis';
import { prisma } from '@/lib/db';

/**
 * Google Calendar Integration Library
 * Handles OAuth 2.0 authentication and event synchronization
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL + '/api/integraciones/google-calendar/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
];

/**
 * Crea un cliente OAuth2 de Google
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Genera la URL de autenticación de Google
 */
export function getAuthUrl(userId: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId, // Pasamos el userId en el state para recuperarlo en el callback
  });
}

/**
 * Intercambia el código de autorización por tokens
 */
export async function getTokensFromCode(code: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Obtiene un cliente OAuth2 autenticado para un usuario
 */
export async function getAuthenticatedClient(userId: string) {
  const integration = await prisma.googleCalendarIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    throw new Error('Google Calendar no está conectado');
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
    expiry_date: integration.expiresAt.getTime(),
  });

  // Si el token está expirado, renovarlo automáticamente
  if (integration.expiresAt < new Date()) {
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Actualizar tokens en la base de datos
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token || integration.refreshToken,
        expiresAt: new Date(credentials.expiry_date!),
      },
    });

    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}

/**
 * Crea un evento en Google Calendar
 * @param generarMeet - Si es true, genera automáticamente un enlace de Google Meet
 * @returns El evento creado, incluyendo hangoutLink si se generó Meet
 */
export async function createCalendarEvent(
  userId: string,
  citaData: {
    id: string;
    titulo: string;
    descripcion?: string;
    fechaHora: Date;
    duracion: number; // en minutos
    leadNombre?: string;
    leadEmail?: string;
    generarMeet?: boolean; // Si es true, genera Google Meet automáticamente
  }
) {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Google Calendar no está conectado');
    }

    const startTime = new Date(citaData.fechaHora);
    const endTime = new Date(startTime.getTime() + citaData.duracion * 60000);

    const event: any = {
      summary: citaData.titulo,
      description: citaData.descripcion || `Cita agendada desde Volkern CRM\n\nID: ${citaData.id}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      attendees: citaData.leadEmail ? [{ email: citaData.leadEmail }] : [],
      extendedProperties: {
        private: {
          volkernCitaId: citaData.id,
          volkernUserId: userId,
        },
      },
    };

    // Si se solicita Google Meet, agregar configuración de conferencia
    if (citaData.generarMeet) {
      event.conferenceData = {
        createRequest: {
          requestId: `volkern-${citaData.id}-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      };
    }

    const response = await calendar.events.insert({
      calendarId: integration.calendarId,
      requestBody: event,
      sendUpdates: 'all', // Enviar notificaciones a los asistentes
      conferenceDataVersion: citaData.generarMeet ? 1 : 0,
    });

    // Guardar el ID del evento de Google en la cita para evitar duplicados
    if (response.data.id) {
      await prisma.cita.update({
        where: { id: citaData.id },
        data: { googleCalendarEventId: response.data.id },
      }).catch(err => console.error('⚠️ No se pudo guardar googleCalendarEventId:', err.message));
    }

    // Actualizar estadísticas
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        totalCitasSincronizadas: { increment: 1 },
        ultimaSync: new Date(),
        errorUltimaSync: null,
      },
    });

    console.log('✅ Evento creado en Google Calendar:', response.data.id);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error al crear evento en Google Calendar:', error.message);

    // Guardar el error en la integración
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        errorUltimaSync: error.message,
      },
    }).catch(() => { });

    throw error;
  }
}

/**
 * Actualiza un evento en Google Calendar
 * @param googleCalendarEventId - ID del evento en Google Calendar (si se conoce)
 */
export async function updateCalendarEvent(
  userId: string,
  citaId: string,
  citaData: {
    titulo: string;
    descripcion?: string;
    fechaHora: Date;
    duracion: number;
    leadEmail?: string;
    googleCalendarEventId?: string | null;
  }
) {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Google Calendar no está conectado');
    }

    let eventId = citaData.googleCalendarEventId;

    // Si no tenemos el eventId, buscar por propiedades extendidas (fallback)
    if (!eventId) {
      const eventsResponse = await calendar.events.list({
        calendarId: integration.calendarId,
        privateExtendedProperty: [`volkernCitaId=${citaId}`],
        maxResults: 1,
      }) as any;

      const events = eventsResponse.data;

      if (!events.items || events.items.length === 0) {
        console.log('⚠️ Evento no encontrado en Google Calendar, creando uno nuevo...');
        return createCalendarEvent(userId, { ...citaData, id: citaId });
      }

      eventId = events.items[0].id!;

      // Guardar el eventId para futuras actualizaciones
      await prisma.cita.update({
        where: { id: citaId },
        data: { googleCalendarEventId: eventId },
      }).catch(() => { });
    }

    const startTime = new Date(citaData.fechaHora);
    const endTime = new Date(startTime.getTime() + citaData.duracion * 60000);

    const updatedEvent = {
      summary: citaData.titulo,
      description: citaData.descripcion || `Cita agendada desde Volkern CRM\n\nID: ${citaId}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      attendees: citaData.leadEmail ? [{ email: citaData.leadEmail }] : [],
    };

    const response = await calendar.events.update({
      calendarId: integration.calendarId,
      eventId: eventId!,
      requestBody: updatedEvent,
      sendUpdates: 'all',
    });

    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        ultimaSync: new Date(),
        errorUltimaSync: null,
      },
    });

    console.log('✅ Evento actualizado en Google Calendar:', response.data.id);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error al actualizar evento en Google Calendar:', error.message);

    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        errorUltimaSync: error.message,
      },
    }).catch(() => { });

    throw error;
  }
}

/**
 * Elimina un evento de Google Calendar
 * @param googleCalendarEventId - ID del evento en Google Calendar (si se conoce)
 */
export async function deleteCalendarEvent(userId: string, citaId: string, googleCalendarEventId?: string | null) {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Google Calendar no está conectado');
    }

    let eventId = googleCalendarEventId;

    // Si no tenemos el eventId, buscar por propiedades extendidas (fallback)
    if (!eventId) {
      const eventsResponse = await calendar.events.list({
        calendarId: integration.calendarId,
        privateExtendedProperty: [`volkernCitaId=${citaId}`],
        maxResults: 1,
      }) as any;

      const events = eventsResponse.data;

      if (!events.items || events.items.length === 0) {
        console.log('⚠️ Evento no encontrado en Google Calendar');
        return;
      }

      eventId = events.items[0].id!;
    }

    await calendar.events.delete({
      calendarId: integration.calendarId,
      eventId: eventId!,
      sendUpdates: 'all',
    });

    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        ultimaSync: new Date(),
        errorUltimaSync: null,
      },
    });

    console.log('✅ Evento eliminado de Google Calendar:', eventId);
  } catch (error: any) {
    console.error('❌ Error al eliminar evento de Google Calendar:', error.message);

    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        errorUltimaSync: error.message,
      },
    }).catch(() => { });

    throw error;
  }
}

/**
 * Sincroniza todas las citas futuras con Google Calendar
 * MODELO UNIDIRECCIONAL: Volkern → Google Calendar
 * - Solo sincroniza citas creadas en Volkern (origenCita = 'volkern' o null)
 * - No crea duplicados: verifica googleCalendarEventId antes de crear
 * - Actualiza eventos existentes si ya tienen un ID de Google
 */
export async function syncAllFutureCitas(userId: string) {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Google Calendar no está conectado');
    }

    // Obtener información del usuario para filtrar citas
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true }
    });

    if (!user || !user.tenantId) {
      throw new Error('Usuario o tenant no encontrado');
    }

    const tenantId = user.tenantId;

    // Obtener citas futuras donde el usuario está asignado
    const citasConLead = await prisma.cita.findMany({
      where: {
        tenantId,
        // Filtro crítico: Solo citas del usuario actual
        usuarioAsignadoId: userId,
        fechaHora: {
          gte: new Date(),
        },
        // Solo sincronizar citas originadas en Volkern (no google_calendar)
        origenCita: {
          not: 'google_calendar',
        },
        estado: {
          notIn: ['cancelada', 'Cancelada', 'CANCELADA'],
        },
      },
      include: {
        lead: true,
      },
    });

    let createdCount = 0;
    let updatedCount = 0;
    const skippedCount = 0;
    let errorCount = 0;

    console.log(`📊 Procesando ${citasConLead.length} citas de Volkern para sincronizar...`);

    for (const cita of citasConLead) {
      try {
        let eventId = cita.googleCalendarEventId;

        // Si ya tiene googleCalendarEventId, el evento existe - solo actualizar
        if (eventId) {
          console.log(`🔄 Actualizando evento existente para cita ${cita.id} (eventId: ${eventId})`);
          await updateCalendarEvent(userId, cita.id, {
            titulo: cita.titulo || 'Cita',
            descripcion: cita.descripcion || undefined,
            fechaHora: cita.fechaHora,
            duracion: cita.duracion || 60,
            leadEmail: cita.lead?.email || undefined,
            googleCalendarEventId: eventId,
          });
          updatedCount++;
          continue;
        }

        // No tiene googleCalendarEventId - buscar en Google por propiedades extendidas
        console.log(`🔍 Buscando evento existente para cita ${cita.id}...`);
        const existingEvents = await calendar.events.list({
          calendarId: integration.calendarId,
          privateExtendedProperty: [`volkernCitaId=${cita.id}`],
          maxResults: 1,
        });

        if (existingEvents.data.items && existingEvents.data.items.length > 0) {
          eventId = existingEvents.data.items[0].id!;
          console.log(`✅ Encontrado evento existente: ${eventId}`);

          // Guardar el ID en la base de datos para futuras sincronizaciones
          await prisma.cita.update({
            where: { id: cita.id },
            data: { googleCalendarEventId: eventId },
          });

          // Actualizar el evento existente
          await updateCalendarEvent(userId, cita.id, {
            titulo: cita.titulo || 'Cita',
            descripcion: cita.descripcion || undefined,
            fechaHora: cita.fechaHora,
            duracion: cita.duracion || 60,
            leadEmail: cita.lead?.email || undefined,
            googleCalendarEventId: eventId,
          });
          updatedCount++;
        } else {
          // No existe en Google Calendar - crear uno nuevo
          console.log(`➕ Creando nuevo evento para cita ${cita.id}`);
          await createCalendarEvent(userId, {
            id: cita.id,
            titulo: cita.titulo || 'Cita',
            descripcion: cita.descripcion || undefined,
            fechaHora: cita.fechaHora,
            duracion: cita.duracion || 60,
            leadNombre: cita.lead?.nombre || undefined,
            leadEmail: cita.lead?.email || undefined,
          });
          createdCount++;
        }
      } catch (error: any) {
        console.error(`Error sincronizando cita ${cita.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`✅ Sincronización completada: ${createdCount} creados, ${updatedCount} actualizados, ${skippedCount} omitidos, ${errorCount} errores`);

    return {
      total: citasConLead.length,
      creados: createdCount,
      actualizados: updatedCount,
      omitidos: skippedCount,
      errores: errorCount,
    };
  } catch (error: any) {
    console.error('❌ Error al sincronizar citas:', error.message);
    throw error;
  }
}

/**
 * ===============================
 * FUNCIONES DE WEBHOOK (SINCRONIZACIÓN BIDIRECCIONAL)
 * ===============================
 */

/**
 * Registra un canal de notificaciones webhook con Google Calendar
 */
export async function setupWebhookChannel(userId: string): Promise<void> {
  try {
    console.log('📡 Configurando canal webhook para Google Calendar...');

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Integración de Google Calendar no encontrada');
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Generar un ID único para el canal
    const channelId = `volkern-${userId}-${Date.now()}`;
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-calendar`;

    console.log(`📍 URL del webhook: ${webhookUrl}`);
    console.log(`🆔 Channel ID: ${channelId}`);

    // Registrar el canal con Google
    const response = await calendar.events.watch({
      calendarId: integration.calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        // Los canales expiran automáticamente después de 1 semana (máximo permitido)
        // Configuramos 6 días para renovar antes de la expiración
        expiration: (Date.now() + 6 * 24 * 60 * 60 * 1000).toString(),
      },
    });

    const resourceId = response.data.resourceId;
    const expiration = response.data.expiration
      ? new Date(parseInt(response.data.expiration))
      : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

    // Guardar información del canal en la base de datos
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        channelId,
        resourceId,
        channelExpiration: expiration,
      },
    });

    console.log('✅ Canal webhook configurado exitosamente');
    console.log(`📅 Expira: ${expiration.toISOString()}`);
  } catch (error: any) {
    console.error('❌ Error al configurar canal webhook:', error.message);
    throw error;
  }
}

/**
 * Detiene un canal de notificaciones webhook
 */
export async function stopWebhookChannel(userId: string): Promise<void> {
  try {
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration || !integration.channelId || !integration.resourceId) {
      console.log('⚠️ No hay canal webhook activo para detener');
      return;
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Detener el canal
    await calendar.channels.stop({
      requestBody: {
        id: integration.channelId,
        resourceId: integration.resourceId,
      },
    });

    // Limpiar información del canal en la base de datos
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        channelId: null,
        resourceId: null,
        channelExpiration: null,
      },
    });

    console.log('✅ Canal webhook detenido exitosamente');
  } catch (error: any) {
    console.error('⚠️ Error al detener canal webhook:', error.message);
    // No lanzamos error porque el canal puede haber expirado naturalmente
  }
}

/**
 * Renueva un canal de notificaciones antes de que expire
 */
export async function renewWebhookChannel(userId: string): Promise<void> {
  try {
    console.log('🔄 Renovando canal webhook...');

    // Detener el canal actual
    await stopWebhookChannel(userId);

    // Crear un nuevo canal
    await setupWebhookChannel(userId);

    console.log('✅ Canal webhook renovado exitosamente');
  } catch (error: any) {
    console.error('❌ Error al renovar canal webhook:', error.message);
    throw error;
  }
}

/**
 * Sincroniza eventos desde Google Calendar hacia Volkern
 */
export async function syncFromGoogleToVolkern(userId: string, forceFullSync: boolean = false): Promise<void> {
  try {
    console.log('📥 Sincronizando eventos desde Google Calendar...');
    if (forceFullSync) {
      console.log('🔄 Sincronización completa forzada (ignorando syncToken)');
    }

    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw new Error('Integración de Google Calendar no encontrada');
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Obtener eventos
    const now = new Date();

    // Si es sincronización completa, obtenemos todos los eventos futuros
    // Si es incremental, usamos timeMin con buffer
    const timeMin = forceFullSync
      ? now.toISOString() // Solo eventos futuros
      : integration.ultimaSync
        ? new Date(integration.ultimaSync.getTime() - 5 * 60 * 1000).toISOString() // 5 minutos antes para buffer
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Últimos 7 días si es primera sync

    const requestOptions: any = {
      calendarId: integration.calendarId,
      timeMin: timeMin,
      singleEvents: true,
      orderBy: 'updated',
      maxResults: 250, // Máximo permitido por Google
    };

    // Si NO es sincronización completa Y tenemos syncToken, usarlo
    if (!forceFullSync && integration.syncToken) {
      requestOptions.syncToken = integration.syncToken;
      delete requestOptions.timeMin; // syncToken y timeMin son mutuamente exclusivos
      delete requestOptions.orderBy; // orderBy no se puede usar con syncToken
    }

    console.log('📡 Consultando Google Calendar API...');
    console.log(`  Calendar ID: ${integration.calendarId}`);
    console.log(`  TimeMin: ${forceFullSync ? 'Now (full sync)' : timeMin}`);
    console.log(`  SyncToken: ${requestOptions.syncToken ? 'Yes' : 'No'}`);

    const response = await calendar.events.list(requestOptions);

    const events = response.data.items || [];
    console.log(`📊 Eventos recibidos de Google: ${events.length}`);

    let syncedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;

    for (const event of events) {
      try {
        // Verificar si el evento tiene la propiedad extendida de Volkern
        const volkernCitaId = event.extendedProperties?.private?.volkernCitaId;

        if (volkernCitaId) {
          // Este evento fue creado originalmente por Volkern
          // Verificar si fue actualizado o eliminado en Google
          const existingCita = await prisma.cita.findUnique({
            where: { id: volkernCitaId },
            include: { lead: true },
          });

          if (existingCita) {
            if (event.status === 'cancelled') {
              // Evento cancelado en Google → Cancelar en Volkern
              // Solo actualizar si no está ya cancelada
              if (existingCita.estado !== 'Cancelada') {
                // Limpiar descripción de tags repetidos antes de agregar nuevo
                const descLimpia = (existingCita.descripcion || '').replace(/\n?\[(?:Actualizada|Cancelada) desde Google Calendar\]/g, '');
                await prisma.cita.update({
                  where: { id: volkernCitaId },
                  data: {
                    estado: 'Cancelada',
                    descripcion: descLimpia + '\n[Cancelada desde Google Calendar]',
                  },
                });
                deletedCount++;
                console.log(`🗑️ Cita ${volkernCitaId} cancelada desde Google`);
              }
            } else if (event.start?.dateTime && event.end?.dateTime) {
              // Evento actualizado en Google → Actualizar en Volkern
              const startDate = new Date(event.start.dateTime);
              const endDate = new Date(event.end.dateTime);
              const duracion = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

              // Solo actualizar si hay cambios reales
              const fechaIgual = existingCita.fechaHora.getTime() === startDate.getTime();
              const duracionIgual = existingCita.duracion === duracion;
              const tituloIgual = existingCita.titulo === (event.summary || existingCita.titulo);

              if (!fechaIgual || !duracionIgual || !tituloIgual) {
                // Limpiar descripción de tags repetidos
                const descLimpia = (event.description || existingCita.descripcion || '').replace(/\n?\[(?:Actualizada|Cancelada) desde Google Calendar\]/g, '');
                await prisma.cita.update({
                  where: { id: volkernCitaId },
                  data: {
                    fechaHora: startDate,
                    duracion,
                    titulo: event.summary || existingCita.titulo,
                    descripcion: descLimpia + '\n[Actualizada desde Google Calendar]',
                  },
                });
                updatedCount++;
                console.log(`✏️ Cita ${volkernCitaId} actualizada desde Google`);
              }
            }
          }
        } else {
          // Este evento fue creado directamente en Google Calendar
          // VERIFICACIÓN ADICIONAL: Antes de crear, verificar que no exista ya una cita
          // con el mismo googleCalendarEventId (podría estar sin la propiedad extendida)

          const citaExistentePorEventId = await prisma.cita.findFirst({
            where: {
              googleCalendarEventId: event.id,
            },
          });

          if (citaExistentePorEventId) {
            console.log(`⏭️ Evento ${event.id} ya tiene cita asociada (${citaExistentePorEventId.id}), omitiendo`);
            skippedCount++;
            continue;
          }

          // Crear una nueva cita en Volkern solo si no está cancelado
          if (event.status !== 'cancelled' && event.start?.dateTime) {
            const startDate = new Date(event.start.dateTime);
            const endDate = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(startDate.getTime() + 60 * 60 * 1000);
            const duracion = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

            // Buscar o crear un lead para esta cita
            let leadId: string | undefined = undefined;
            const tenantId = integration.tenantId;

            if (event.attendees && event.attendees.length > 0 && event.attendees[0].email) {
              const attendeeEmail = event.attendees[0].email;
              const attendeeName = event.attendees[0].displayName || event.attendees[0].email;

              // Buscar lead existente
              let existingLead = await prisma.lead.findFirst({
                where: {
                  tenantId,
                  email: attendeeEmail,
                },
              });

              // Crear lead si no existe
              if (!existingLead) {
                console.log(`➕ Creando lead temporal para ${attendeeEmail}`);
                existingLead = await prisma.lead.create({
                  data: {
                    tenantId,
                    nombre: attendeeName,
                    email: attendeeEmail,
                    fuente: 'Google Calendar',
                    estado: 'Nuevo',
                  },
                });
              }

              leadId = existingLead.id;
            }

            const newCita = await prisma.cita.create({
              data: {
                tenantId,
                usuarioAsignadoId: userId,
                ...(leadId && { leadId }),
                fechaHora: startDate,
                duracion,
                titulo: event.summary || 'Cita desde Google Calendar',
                descripcion: (event.description || '') + '\n[Creada desde Google Calendar]',
                tipo: 'Virtual',
                estado: 'Pendiente',
                googleCalendarEventId: event.id!, // CRÍTICO: Guardar el ID inmediatamente
                origenCita: 'google_calendar', // Marcar origen para evitar re-sincronización
                emailConfirmacionEnviado: false, // No enviar email automático para citas de GCal
              },
            });

            // Agregar la propiedad extendida al evento en Google para futuras sincronizaciones
            await calendar.events.patch({
              calendarId: integration.calendarId,
              eventId: event.id!,
              requestBody: {
                extendedProperties: {
                  private: {
                    volkernCitaId: newCita.id,
                    volkernUserId: userId,
                  },
                },
              },
            });

            createdCount++;
            console.log(`➕ Nueva cita ${newCita.id} creada desde Google (eventId: ${event.id})`);
          }
        }

        syncedCount++;
      } catch (error: any) {
        console.error(`Error procesando evento ${event.id}:`, error.message);
      }
    }

    // Actualizar metadata de sincronización
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: {
        ultimaSync: now,
        syncToken: response.data.nextSyncToken || integration.syncToken,
      },
    });

    console.log('✅ Sincronización desde Google completada');
    console.log(`📊 Estadísticas: ${createdCount} creadas, ${updatedCount} actualizadas, ${deletedCount} canceladas`);
  } catch (error: any) {
    console.error('❌ Error al sincronizar desde Google:', error.message);

    // Si el error es por syncToken inválido, reiniciar sincronización completa
    if (error.message.includes('Sync token')) {
      await prisma.googleCalendarIntegration.update({
        where: { userId },
        data: { syncToken: null },
      });
      console.log('🔄 Reiniciando sincronización completa...');
    }

    throw error;
  }
}
