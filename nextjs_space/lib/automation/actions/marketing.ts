import { ActionContext } from '../types'

export async function createCampaign(config: any, ctx: ActionContext): Promise<boolean> {
  const { nombre, tipo, fechaInicio, fechaFin, presupuesto } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const campaign =    await (tenantClient as any).campana.create({
    data: { tenantId: ctx.state.tenantId, nombre, tipo: tipo || 'email', estado: 'borrador', fechaInicio, fechaFin, presupuesto },
  })
  await ctx.log('create_campaign', 'action', 'success', `Campaña ${campaign.id} creada`)
  return true
}

export async function addContactToList(config: any, ctx: ActionContext): Promise<boolean> {
  const { listaId, leadId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).listaContacto.create({
    data: { tenantId: ctx.state.tenantId, listaId, leadId: leadId || ctx.state.leadId },
  })
  await ctx.log('add_contact_to_list', 'action', 'success', 'Contacto agregado a lista')
  return true
}

export async function removeContactFromList(config: any, ctx: ActionContext): Promise<boolean> {
  const { listaId, leadId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).listaContacto.deleteMany({ where: { listaId, leadId: leadId || ctx.state.leadId } })
  await ctx.log('remove_contact_from_list', 'action', 'success', 'Contacto removido de lista')
  return true
}

export async function segmentAudience(config: any, ctx: ActionContext): Promise<boolean> {
  const { nombre, criterios } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const whereClause: any = { tenantId: ctx.state.tenantId }
  if (criterios?.etiquetas?.length) whereClause.etiquetas = { hasSome: criterios.etiquetas }
  if (criterios?.origen) whereClause.origen = criterios.origen
  if (criterios?.fechaCreacionDespues) whereClause.createdAt = { gte: new Date(criterios.fechaCreacionDespues) }

  const leads = await tenantClient.lead.findMany({ where: whereClause, select: { id: true } })
  const lista = await (tenantClient as any).lista.create({
    data: { tenantId: ctx.state.tenantId, nombre, tipo: 'segmento', criterio: JSON.stringify(criterios) },
  })
  await (tenantClient as any).listaContacto.createMany({
    data: leads.map((l: any) => ({ tenantId: ctx.state.tenantId, listaId: lista.id, leadId: l.id })),
  })
  await ctx.log('segment_audience', 'action', 'success', `Segmento creado con ${leads.length} contactos`)
  return true
}

export async function scheduleSocialPost(config: any, ctx: ActionContext): Promise<boolean> {
  const { plataforma, contenido, fechaPublicacion, medios } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).publicacionProgramada.create({
    data: { tenantId: ctx.state.tenantId, plataforma, contenido, fechaPublicacion: fechaPublicacion || new Date(), estado: 'programada', medios: medios || [] },
  })
  await ctx.log('schedule_social_post', 'action', 'success', `Publicación programada para ${plataforma}`)
  return true
}

export async function publishSocialPost(config: any, ctx: ActionContext): Promise<boolean> {
  const { publicacionId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).publicacionProgramada.update({
    where: { id: publicacionId || ctx.state.publicacionId },
    data: { estado: 'publicada', fechaPublicacion: new Date() },
  })
  await ctx.log('publish_social_post', 'action', 'success', 'Publicación social publicada')
  return true
}

export async function sendFollowUp(config: any, ctx: ActionContext): Promise<boolean> {
  const { leadId, tipo, templateId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const lead = await tenantClient.lead.findUnique({ where: { id: leadId || ctx.state.leadId } })
  if (lead?.email) {
    const { sendEmail: se } = await import('@/lib/resend-email')
    const subject = tipo === 'bienvenida' ? '¡Bienvenido!' : 'Seguimiento'
    const body = templateId || 'Gracias por tu interés. Te contactaremos pronto.'
    await (se as any)(lead.email, subject, body, ctx.state.tenantId)
  }
  await ctx.log('send_follow_up', 'action', 'success', 'Follow-up enviado al lead')
  return true
}

export async function updateNurturing(config: any, ctx: ActionContext): Promise<boolean> {
  const { leadId, etapa, diasEnEtapa } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.lead.update({
    where: { id: leadId || ctx.state.leadId },
    data: { etapaNurturing: etapa, diasEnEtapa: diasEnEtapa || 0 } as any,
  })
  await ctx.log('update_nurturing', 'action', 'success', `Etapa de nurturing actualizada: ${etapa}`)
  return true
}

export async function calculateEngagement(config: any, ctx: ActionContext): Promise<boolean> {
  const { leadId, periodo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (periodo || 30))

  const actividades = await (tenantClient as any).actividad.count({
    where: { leadId: leadId || ctx.state.leadId, createdAt: { gte: startDate } },
  })
  const engagement = Math.min(100, actividades * 10)

  await tenantClient.lead.update({
    where: { id: leadId || ctx.state.leadId },
    data: { puntuacionEngagement: engagement } as any,
  })
  await ctx.log('calculate_engagement', 'action', 'success', `Engagement calculado: ${engagement}%`)
  return true
}

export async function generateCampaignReport(config: any, ctx: ActionContext): Promise<boolean> {
  const { campaignId, tipoReporte } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const campaign = await (tenantClient as any).campana.findUnique({
    where: { id: campaignId || ctx.state.campaignId },
    include: { envios: true },
  })
  const totalEnviados = campaign?.envios.length || 0
  const abiertos = campaign?.envios.filter((e: any) => e.abierto).length || 0
  const clicks = campaign?.envios.filter((e: any) => e.clic).length || 0

  const reporte = {
    campaignId: campaign?.id, nombre: campaign?.nombre, totalEnviados,
    tasaApertura: totalEnviados > 0 ? (abiertos / totalEnviados) * 100 : 0,
    tasaClics: totalEnviados > 0 ? (clicks / totalEnviados) * 100 : 0,
    fecha: new Date(),
  }

  await (tenantClient as any).reporteCampana.create({
    data: { tenantId: ctx.state.tenantId, campanaId: campaign?.id, tipo: tipoReporte || 'resumen', datos: JSON.stringify(reporte) },
  })
  await ctx.log('generate_campaign_report', 'action', 'success', 'Reporte de campaña generado')
  return true
}

export async function sendMarketingEmail(config: any, ctx: ActionContext): Promise<boolean> {
  const { leadId, asunto, contenido } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const lead = await tenantClient.lead.findUnique({ where: { id: leadId || ctx.state.leadId } })
  if (lead?.email) {
    const { sendEmail: se2 } = await import('@/lib/resend-email')
    await (se2 as any)(lead.email, asunto || 'Información', contenido || 'Contenido del email marketing', ctx.state.tenantId)
    await (tenantClient as any).campanaEnvio.create({
      data: { tenantId: ctx.state.tenantId, campanaId: ctx.state.campaignId, leadId: lead.id, estado: 'enviado', fechaEnvio: new Date() },
    })
  }
  await ctx.log('send_marketing_email', 'action', 'success', 'Email marketing enviado')
  return true
}

export async function createEmailSequence(config: any, ctx: ActionContext): Promise<boolean> {
  const { nombre, emails, intervaloDias } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).secuenciaEmail.create({
    data: {
      tenantId: ctx.state.tenantId, nombre, intervaloDias: intervaloDias || 1, estado: 'activa',
      pasos: {
        create: emails.map((email: any, index: number) => ({
          orden: index + 1, asunto: email.asunto, contenido: email.contenido,
          diasDespues: index * (intervaloDias || 1),
        })),
      },
    },
  })
  await ctx.log('create_email_sequence', 'action', 'success', `Secuencia de email "${nombre}" creada`)
  return true
}

export async function pauseEmailSequence(config: any, ctx: ActionContext): Promise<boolean> {
  const { secuenciaId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).secuenciaEmail.update({
    where: { id: secuenciaId || ctx.state.secuenciaId },
    data: { estado: 'pausada' },
  })
  await ctx.log('pause_email_sequence', 'action', 'success', 'Secuencia de email pausada')
  return true
}
