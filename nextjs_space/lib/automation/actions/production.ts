import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function createProductionOrder(config: any, ctx: ActionContext): Promise<boolean> {
  const { productoId, cantidad, prioridad, fechaEntrega } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const order = await tenantClient.produccionOrden.create({
    data: {
      tenantId: ctx.state.tenantId, productoId, cantidad: cantidad || 1,
      prioridad: prioridad || 'normal', estado: 'pendiente',
      fechaInicio: new Date(), fechaEntrega,
    },
  })
  await ctx.log('create_production_order', 'action', 'success', `Orden de producción ${order.id} creada`)
  return true
}

export async function updateProductionOrderStatus(config: any, ctx: ActionContext): Promise<boolean> {
  const { orderId, estado, notas } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.produccionOrden.update({
    where: { id: orderId || ctx.state.productionOrderId },
    data: { estado, notas, fechaFin: estado === 'completada' ? new Date() : undefined },
  })
  await ctx.log('update_production_status', 'action', 'success', `Estado de producción actualizado: ${estado}`)
  return true
}

export async function notifyProduction(config: any, ctx: ActionContext): Promise<boolean> {
  const { message, tipo } = config
  const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
  const context = createSystemContext(ctx.state.tenantId)

  const msg = message || `📦 *Actualización de Producción*\n\nEstado: ${tipo || 'Actualización'}`
  notifyByTelegram(msg, context).catch(() => {})
  await ctx.log('notify_production', 'action', 'success', 'Notificación de producción enviada')
  return true
}

export async function registerProduction(config: any, ctx: ActionContext): Promise<boolean> {
  const { orderId, cantidadProducida, calidad, notas } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.produccionRegistro.create({
    data: {
      tenantId: ctx.state.tenantId, ordenId: orderId || ctx.state.productionOrderId,
      cantidad: cantidadProducida, calidad, notas, fecha: new Date(),
    },
  })
  await ctx.log('register_production', 'action', 'success', `Producción registrada: ${cantidadProducida} unidades`)
  return true
}
