import { ActionContext } from '../types'

export async function updateEmployee(config: any, ctx: ActionContext): Promise<boolean> {
  const { employeeId, datos } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).empleado.update({ where: { id: employeeId || ctx.state.employeeId }, data: datos })
  await ctx.log('update_employee', 'action', 'success', 'Datos de empleado actualizados')
  return true
}

export async function assignRole(config: any, ctx: ActionContext): Promise<boolean> {
  const { employeeId, rolId } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).empleadoRol.create({
    data: { tenantId: ctx.state.tenantId, empleadoId: employeeId || ctx.state.employeeId, rolId, estado: 'activo' },
  })
  await ctx.log('assign_role', 'action', 'success', 'Rol asignado al empleado')
  return true
}
