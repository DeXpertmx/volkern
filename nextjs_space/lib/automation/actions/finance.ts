import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

/**
 * Generar PDF de factura (generar_factura)
 */
export async function generateInvoicePDF(config: any, ctx: ActionContext): Promise<boolean> {
  const { invoiceId, tipo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const invoice = await tenantClient.factura.findUnique({ where: { id: invoiceId || ctx.state.invoiceId } })
  if (invoice && tipo === 'pdf') {
    const { InvoicingService } = await import('@/lib/invoicing-service')
    const invoicingService = new InvoicingService(ctx.state.tenantId)
    await invoicingService.generarPDF(invoice.id)
  }
  await ctx.log('generate_invoice', 'action', 'success', `Factura ${invoice?.id} generada`)
  return true
}

export async function registerExpense(config: any, ctx: ActionContext): Promise<boolean> {
  const { categoria, monto, descripcion, fecha } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.gasto.create({
    data: { tenantId: ctx.state.tenantId, categoria, monto, descripcion, fecha: fecha || new Date(), estado: 'pendiente', usuarioId: ctx.state.userId },
  })
  await ctx.log('register_expense', 'action', 'success', `Gasto registrado: ${monto}`)
  return true
}

export async function approveExpense(config: any, ctx: ActionContext): Promise<boolean> {
  const { expenseId, approve } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await tenantClient.gasto.update({
    where: { id: expenseId || ctx.state.expenseId },
    data: { estado: approve ? 'aprobado' : 'rechazado', fechaAprobacion: new Date(), aprobadorId: ctx.state.userId },
  })
  await ctx.log('approve_expense', 'action', 'success', `Gasto ${approve ? 'aprobado' : 'rechazado'}`)
  return true
}

export async function rejectExpense(config: any, ctx: ActionContext): Promise<boolean> {
  return approveExpense({ ...config, approve: false }, ctx)
}

export async function notifyPayment(config: any, ctx: ActionContext): Promise<boolean> {
  const { paymentId, tipoNotificacion } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const pago = await tenantClient.pago.findUnique({
    where: { id: paymentId || ctx.state.paymentId },
    include: { contrato: { include: { lead: true } } },
  })
  if (pago) {
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const context = createSystemContext(ctx.state.tenantId)
    const message = tipoNotificacion === 'recibo'
      ? `💳 *Recibo de Pago*\n\nMonto: ${pago.monto} ${pago.moneda}\nConcepto: ${pago.concepto}`
      : `✅ *Pago Confirmado*\n\nMonto: ${pago.monto} ${pago.moneda}`
    notifyByTelegram(message, context).catch(() => {})
  }
  await ctx.log('notify_payment', 'action', 'success', 'Notificación de pago enviada')
  return true
}

export async function createPayroll(config: any, ctx: ActionContext): Promise<boolean> {
  const { periodoInicio, periodoFin, empleados } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const nomina = await tenantClient.nomina.create({
    data: {
      tenantId: ctx.state.tenantId, periodoInicio, periodoFin, estado: 'borrador',
      detalles: {
        create: empleados.map((emp: any) => ({
          empleadoId: emp.employeeId, diasTrabajados: emp.dias || 30,
          sueldoBase: emp.sueldo, bonificaciones: emp.bonificaciones || 0, deducciones: emp.deducciones || 0,
        })),
      },
    },
  })
  await ctx.log('create_payroll', 'action', 'success', `Nómina ${nomina.id} creada`)
  return true
}

export async function notifyInvoiceOverdue(config: any, ctx: ActionContext): Promise<boolean> {
  const { invoiceId, diasVencido } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const factura = await tenantClient.factura.findUnique({
    where: { id: invoiceId || ctx.state.invoiceId },
    include: { cliente: true },
  })
  if (factura?.cliente?.email) {
    const { sendEmail } = await import('@/lib/resend-email')
    await sendEmail(factura.cliente.email, `Factura vencida - ${diasVencido} días`, `Tu factura #${factura.numero} está vencida. Por favor, regulariza tu pago.`, ctx.state.tenantId)
  }
  await ctx.log('notify_invoice_overdue', 'action', 'success', 'Notificación de factura vencida enviada')
  return true
}

export async function sendPaymentReminder(config: any, ctx: ActionContext): Promise<boolean> {
  const { paymentId, diasAntes } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const pago = await tenantClient.pago.findUnique({
    where: { id: paymentId || ctx.state.paymentId },
    include: { contrato: { include: { lead: true } } },
  })
  if (pago?.contrato?.lead?.email) {
    const { sendEmail } = await import('@/lib/resend-email')
    await sendEmail(pago.contrato.lead.email, `Recordatorio de pago - Vence en ${diasAntes} días`, `Te recordamos que tienes un pago pendiente de ${pago.monto} ${pago.moneda}.`, ctx.state.tenantId)
  }
  await ctx.log('send_payment_reminder', 'action', 'success', 'Recordatorio de pago enviado')
  return true
}

export async function adjustBudget(config: any, ctx: ActionContext): Promise<boolean> {
  const { budgetId, monto, tipo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const presupuesto = await tenantClient.presupuesto.findUnique({ where: { id: budgetId || ctx.state.budgetId } })
  const nuevoMonto = tipo === 'aumentar' ? (presupuesto?.monto || 0) + monto : (presupuesto?.monto || 0) - monto

  await tenantClient.presupuesto.update({ where: { id: budgetId || ctx.state.budgetId }, data: { monto: nuevoMonto } })
  await ctx.log('adjust_budget', 'action', 'success', `Presupuesto ajustado: ${tipo} ${monto}`)
  return true
}

export async function generateFinancialReport(config: any, ctx: ActionContext): Promise<boolean> {
  const { tipo, periodoInicio, periodoFin } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const ingresos = await tenantClient.pago.aggregate({
    where: { tenantId: ctx.state.tenantId, estado: 'completado', fechaPago: { gte: periodoInicio, lte: periodoFin } },
    _sum: { monto: true },
  })
  const gastos = await tenantClient.gasto.aggregate({
    where: { tenantId: ctx.state.tenantId, fecha: { gte: periodoInicio, lte: periodoFin } },
    _sum: { monto: true },
  })

  const reporte = {
    periodo: { inicio: periodoInicio, fin: periodoFin },
    ingresos: ingresos._sum.monto || 0, gastos: gastos._sum.monto || 0,
    balance: (ingresos._sum.monto || 0) - (gastos._sum.monto || 0),
    tipo, fechaGeneracion: new Date(),
  }

  await tenantClient.reporteFinanciero.create({
    data: { tenantId: ctx.state.tenantId, tipo, periodoInicio, periodoFin, datos: JSON.stringify(reporte) },
  })
  await ctx.log('generate_financial_report', 'action', 'success', 'Reporte financiero generado')
  return true
}
