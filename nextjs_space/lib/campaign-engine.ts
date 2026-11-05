
import { prisma, getTenantDb, dbContext } from './db';
import { sendEmail } from './ses-email';
import { chatwootApi } from './nexus/chatwoot-api';
import { sendWhatsAppMessage } from './whatsapp';
import { sendSMS } from './sms';
import { sendTelegramMessage } from './telegram';

/**
 * Motor de Ejecución de Campañas Multicanal
 * Gestiona el envío, tracking y análisis de campañas
 * 
 * Nota: Todos los canales excepto email se envían a través de Chatwoot
 * como primario, con fallback a métodos directos
 */

export interface CampaignExecutionResult {
  success: boolean;
  executionId: string;
  error?: string;
}

export interface CampaignStats {
  totalDestinatarios: number;
  enviados: number;
  entregados: number;
  abiertos: number;
  clicks: number;
  conversiones: number;
  errores: number;
  tasaEntrega: number;
  tasaApertura: number;
  tasaClick: number;
  tasaConversion: number;
}

export interface ABTestVariant {
  variante: string;
  nombre: string;
  enviados: number;
  entregados: number;
  abiertos: number;
  clicks: number;
  conversiones: number;
  tasaApertura: number;
  tasaClick: number;
  tasaConversion: number;
}

export interface ABTestResults {
  campanaNombre: string;
  variantes: ABTestVariant[];
  mejorVariante: string;
  confianzaEstadistica: number;
  fechaInicio: Date;
  fechaFin?: Date;
}

/**
 * Obtiene los destinatarios basados en la segmentación de la campaña
 */
async function getTargetAudience(
  tenantId: string,
  targetType: string,
  targetConfig: any
): Promise<Array<{ tipo: string; id: string; nombre: string; email?: string; telefono?: string }>> {
  const { getTenantDb, dbContext } = await import('./db')
  const tenantClient = await getTenantDb(tenantId)

  const destinatarios: Array<any> = []

  return await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      switch (targetType) {
        case 'todos':
          const leads = await tenantClient.lead.findMany({
            select: {
              id: true,
              nombre: true,
              email: true,
              telefono: true,
              empresa: true,
              perfilFiscal: { select: { nif: true } }
            }
          })
          const estudiantes = await tenantClient.estudiante.findMany({
            select: { id: true, nombre: true, email: true, telefono: true }
          })

          destinatarios.push(
            ...leads.map((l: any) => ({
              tipo: 'lead',
              id: l.id,
              nombre: l.nombre,
              email: l.email,
              telefono: l.telefono || undefined,
              empresa: l.empresa || undefined,
              idFiscal: l.perfilFiscal?.nif || undefined
            })),
            ...estudiantes.map((e: any) => ({ tipo: 'estudiante', id: e.id, nombre: e.nombre, email: e.email, telefono: e.telefono || undefined }))
          )
          break

        case 'score_range':
          const { minScore, maxScore } = targetConfig
          const leadsWithScore = await tenantClient.lead.findMany({
            where: {
              score: {
                puntuacion: {
                  gte: minScore || 0,
                  lte: maxScore || 1000
                }
              }
            },
            select: {
              id: true,
              nombre: true,
              email: true,
              telefono: true,
              empresa: true,
              perfilFiscal: { select: { nif: true } }
            }
          })
          destinatarios.push(...leadsWithScore.map((l: any) => ({
            tipo: 'lead',
            id: l.id,
            nombre: l.nombre,
            email: l.email,
            telefono: l.telefono || undefined,
            empresa: l.empresa || undefined,
            idFiscal: l.perfilFiscal?.nif || undefined
          })))
          break

        case 'estado':
          const { estados } = targetConfig
          const leadsByEstado = await tenantClient.lead.findMany({
            where: { estado: { in: estados || [] } },
            select: {
              id: true,
              nombre: true,
              email: true,
              telefono: true,
              empresa: true,
              perfilFiscal: { select: { nif: true } }
            }
          })
          destinatarios.push(...leadsByEstado.map((l: any) => ({
            tipo: 'lead',
            id: l.id,
            nombre: l.nombre,
            email: l.email,
            telefono: l.telefono || undefined,
            empresa: l.empresa || undefined,
            idFiscal: l.perfilFiscal?.nif || undefined
          })))
          break

        case 'curso':
          const { cursoIds } = targetConfig
          const estudiantesByCurso = await tenantClient.estudiante.findMany({
            where: {
              inscripciones: {
                some: {
                  cursoId: { in: cursoIds || [] },
                  estado: 'activo'
                }
              }
            },
            select: { id: true, nombre: true, email: true, telefono: true }
          })
          destinatarios.push(...estudiantesByCurso.map((e: any) => ({ tipo: 'estudiante', id: e.id, nombre: e.nombre, email: e.email, telefono: e.telefono || undefined })))
          break

        case 'custom':
          const { leadIds = [], estudianteIds = [] } = targetConfig

          if (leadIds.length > 0) {
            const customLeads = await tenantClient.lead.findMany({
              where: { id: { in: leadIds } },
              select: {
                id: true,
                nombre: true,
                email: true,
                telefono: true,
                empresa: true,
                perfilFiscal: { select: { nif: true } }
              }
            })
            destinatarios.push(...customLeads.map((l: any) => ({
              tipo: 'lead',
              id: l.id,
              nombre: l.nombre,
              email: l.email,
              telefono: l.telefono || undefined,
              empresa: l.empresa || undefined,
              idFiscal: l.perfilFiscal?.nif || undefined
            })))
          }

          if (estudianteIds.length > 0) {
            const customEstudiantes = await tenantClient.estudiante.findMany({
              where: { id: { in: estudianteIds } },
              select: { id: true, nombre: true, email: true, telefono: true }
            })
            destinatarios.push(...customEstudiantes.map((e: any) => ({ tipo: 'estudiante', id: e.id, nombre: e.nombre, email: e.email, telefono: e.telefono || undefined })))
          }
          break
      }

      return destinatarios
    }
  )
}

/**
 * Reemplaza variables en el contenido del mensaje
 */
function replaceVariables(contenido: string, destinatario: any, tenant?: any): string {
  let resultado = contenido;
  const now = new Date();
  const fechaHoy = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  resultado = resultado.replace(/\{nombre\}/g, destinatario.nombre || '');
  resultado = resultado.replace(/\{email\}/g, destinatario.email || '');
  resultado = resultado.replace(/\{telefono\}/g, destinatario.telefono || '');
  resultado = resultado.replace(/\{empresa\}/g, destinatario.empresa || tenant?.nombre || '');
  resultado = resultado.replace(/\{id_fiscal\}/g, destinatario.idFiscal || '');
  resultado = resultado.replace(/\{fecha_hoy\}/g, fechaHoy);

  if (tenant?.id && destinatario.email) {
    const unsubLink = `${process.env.NEXTAUTH_URL || ''}/unsubscribe?email=${encodeURIComponent(destinatario.email)}&tenantId=${tenant.id}`;
    resultado = resultado.replace(/\{unsubscribe_link\}/g, unsubLink);
  } else {
    resultado = resultado.replace(/\{unsubscribe_link\}/g, '#');
  }

  return resultado;
}

/**
 * Obtiene las credenciales de Chatwoot del tenant
 * Busca en:
 * 1. Integration central (chatwoot)
 * 2. Tabla Channel (chatwootInboxId por canal)
 * 3. Integraciones individuales (whatsapp, telegram, etc.)
 * 4. MessagingHubConfig (configuración del Hub)
 */
async function getChatwootCredentials(tenantId: string) {
  const { getTenantDb, dbContext } = await import('./db');
  const tenantClient = await getTenantDb(tenantId);

  return await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      let accountId: number | undefined;
      let accountToken: string | undefined;
      const inboxIds: Record<string, number> = {};

      // 1. Buscar en MessagingHubConfig (Hub/Chatwoot central)
      const hubConfig = await tenantClient.messagingHubConfig.findUnique({
        where: { tenantId }
      });

      if (hubConfig && hubConfig.chatwootAccountId) {
        accountId = hubConfig.chatwootAccountId;
        
        // Desencriptar el account token del Hub
        if (hubConfig.hubApiToken) {
          try {
            const { decrypt } = await import('@/lib/core/crypto');
            accountToken = decrypt(hubConfig.hubApiToken);
          } catch (e) {
            console.error('[CampaignEngine] Error desencriptando token:', e);
          }
        }
        
        // Mapear inboxIds del Hub
        if (hubConfig.whatsappInboxId) {
          inboxIds['whatsapp'] = hubConfig.whatsappInboxId;
        }
        if (hubConfig.telegramInboxId) {
          inboxIds['telegram'] = hubConfig.telegramInboxId;
        }
      }

      // 2. Buscar en tabla Channel
      const channels = await tenantClient.channel.findMany({
        where: { tenantId }
      });

      for (const channel of channels) {
        if (channel.chatwootInboxId) {
          inboxIds[(channel as any).tipo] = channel.chatwootInboxId;
        }
      }

      // 3. Buscar en integraciones individuales
      const integrations = await tenantClient.integration.findMany({
        where: { tipo: { in: ['whatsapp', 'telegram', 'sms', 'facebook', 'instagram'] } }
      });

      for (const int of integrations) {
        const creds = int.credenciales as any;
        if (creds?.inbox_id && int.tipo) {
          inboxIds[int.tipo] = parseInt(creds.inbox_id);
        }
      }

      // Si no se encontró ningún inbox, devolver null
      if (Object.keys(inboxIds).length === 0) {
        return null;
      }

      return {
        accountId,
        accountToken,
        inboxIds
      };
    }
  );
}

/**
 * Envía mensaje por Chatwoot
 */
async function sendViaChatwoot(
  canal: string,
  destinatario: any,
  contenido: string,
  chatwootCreds: { accountId: number; accountToken: string; inboxIds: Record<string, number> }
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const inboxId = chatwootCreds.inboxIds[canal];
    
    if (!inboxId) {
      return { success: false, error: `No hay inbox configurado para ${canal}` };
    }

    // Usar el teléfono o email como identificador del contacto
    const contactIdentifier = destinatario.telefono || destinatario.email;
    
    if (!contactIdentifier) {
      return { success: false, error: 'No hay identificador de contacto' };
    }

    // Crear o obtener conversación
    const conversation = await chatwootApi.getOrCreateConversation(
      chatwootCreds.accountId,
      inboxId,
      contactIdentifier,
      chatwootCreds.accountToken
    );

    // Enviar mensaje
    const result = await chatwootApi.sendMessage(
      chatwootCreds.accountId,
      conversation.id,
      contenido,
      chatwootCreds.accountToken
    );

    return { success: true, messageId: String(result.id) };
  } catch (error: any) {
    console.error(`[CampaignEngine] Error enviando por Chatwoot (${canal}):`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Envía un mensaje por el canal especificado
 * 
 * Lógica:
 * - Email → Resend (directo)
 * - WhatsApp, Telegram, SMS → Chatwoot primero, luego fallback directo
 * - Facebook, Instagram → Chatwoot (no hay fallback directo)
 */
async function sendMessage(
  canal: string,
  destinatario: any,
  mensaje: any,
  tenantId: string,
  tenant?: any
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const contenido = replaceVariables(mensaje.contenido, destinatario, tenant);

  // Email siempre va directo por Resend
  if (canal === 'email') {
    if (!destinatario.email) {
      return { success: false, error: 'Email no disponible' };
    }
    const asunto = mensaje.asunto ? replaceVariables(mensaje.asunto, destinatario, tenant) : 'Mensaje de Volkern';
    await sendEmail({
      to: destinatario.email,
      subject: asunto,
      html: contenido,
      text: contenido,
      tenantSubdomain: tenantId
    });
    return { success: true };
  }

  // Facebook e Instagram solo van por Chatwoot (no hay método directo)
  if (canal === 'facebook' || canal === 'instagram') {
    try {
      const chatwootCreds = await getChatwootCredentials(tenantId);
      
      if (!chatwootCreds || !chatwootCreds.accountId || !chatwootCreds.accountToken) {
        return { success: false, error: 'Chatwoot no configurado para este tenant' };
      }

      return await sendViaChatwoot(canal, destinatario, contenido, chatwootCreds as any);
    } catch (error: any) {
      console.error(`[CampaignEngine] Error en sendMessage (${canal}):`, error);
      return { success: false, error: error.message };
    }
  }

  // WhatsApp, Telegram, SMS: intentar Chatwoot primero, luego fallback directo
  try {
    const chatwootCreds = await getChatwootCredentials(tenantId);
    
    if (chatwootCreds && chatwootCreds.accountId && chatwootCreds.accountToken) {
      const chatwootResult = await sendViaChatwoot(canal, destinatario, contenido, chatwootCreds as any);
      
      if (chatwootResult.success) {
        return chatwootResult;
      }
      
      console.log(`[CampaignEngine] Chatwoot falló para ${canal}, intentando método directo...`);
    }

    // Fallback a método directo
    return await sendDirectMessage(canal, destinatario, contenido, tenantId);
  } catch (error: any) {
    console.error(`[CampaignEngine] Error en sendMessage (${canal}):`, error);
    
    // Intentar fallback directo como último recurso
    try {
      return await sendDirectMessage(canal, destinatario, contenido, tenantId);
    } catch (fallbackError: any) {
      return { success: false, error: fallbackError.message };
    }
  }
}

/**
 * Envía mensaje directamente sin Chatwoot (fallback)
 */
async function sendDirectMessage(
  canal: string,
  destinatario: any,
  contenido: string,
  tenantId: string
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    switch (canal) {
      case 'whatsapp':
        if (!destinatario.telefono) {
          return { success: false, error: 'Teléfono no disponible' };
        }
        await sendWhatsAppMessage(destinatario.telefono, contenido, tenantId);
        return { success: true };

      case 'telegram': {
        if (!destinatario.telefono) {
          return { success: false, error: 'Teléfono no disponible' };
        }
        // Solo el bot PROPIO del tenant: la campaña es del tenant, así que
        // sale por su bot (el del sistema no lleva datos de tenants).
        const { loadTelegramCredentials } = await import('@/lib/telegram');
        const creds = await loadTelegramCredentials(tenantId);
        if (!creds.bot_token) {
          return { success: false, error: 'El tenant no tiene bot de Telegram propio' };
        }
        const envio = await sendTelegramMessage(destinatario.telefono, contenido, creds.bot_token);
        if (!(envio as any)?.success) {
          return { success: false, error: (envio as any)?.error || 'Error enviando por Telegram' };
        }
        return { success: true };
      }

      case 'sms':
        if (!destinatario.telefono) {
          return { success: false, error: 'Teléfono no disponible' };
        }
        await sendSMS(destinatario.telefono, contenido, tenantId);
        return { success: true };

      default:
        return { success: false, error: `Canal ${canal} no tiene método directo` };
    }
  } catch (error: any) {
    console.error(`[CampaignEngine] Error en sendDirectMessage (${canal}):`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Ejecuta una campaña
 */
export async function executeCampaign(campaignId: string, tenantId: string): Promise<void> {
  const { getTenantDb, dbContext } = await import('./db')
  const tenantClient = await getTenantDb(tenantId)

  const campaign = await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      return tenantClient.campaign.findUnique({
        where: { id: campaignId },
        include: { mensajes: true }
      })
    }
  )

  if (!campaign) {
    throw new Error('Campaña no encontrada')
  }

  if (campaign.estado !== 'borrador' && campaign.estado !== 'programada') {
    throw new Error('La campaña ya está en ejecución o completada')
  }

  await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      await tenantClient.campaign.update({
        where: { id: campaignId },
        data: {
          estado: 'en_curso',
          fechaInicio: new Date()
        }
      })
    }
  )

  try {
    const destinatarios = await getTargetAudience(
      tenantId,
      campaign.targetType,
      campaign.targetConfig as any
    )

    await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        await tenantClient.campaign.update({
          where: { id: campaignId },
          data: { totalDestinatarios: destinatarios.length }
        })
      }
    )

    const executions: any[] = []
    for (const destinatario of destinatarios) {
      for (const canal of campaign.canales) {
        const mensaje = campaign.mensajes.find((m: any) => m.canal === canal)
        if (!mensaje) continue

        const execution = await dbContext.run(
          { tenantId, client: tenantClient },
          async () => {
            return tenantClient.campaignExecution.create({
              data: {
                campaignId: campaign.id,
                destinatarioTipo: destinatario.tipo,
                destinatarioId: destinatario.id,
                destinatarioNombre: destinatario.nombre,
                destinatarioEmail: destinatario.email,
                destinatarioTelefono: destinatario.telefono,
                canal: canal,
                estado: 'pendiente'
              }
            })
          }
        )
        executions.push({ execution, destinatario, mensaje })
      }
    }

    let enviados = 0
    let errores = 0

    for (const { execution, destinatario, mensaje } of executions) {
      await dbContext.run(
        { tenantId, client: tenantClient },
        async () => {
          await tenantClient.campaignExecution.update({
            where: { id: execution.id },
            data: {
              estado: 'enviando',
              intentos: 1
            }
          })
        }
      )

      const resultado = await sendMessage(execution.canal, destinatario, mensaje, tenantId, null)

      if (resultado.success) {
        enviados++
        await dbContext.run(
          { tenantId, client: tenantClient },
          async () => {
            await tenantClient.campaignExecution.update({
              where: { id: execution.id },
              data: {
                estado: 'entregado',
                fechaEnviado: new Date(),
                fechaEntregado: new Date()
              }
            })
          }
        )
      } else {
        errores++
        await dbContext.run(
          { tenantId, client: tenantClient },
          async () => {
            await tenantClient.campaignExecution.update({
              where: { id: execution.id },
              data: {
                estado: 'error',
                errorMensaje: resultado.error
              }
            })
          }
        )
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        await tenantClient.campaign.update({
          where: { id: campaignId },
          data: {
            totalEnviados: enviados,
            totalEntregados: enviados,
            totalErrores: errores,
            estado: 'completada',
            fechaCompletado: new Date()
          }
        })
      }
    )

  } catch (error: any) {
    console.error('Error ejecutando campaña:', error)
    await dbContext.run(
      { tenantId, client: tenantClient },
      async () => {
        await tenantClient.campaign.update({
          where: { id: campaignId },
          data: {
            estado: 'cancelada'
          }
        })
      }
    )
    throw error
  }
}

/**
 * Actualiza las métricas de una campaña
 */
export async function updateCampaignMetrics(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      executions: true
    }
  });

  if (!campaign) return;

  // Calcular métricas por canal
  for (const canal of campaign.canales) {
    const executionsCanal = campaign.executions.filter(e => e.canal === canal);

    const enviados = executionsCanal.filter(e => ['enviado', 'entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
    const entregados = executionsCanal.filter(e => ['entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
    const abiertos = executionsCanal.filter(e => ['abierto', 'click', 'convertido'].includes(e.estado)).length;
    const clicks = executionsCanal.filter(e => ['click', 'convertido'].includes(e.estado)).length;
    const conversiones = executionsCanal.filter(e => e.estado === 'convertido').length;
    const errores = executionsCanal.filter(e => e.estado === 'error').length;

    const tasaEntrega = enviados > 0 ? (entregados / enviados) * 100 : 0;
    const tasaApertura = entregados > 0 ? (abiertos / entregados) * 100 : 0;
    const tasaClick = abiertos > 0 ? (clicks / abiertos) * 100 : 0;
    const tasaConversion = clicks > 0 ? (conversiones / clicks) * 100 : 0;

    await prisma.campaignMetrics.create({
      data: {
        campaignId: campaign.id,
        canal: canal,
        enviados,
        entregados,
        abiertos,
        clicks,
        conversiones,
        errores,
        tasaEntrega,
        tasaApertura,
        tasaClick,
        tasaConversion
      }
    });
  }

  // Métricas totales
  const totalEnviados = campaign.executions.filter(e => ['enviado', 'entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
  const totalEntregados = campaign.executions.filter(e => ['entregado', 'abierto', 'click', 'convertido'].includes(e.estado)).length;
  const totalAbiertos = campaign.executions.filter(e => ['abierto', 'click', 'convertido'].includes(e.estado)).length;
  const totalClicks = campaign.executions.filter(e => ['click', 'convertido'].includes(e.estado)).length;
  const totalConversiones = campaign.executions.filter(e => e.estado === 'convertido').length;
  const totalErrores = campaign.executions.filter(e => e.estado === 'error').length;

  const tasaEntrega = totalEnviados > 0 ? (totalEntregados / totalEnviados) * 100 : 0;
  const tasaApertura = totalEntregados > 0 ? (totalAbiertos / totalEntregados) * 100 : 0;
  const tasaClick = totalAbiertos > 0 ? (totalClicks / totalAbiertos) * 100 : 0;
  const tasaConversion = totalClicks > 0 ? (totalConversiones / totalClicks) * 100 : 0;

  await prisma.campaignMetrics.create({
    data: {
      campaignId: campaign.id,
      canal: null,
      enviados: totalEnviados,
      entregados: totalEntregados,
      abiertos: totalAbiertos,
      clicks: totalClicks,
      conversiones: totalConversiones,
      errores: totalErrores,
      tasaEntrega,
      tasaApertura,
      tasaClick,
      tasaConversion
    }
  });
}

/**
 * Obtiene estadísticas de una campaña
 */
export async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      metrics: {
        where: { canal: null }, // Métricas totales
        orderBy: { fecha: 'desc' },
        take: 1
      }
    }
  });

  if (!campaign) {
    throw new Error('Campaña no encontrada');
  }

  const latestMetrics = campaign.metrics[0];

  if (latestMetrics) {
    return {
      totalDestinatarios: campaign.totalDestinatarios,
      enviados: latestMetrics.enviados,
      entregados: latestMetrics.entregados,
      abiertos: latestMetrics.abiertos,
      clicks: latestMetrics.clicks,
      conversiones: latestMetrics.conversiones,
      errores: latestMetrics.errores,
      tasaEntrega: latestMetrics.tasaEntrega,
      tasaApertura: latestMetrics.tasaApertura,
      tasaClick: latestMetrics.tasaClick,
      tasaConversion: latestMetrics.tasaConversion
    };
  }

  return {
    totalDestinatarios: campaign.totalDestinatarios,
    enviados: campaign.totalEnviados,
    entregados: campaign.totalEntregados,
    abiertos: campaign.totalAbiertos,
    clicks: campaign.totalClicks,
    conversiones: campaign.totalConversiones,
    errores: campaign.totalErrores,
    tasaEntrega: campaign.totalEnviados > 0 ? (campaign.totalEntregados / campaign.totalEnviados) * 100 : 0,
    tasaApertura: campaign.totalEntregados > 0 ? (campaign.totalAbiertos / campaign.totalEntregados) * 100 : 0,
    tasaClick: campaign.totalAbiertos > 0 ? (campaign.totalClicks / campaign.totalAbiertos) * 100 : 0,
    tasaConversion: campaign.totalClicks > 0 ? (campaign.totalConversiones / campaign.totalClicks) * 100 : 0
  };
}

/**
 * Pausa una campaña en ejecución
 */
export async function pauseCampaign(campaignId: string, tenantId: string): Promise<void> {
  const { getTenantDb, dbContext } = await import('./db')
  const tenantClient = await getTenantDb(tenantId)

  await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      await tenantClient.campaign.update({
        where: { id: campaignId },
        data: { estado: 'pausada' }
      })
    }
  )
}

/**
 * Reanuda una campaña pausada
 */
export async function resumeCampaign(campaignId: string, tenantId: string): Promise<void> {
  const { getTenantDb, dbContext } = await import('./db')
  const tenantClient = await getTenantDb(tenantId)

  await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      await tenantClient.campaign.update({
        where: { id: campaignId },
        data: { estado: 'en_curso' }
      })
    }
  )

  await executeCampaign(campaignId, tenantId)
}

/**
 * Cancela una campaña
 */
export async function cancelCampaign(campaignId: string, tenantId: string): Promise<void> {
  const { getTenantDb, dbContext } = await import('./db')
  const tenantClient = await getTenantDb(tenantId)

  await dbContext.run(
    { tenantId, client: tenantClient },
    async () => {
      await tenantClient.campaign.update({
        where: { id: campaignId },
        data: {
          estado: 'cancelada',
          fechaCompletado: new Date()
        }
      })

      await tenantClient.campaignExecution.updateMany({
        where: {
          campaignId: campaignId,
          estado: 'pendiente'
        },
        data: {
          estado: 'error',
          errorMensaje: 'Campaña cancelada'
        }
      })
    }
  )
}

/**
 * ==================== A/B TESTING ====================
 */

/**
 * Calcula los resultados de un A/B test
 */
export async function getABTestResults(campaignId: string): Promise<ABTestResults> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      executions: {
        where: {
          variante: { not: null }
        }
      },
      mensajes: true
    }
  });

  if (!campaign) {
    throw new Error('Campaña no encontrada');
  }

  if (campaign.tipo !== 'a_b_test') {
    throw new Error('Esta campaña no es un A/B test');
  }

  // Obtener variantes únicas
  const variantesUnicas = [...new Set(campaign.executions
    .map(e => e.variante)
    .filter((v): v is string => v !== null))];

  // Calcular métricas por variante
  const variantes: ABTestVariant[] = await Promise.all(
    variantesUnicas.map(async (variante) => {
      const executions = campaign.executions.filter(e => e.variante === variante);

      const enviados = executions.filter(e =>
        ['enviado', 'entregado', 'abierto', 'click', 'convertido'].includes(e.estado)
      ).length;

      const entregados = executions.filter(e =>
        ['entregado', 'abierto', 'click', 'convertido'].includes(e.estado)
      ).length;

      const abiertos = executions.filter(e =>
        ['abierto', 'click', 'convertido'].includes(e.estado)
      ).length;

      const clicks = executions.filter(e =>
        ['click', 'convertido'].includes(e.estado)
      ).length;

      const conversiones = executions.filter(e => e.estado === 'convertido').length;

      const tasaApertura = entregados > 0 ? (abiertos / entregados) * 100 : 0;
      const tasaClick = abiertos > 0 ? (clicks / abiertos) * 100 : 0;
      const tasaConversion = clicks > 0 ? (conversiones / clicks) * 100 : 0;

      // Obtener nombre de la variante del mensaje
      const mensaje = campaign.mensajes.find(m => m.variante === variante);
      const nombre = mensaje?.variante || variante;

      return {
        variante,
        nombre: `Variante ${nombre}`,
        enviados,
        entregados,
        abiertos,
        clicks,
        conversiones,
        tasaApertura,
        tasaClick,
        tasaConversion
      };
    })
  );

  // Determinar la mejor variante (por tasa de conversión)
  const mejorVariante = variantes.reduce((mejor, actual) =>
    actual.tasaConversion > mejor.tasaConversion ? actual : mejor
    , variantes[0]);

  // Calcular confianza estadística (simplificado)
  const confianzaEstadistica = calcularConfianzaEstadistica(variantes);

  return {
    campanaNombre: campaign.nombre,
    variantes,
    mejorVariante: mejorVariante.variante,
    confianzaEstadistica,
    fechaInicio: campaign.fechaInicio || campaign.fechaCreacion,
    fechaFin: campaign.fechaCompletado || undefined
  };
}

/**
 * Calcula la confianza estadística de un A/B test
 * (Implementación simplificada - en producción usar test estadístico apropiado)
 */
function calcularConfianzaEstadistica(variantes: ABTestVariant[]): number {
  if (variantes.length < 2) return 0;

  // Ordenar por tasa de conversión
  const ordenadas = [...variantes].sort((a, b) => b.tasaConversion - a.tasaConversion);
  const mejor = ordenadas[0];
  const segunda = ordenadas[1];

  // Si no hay suficientes datos, baja confianza
  if (mejor.enviados < 30 || segunda.enviados < 30) {
    return 0;
  }

  // Diferencia relativa entre las tasas
  const diferencia = Math.abs(mejor.tasaConversion - segunda.tasaConversion);
  const promedioConversiones = (mejor.conversiones + segunda.conversiones) / 2;

  // Calcular confianza basada en diferencia y tamaño de muestra
  let confianza = 0;

  if (diferencia > 20 && promedioConversiones > 10) {
    confianza = 95;
  } else if (diferencia > 10 && promedioConversiones > 5) {
    confianza = 80;
  } else if (diferencia > 5 && promedioConversiones > 3) {
    confianza = 65;
  } else {
    confianza = 50;
  }

  return Math.min(confianza, 99); // Máximo 99%
}

/**
 * Selecciona automáticamente la mejor variante y finaliza el A/B test
 */
export async function finalizarABTest(campaignId: string): Promise<void> {
  const results = await getABTestResults(campaignId);

  // Actualizar la campaña con la variante ganadora
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      estado: 'completada',
      fechaCompletado: new Date()
    }
  });

  console.log(`A/B Test finalizado. Variante ganadora: ${results.mejorVariante} con ${results.confianzaEstadistica}% de confianza`);
}

/**
 * Procesa las campañas programadas que ya deben ejecutarse
 * Se llama desde el cron job cada X minutos
 */
export async function processScheduledCampaigns(): Promise<number> {
  try {
    const { globalPrisma, getTenantDb, dbContext } = await import('./db')

    const tenants = await globalPrisma.tenant.findMany({
      select: { id: true, dbUrl: true }
    })

    let processedCount = 0

    for (const tenant of tenants) {
      try {
        const tenantClient = await getTenantDb(tenant.id)

        const now = new Date()

        await dbContext.run(
          { tenantId: tenant.id, client: tenantClient },
          async () => {
            const readyCampaigns = await tenantClient.campaign.findMany({
              where: {
                estado: 'programada',
                fechaProgramada: { lte: now }
              }
            })

            for (const campaign of readyCampaigns) {
              try {
                await executeCampaign(campaign.id, tenant.id)
                processedCount++
                console.log(`✅ Campaña programada ejecutada: ${campaign.nombre}`)
              } catch (error) {
                console.error(`❌ Error ejecutando campaña programada ${campaign.id}:`, error)
                await tenantClient.campaign.update({
                  where: { id: campaign.id },
                  data: { estado: 'cancelada' }
                })
              }
            }
          }
        )
      } catch (error) {
        console.error(`Error procesando campañas para tenant ${tenant.id}:`, error)
      }
    }

    return processedCount
  } catch (error) {
    console.error('Error procesando campañas programadas:', error)
    return 0
  }
}
