import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function createProject(config: any, ctx: ActionContext): Promise<boolean> {
  const { nombre, descripcion, fechaInicio, fechaFin, presupuesto } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).proyecto.create({
    data: { tenantId: ctx.state.tenantId, nombre, descripcion, fechaInicio: fechaInicio || new Date(), fechaFin, presupuesto, estado: 'planificacion' },
  })
  await ctx.log('create_project', 'action', 'success', `Proyecto "${nombre}" creado`)
  return true
}

export async function notifyProjectTeam(config: any, ctx: ActionContext): Promise<boolean> {
  const { projectId, mensaje } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const proyecto = await (tenantClient as any).proyecto.findUnique({
    where: { id: projectId || ctx.state.projectId },
    include: { miembros: { include: { usuario: true } } },
  })

  const notifModule = await import('@/lib/skills/notification-layer') as any
  const { notifyByTelegram, sendEmail } = notifModule
  const context = createSystemContext(ctx.state.tenantId as string)

  for (const miembro of proyecto?.miembros || []) {
    if (miembro.usuario?.email) {
      await sendEmail(miembro.usuario.email! as string, `Actualización del proyecto: ${proyecto?.nombre ?? ''}`, mensaje, ctx.state.tenantId as string)
    }
  }
  notifyByTelegram(mensaje, context).catch(() => {})
  await ctx.log('notify_project_team', 'action', 'success', 'Notificación al equipo del proyecto enviada')
  return true
}

export async function updateProgress(config: any, ctx: ActionContext): Promise<boolean> {
  const { projectId, progreso, notas } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).proyecto.update({
    where: { id: projectId || ctx.state.projectId },
    data: { progreso: progreso || 0, notasActualizacion: notas, ultimaActualizacion: new Date() },
  })
  await ctx.log('update_progress', 'action', 'success', `Progreso actualizado: ${progreso}%`)
  return true
}

export async function createMilestone(config: any, ctx: ActionContext): Promise<boolean> {
  const { projectId, nombre, descripcion, fechaEntrega } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).proyectoHito.create({
    data: { tenantId: ctx.state.tenantId, proyectoId: projectId || ctx.state.projectId, nombre, descripcion, fechaEntrega: fechaEntrega || new Date(), estado: 'pendiente' },
  })
  await ctx.log('create_milestone', 'action', 'success', `Hito "${nombre}" creado`)
  return true
}

export async function notifyMilestone(config: any, ctx: ActionContext): Promise<boolean> {
  const { milestoneId, tipoNotificacion } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const hito = await (tenantClient as any).proyectoHito.findUnique({
    where: { id: milestoneId || ctx.state.milestoneId },
    include: { proyecto: true },
  })

  const { notifyByTelegram } = await import('@/lib/skills/notification-layer') as any
  const context = createSystemContext(ctx.state.tenantId as string)

  const message = tipoNotificacion === 'proximamente'
    ? `📌 *Hito Próximo*\n\nProyecto: ${hito?.proyecto?.nombre ?? ''}\nHito: ${hito?.nombre ?? ''}\nFecha: ${new Date(hito?.fechaEntrega as any).toLocaleDateString()}`
    : `✅ *Hito Completado*\n\nProyecto: ${hito?.proyecto?.nombre ?? ''}\nHito: ${hito?.nombre ?? ''}`
  notifyByTelegram(message, context).catch(() => {})
  await ctx.log('notify_milestone', 'action', 'success', 'Notificación de hito enviada')
  return true
}

export async function generateProjectReport(config: any, ctx: ActionContext): Promise<boolean> {
  const { projectId, tipoReporte } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const proyecto = await (tenantClient as any).proyecto.findUnique({
    where: { id: projectId || ctx.state.projectId },
    include: { hitos: true, tareas: true, miembros: true },
  })

  const hitosCompletados = proyecto?.hitos.filter((h: any) => h.estado === 'completado').length || 0
  const totalHitos = proyecto?.hitos.length || 0
  const tareasCompletadas = proyecto?.tareas.filter((t: any) => t.estado === 'completada').length || 0
  const totalTareas = proyecto?.tareas.length || 0

  const reporte = {
    projectId: proyecto?.id, nombre: proyecto?.nombre, progreso: proyecto?.progreso || 0,
    hitos: { completados: hitosCompletados, total: totalHitos },
    tareas: { completadas: tareasCompletadas, total: totalTareas },
    miembros: proyecto?.miembros.length || 0,
    tipo: tipoReporte || 'general', fecha: new Date(),
  }

  await (tenantClient as any).reporteProyecto.create({
    data: { tenantId: ctx.state.tenantId, proyectoId: proyecto?.id, tipo: tipoReporte, datos: JSON.stringify(reporte) },
  })
  await ctx.log('generate_project_report', 'action', 'success', 'Reporte de proyecto generado')
  return true
}

export async function createProjectTask(config: any, ctx: ActionContext): Promise<boolean> {
  const { projectId, titulo, descripcion, asignadoA, fechaVencimiento, prioridad } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).proyectoTarea.create({
    data: { tenantId: ctx.state.tenantId, proyectoId: projectId || ctx.state.projectId, titulo, descripcion, asignadoA, fechaVencimiento, prioridad: prioridad || 'media', estado: 'pendiente' },
  })
  await ctx.log('create_project_task', 'action', 'success', `Tarea "${titulo}" creada en proyecto`)
  return true
}

export async function assignDeliverable(config: any, ctx: ActionContext): Promise<boolean> {
  const { projectId, milestoneId, nombre, descripcion, asignarA, fechaEntrega } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).proyectoEntregable.create({
    data: {
      tenantId: ctx.state.tenantId, projectId: projectId || ctx.state.projectId,
      milestoneId: milestoneId || ctx.state.milestoneId,
      nombre: nombre || 'Entregable', descripcion,
      estado: 'asignado', fechaEntrega: fechaEntrega || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      asignadoA: asignarA || ctx.state.userId,
    },
  })
  await ctx.log('assign_deliverable', 'action', 'success', 'Entregable asignado')
  return true
}
