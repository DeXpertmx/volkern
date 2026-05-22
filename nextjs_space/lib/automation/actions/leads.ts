import { prisma } from '@/lib/db'
import { ActionContext } from '../types'
import { sendNotification } from './communication'

export async function updateLead(config: any, ctx: ActionContext): Promise<boolean> {
  const { newStatus, updateData } = config
  const leadId = ctx.state.leadId
  if (!leadId) return false

  const dataToUpdate: any = { ...updateData }
  if (newStatus) dataToUpdate.estado = newStatus
  if (Object.keys(dataToUpdate).length === 0) return true

  await prisma.lead.update({
    where: { id: leadId },
    data: { ...dataToUpdate, fechaUltimaActividad: new Date() },
  })
  return true
}

export async function updateEstudiante(config: any, ctx: ActionContext): Promise<boolean> {
  const { updateData } = config
  const estudianteId = ctx.state.estudianteId
  if (!estudianteId || !updateData) return false

  await prisma.estudiante.update({ where: { id: estudianteId }, data: updateData })
  return true
}

export async function assignTag(config: any, ctx: ActionContext): Promise<boolean> {
  const { tag } = config
  const leadId = ctx.state.leadId
  if (!leadId || !tag) return false

  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return false

  const currentTags = lead.tags || ''
  const tagsArray = currentTags.split(',').filter((t: string) => t.trim())
  if (!tagsArray.includes(tag)) {
    tagsArray.push(tag)
    await prisma.lead.update({
      where: { id: leadId },
      data: { tags: tagsArray.join(','), fechaUltimaActividad: new Date() },
    })
  }
  return true
}

export async function removeTag(config: any, ctx: ActionContext): Promise<boolean> {
  const { tag } = config
  const leadId = ctx.state.leadId
  if (!leadId || !tag) return false

  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return false

  const currentTags = lead.tags || ''
  const tagsArray = currentTags.split(',').filter((t: string) => t.trim() && t !== tag)
  await prisma.lead.update({
    where: { id: leadId },
    data: { tags: tagsArray.join(','), fechaUltimaActividad: new Date() },
  })
  return true
}

export async function archiveLead(config: any, ctx: ActionContext): Promise<boolean> {
  const leadId = ctx.state.leadId
  if (!leadId) return false
  await prisma.lead.update({
    where: { id: leadId },
    data: { estado: 'archivado', fechaUltimaActividad: new Date() },
  })
  return true
}

export async function duplicateLead(config: any, ctx: ActionContext): Promise<boolean> {
  const leadId = ctx.state.leadId
  if (!leadId) return false

  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return false

  await prisma.lead.create({
    data: {
      nombre: `${lead.nombre} (Copia)`,
      email: lead.email,
      telefono: lead.telefono,
      empresa: lead.empresa,
      cargo: lead.cargo,
      ubicacion: lead.ubicacion,
      linkedin: lead.linkedin,
      estado: 'nuevo',
      fuente: lead.fuente,
      tags: lead.tags,
      scoreValue: lead.scoreValue || 0,
      tenantId: lead.tenantId,
    },
  })
  return true
}

export async function calculateAutoScore(config: any, ctx: ActionContext): Promise<boolean> {
  const leadId = ctx.state.leadId
  if (!leadId) return false

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { citas: true, interacciones: true },
  })
  if (!lead) return false

  let score = 0
  if (lead.email && lead.email.includes('@')) score += 10
  if (lead.telefono) score += 10
  if (lead.empresa) score += 15
  if (lead.cargo) score += 10

  const recentInteractions = lead.interacciones?.filter((i: any) => {
    const daysSince = (Date.now() - new Date(i.fechaCreacion).getTime()) / (1000 * 60 * 60 * 24)
    return daysSince <= 30
  }).length || 0
  score += Math.min(recentInteractions * 5, 25)

  const citasCount = lead.citas?.length || 0
  score += Math.min(citasCount * 15, 30)
  score = Math.max(0, Math.min(100, score))

  await prisma.lead.update({ where: { id: leadId }, data: { scoreValue: score } })
  return true
}

export async function assignLeadToUser(config: any, ctx: ActionContext): Promise<boolean> {
  const { userId } = config
  const leadId = ctx.state.leadId
  if (!leadId || !userId) return false

  await prisma.lead.update({
    where: { id: leadId },
    data: { asignadoA: userId, fechaUltimaActividad: new Date() },
  })

  // Notificar al usuario asignado via dispatchAction
  await ctx.dispatchAction({
    actionType: 'enviar_notificacion',
    message: 'Se te ha asignado un nuevo lead: {nombre}',
    userId,
  })
  return true
}

export async function updateLeadScore(config: any, ctx: ActionContext): Promise<boolean> {
  const { operation, value } = config
  const leadId = ctx.state.leadId
  if (!leadId) return false

  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return false

  let newScore = lead.scoreValue || 0
  switch (operation) {
    case 'set': newScore = value; break
    case 'add': newScore += value; break
    case 'subtract': newScore -= value; break
  }
  newScore = Math.max(0, Math.min(100, newScore))
  await prisma.lead.update({ where: { id: leadId }, data: { scoreValue: newScore } })
  return true
}

export async function createDeal(config: any, ctx: ActionContext): Promise<boolean> {
  const { titulo, valor, moneda, etapa, probabilidad } = config
  const leadId = ctx.state.leadId
  const tenantId = ctx.state.lead?.tenantId
  if (!tenantId) return false

  await prisma.deal.create({
    data: {
      titulo: titulo || `Deal - ${ctx.state.lead?.nombre || 'Sin nombre'}`,
      valor: parseFloat(valor) || 0,
      moneda: moneda || 'EUR',
      etapa: etapa || 'calificacion',
      probabilidad: probabilidad || 25,
      leadId,
      tenantId,
      fechaCreacion: new Date(),
      estado: 'activo',
    },
  })
  return true
}

export async function createTask(config: any, ctx: ActionContext): Promise<boolean> {
  const { titulo, descripcion, fechaVencimiento, prioridad, asignadoA } = config
  const leadId = ctx.state.leadId
  const tenantId = ctx.state.lead?.tenantId
  if (!tenantId) return false

  const taskData: any = {
    titulo: titulo || 'Tarea desde automatización',
    descripcion,
    estado: 'pendiente',
    prioridad: prioridad || 'media',
    leadId,
    asignadoA,
    tenantId,
  }
  if (fechaVencimiento) taskData.fechaVencimiento = new Date(fechaVencimiento)
  await prisma.task.create({ data: taskData })
  return true
}

export async function createAppointment(config: any, ctx: ActionContext): Promise<boolean> {
  const { titulo, descripcion, fechaHora, duracion, servicioId } = config
  const leadId = ctx.state.leadId
  const tenantId = ctx.state.lead?.tenantId
  if (!tenantId || !leadId || !servicioId) return false

  await prisma.cita.create({
    data: {
      titulo: titulo || 'Cita desde automatización',
      descripcion,
      fechaHora: new Date(fechaHora),
      duracion: duracion || 60,
      estado: 'pendiente',
      leadId,
      servicioId,
      tenantId,
    },
  })
  return true
}

export async function addToCampaign(config: any, ctx: ActionContext): Promise<boolean> {
  const { campanaId } = config
  const leadId = ctx.state.leadId
  if (!leadId || !campanaId) return false

  const existing = await prisma.campaignLead.findFirst({ where: { campanaId, leadId } })
  if (existing) return true

  await prisma.campaignLead.create({
    data: { campanaId, leadId, estado: 'activo', fechaAgregado: new Date() },
  })
  return true
}

export async function removeFromCampaign(config: any, ctx: ActionContext): Promise<boolean> {
  const { campanaId } = config
  const leadId = ctx.state.leadId
  if (!leadId || !campanaId) return false
  await prisma.campaignLead.deleteMany({ where: { campanaId, leadId } })
  return true
}

export async function enrollInCourse(config: any, ctx: ActionContext): Promise<boolean> {
  const { cursoId } = config
  const estudianteId = ctx.state.estudianteId
  if (!estudianteId || !cursoId) return false

  const existingEnrollment = await prisma.inscripcion.findFirst({ where: { estudianteId, cursoId } })
  if (existingEnrollment) return true

  await prisma.inscripcion.create({
    data: {
      estudianteId,
      cursoId,
      fechaInscripcion: new Date(),
      estado: 'activo',
      progresoPorcentaje: 0,
    },
  })
  return true
}

export async function sendCertificate(config: any, ctx: ActionContext): Promise<boolean> {
  const estudianteId = ctx.state.estudianteId
  const cursoId = ctx.state.cursoId
  if (!estudianteId || !cursoId) return false

  const estudiante = await prisma.estudiante.findUnique({ where: { id: estudianteId } })
  if (!estudiante?.email) return false

  const codigoUnico = `CERT-${Date.now()}-${estudianteId}`
  await prisma.certificado.create({
    data: { codigoUnico, estudianteId, cursoId, fechaEmision: new Date() },
  })

  const { sendEmail: sendResendEmail } = await import('@/lib/resend-email')
  await sendResendEmail({
    to: estudiante.email,
    subject: '¡Felicitaciones! Tu certificado está listo',
    html: `<h1>¡Felicitaciones por completar el curso!</h1><p>Tu certificado ha sido generado.</p><p>Código de verificación: <strong>${codigoUnico}</strong></p><a href="${process.env.NEXT_PUBLIC_APP_URL}/certificados/verificar/${codigoUnico}">Ver Certificado</a>`,
  })
  return true
}
