import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function createSupportTicket(config: any, ctx: ActionContext): Promise<boolean> {
  const { titulo, descripcion, prioridad, categoria } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const ticket = await (tenantClient as any).soporteTicket.create({
    data: {
      tenantId: ctx.state.tenantId, titulo, descripcion,
      prioridad: prioridad || 'media', categoria: categoria || 'general',
      estado: 'abierto', solicitanteId: ctx.state.leadId || ctx.state.userId,
    },
  })
  await ctx.log('create_support_ticket', 'action', 'success', `Ticket ${ticket.id} creado`)
  return true
}

export async function assignTicket(config: any, ctx: ActionContext): Promise<boolean> {
  const { ticketId, asignadoA } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).soporteTicket.update({
    where: { id: ticketId || ctx.state.ticketId },
    data: { asignadoA, estado: 'asignado' },
  })
  await ctx.log('assign_ticket', 'action', 'success', `Ticket asignado a ${asignadoA}`)
  return true
}

export async function escalateTicket(config: any, ctx: ActionContext): Promise<boolean> {
  const { ticketId, nivel, motivo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).soporteTicket.update({
    where: { id: ticketId || ctx.state.ticketId },
    data: { nivelEscalacion: nivel, estado: 'escalado', notas: motivo },
  })
  await ctx.log('escalate_ticket', 'action', 'success', `Ticket escalado a nivel ${nivel}`)
  return true
}

export async function notifySLA(config: any, ctx: ActionContext): Promise<boolean> {
  const { ticketId, tipoAlerta } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const ticket = await (tenantClient as any).soporteTicket.findUnique({
    where: { id: ticketId || ctx.state.ticketId },
    include: { asignadoA: true },
  })

  if (ticket) {
    const { notifyByTelegram, notifyByEmail } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(ctx.state.tenantId as any)
    const message = `⚠️ *Alerta SLA ${tipoAlerta}*\n\nTicket: ${ticket.titulo}\nAsignado a: ${ticket.asignadoA?.nombre || 'Sin asignar'}`

    notifyByTelegram(message, context).catch(() => {})
    if (ticket.asignadoA?.email) (notifyByEmail as any)(ticket.asignadoA.email, 'Alerta SLA', message, context).catch(() => {})
  }
  await ctx.log('notify_sla', 'action', 'success', 'Alerta SLA enviada')
  return true
}

export async function closeTicket(config: any, ctx: ActionContext): Promise<boolean> {
  const { ticketId, solucion, satisfaccion } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).soporteTicket.update({
    where: { id: ticketId || ctx.state.ticketId },
    data: { estado: 'cerrado', solucion, satisfaccionCliente: satisfaccion, fechaCierre: new Date() },
  })
  await ctx.log('close_ticket', 'action', 'success', 'Ticket cerrado')
  return true
}

export async function createTaskFromTicket(config: any, ctx: ActionContext): Promise<boolean> {
  const { ticketId, titulo, asignadoA, fechaVencimiento } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const ticket = await (tenantClient as any).soporteTicket.findUnique({ where: { id: ticketId || ctx.state.ticketId } })
  const tarea = await (tenantClient as any).tarea.create({
    data: {
      tenantId: ctx.state.tenantId as any,
      titulo: titulo || `Tarea desde ticket: ${ticket?.titulo}`,
      descripcion: `Derivado del ticket ${ticketId || ctx.state.ticketId}`,
      asignadoA, fechaVencimiento, estado: 'pendiente',
      prioridad: ticket?.prioridad || 'media',
    } as any,
  })

  // Notificación informativa por Telegram (sin botones task:*: este modelo
  // tenant no lo resuelve el webhook, que busca en prisma.task).
  try {
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const { createSystemContext } = await import('@/lib/skills/context')
    const context = createSystemContext(ctx.state.tenantId || '')
    await notifyByTelegram(
      `🎫 *Nueva tarea desde ticket*\n\n${tarea?.titulo || titulo || 'Tarea desde ticket'}\n\nDerivada del ticket ${ticketId || ctx.state.ticketId}`,
      context
    )
  } catch (e) {
    console.error('[createTaskFromTicket] No se pudo notificar por Telegram:', e)
  }

  await ctx.log('create_task_from_ticket', 'action', 'success', 'Tarea creada desde ticket')
  return true
}
