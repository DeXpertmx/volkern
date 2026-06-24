import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function createInspection(config: any, ctx: ActionContext): Promise<boolean> {
  const { area, tipo, criterios } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).inspeccion.create({
    data: { tenantId: ctx.state.tenantId, area, tipo: tipo || 'rutina', estado: 'programada', fechaProgramada: new Date(), criterios: criterios || [] },
  })
  await ctx.log('create_inspection', 'action', 'success', `Inspección creada para ${area}`)
  return true
}

export async function registerNonConformity(config: any, ctx: ActionContext): Promise<boolean> {
  const { inspeccionId, descripcion, severidad } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).noConformidad.create({
    data: { tenantId: ctx.state.tenantId, inspeccionId: inspeccionId || ctx.state.inspeccionId, descripcion, severidad: severidad || 'media', estado: 'abierta', fechaDeteccion: new Date() },
  })
  await ctx.log('register_non_conformity', 'action', 'success', 'No conformidad registrada')
  return true
}

export async function closeNonConformity(config: any, ctx: ActionContext): Promise<boolean> {
  const { nonConformityId, solucion, eficacia } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).noConformidad.update({
    where: { id: (nonConformityId || ctx.state.nonConformityId) as string },
    data: { estado: 'cerrada', solucion, eficaciaVerificacion: eficacia, fechaCierre: new Date() },
  })
  await ctx.log('close_non_conformity', 'action', 'success', 'No conformidad cerrada')
  return true
}

export async function notifyQualityAlert(config: any, ctx: ActionContext): Promise<boolean> {
  const { nonConformityId, tipoAlerta } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const nc = await (tenantClient as any).noConformidad.findUnique({ where: { id: (nonConformityId || ctx.state.nonConformityId) as string } })
  const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
  const context = createSystemContext(ctx.state.tenantId as any)

  const message = `🔴 *Alerta de Calidad*\n\nTipo: ${tipoAlerta || 'No Conformidad'}\nSeveridad: ${nc?.severidad}\nDescripción: ${nc?.descripcion}`
  notifyByTelegram(message, context).catch(() => {})
  await ctx.log('notify_quality_alert', 'action', 'success', 'Alerta de calidad enviada')
  return true
}

export async function generateQualityReport(config: any, ctx: ActionContext): Promise<boolean> {
  const { tipo, periodo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (periodo || 30))

  const inspecciones = await (tenantClient as any).inspeccion.count({ where: { tenantId: ctx.state.tenantId, createdAt: { gte: startDate } } })
  const noConformidades = await (tenantClient as any).noConformidad.count({ where: { tenantId: ctx.state.tenantId, createdAt: { gte: startDate } } })

  const reporte = {
    tipo: tipo || 'mensual', periodo: periodo || 30,
    inspeccionesRealizadas: inspecciones, noConformidadesDetectadas: noConformidades,
    tasaConformidad: inspecciones > 0 ? ((inspecciones - noConformidades) / inspecciones) * 100 : 0,
    fecha: new Date(),
  }
  await (tenantClient as any).reporteCalidad.create({ data: { tenantId: ctx.state.tenantId, tipo, datos: JSON.stringify(reporte) } })
  await ctx.log('generate_quality_report', 'action', 'success', 'Reporte de calidad generado')
  return true
}

export async function scheduleCalibration(config: any, ctx: ActionContext): Promise<boolean> {
  const { equipoId, frecuenciaDias, fechaInicio } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).calibracionProgramada.create({
    data: {
      tenantId: ctx.state.tenantId, equipoId: equipoId || ctx.state.equipoId,
      frecuenciaDias: frecuenciaDias || 180,
      fechaUltimaCalibracion: new Date(),
      fechaProximaCalibracion: fechaInicio || new Date(Date.now() + (frecuenciaDias || 180) * 24 * 60 * 60 * 1000),
      estado: 'programada',
    },
  })
  await ctx.log('schedule_calibration', 'action', 'success', 'Calibración programada')
  return true
}
